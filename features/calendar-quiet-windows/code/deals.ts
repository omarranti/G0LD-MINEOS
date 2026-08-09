/**
 * Deals / time-windowed offers layer.
 *
 * Entities (directory listings, venues, vendors) post time-windowed offers to
 * drive traffic during slow hours. V1 deals are concierge-seeded via an admin
 * surface; claimed owners self-serve later.
 *
 * A deal is "active right now" when ALL of these hold:
 *   status === ACTIVE
 *   now within [startsAt, endsAt]                  (absolute campaign window)
 *   localWeekday in recurringDays (or recurringDays empty)
 *   local time within [dailyStart, dailyEnd] (or no daily window)
 * The weekday/time checks run in the ENTITY'S local timezone (Entity.timezone,
 * derived from the region config) via isWithinLocalWindow in ./hours.ts.
 *
 * Quiet-window suppression is handled at the render layer (isQuietWindowNow in
 * ./quiet-windows.ts): an active deal still RENDERS during a quiet window but
 * the CTA is suppressed and no click is logged. This module never suppresses;
 * it only answers "is this deal in its time window."
 *
 * Every read here tolerates the Deal table not existing yet (Prisma P2021) so
 * the additive DDL can land on prod independently of the deploy. Reads degrade
 * to "no active deal" rather than throwing.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { isWithinLocalWindow } from "./hours";
import { REGIONS, REGION_GEO, regionDbNames } from "@/config/regions";

export const DEFAULT_TIMEZONE = "America/New_York";

/** True for "this table does not exist yet" (DDL not applied in this env). */
function isMissingTable(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021"
  );
}

// ── Timezone derivation (city name -> region slug -> tzid) ───────────────────

/**
 * Resolve an IANA timezone for an entity from its city name. Matches
 * Entity.city against the REGIONS map (dbName/name) to find a slug, then
 * reads REGION_GEO[slug].tzid. Returns null when the city is unknown so
 * callers can detect un-backfilled rows; read paths fall back to
 * DEFAULT_TIMEZONE.
 */
export function deriveTimezoneForCity(city: string | null | undefined): string | null {
  const slug = regionSlugForCity(city);
  if (!slug) return null;
  return REGION_GEO[slug]?.tzid ?? null;
}

/**
 * Resolve a region slug from an entity's city name, or null when unknown.
 * Needed to look up quiet-window times (isQuietWindowNow) for deal CTA
 * suppression.
 */
export function regionSlugForCity(city: string | null | undefined): string | null {
  if (!city) return null;
  const needle = city.trim().toLowerCase();
  // Exact dbName/name match wins (keeps a sub-region on its own slug); metro
  // dbNames catch DB values with no dedicated entry.
  const match =
    REGIONS.find(
      (c) =>
        c.dbName.toLowerCase() === needle || c.name.toLowerCase() === needle,
    ) ??
    REGIONS.find((c) =>
      regionDbNames(c).some((dbCity) => dbCity.toLowerCase() === needle),
    );
  return match?.slug ?? null;
}

/** Effective timezone for window evaluation, with safe fallback. */
function effectiveTimezone(entity: { timezone?: string | null; city?: string | null }): string {
  return (
    entity.timezone ?? deriveTimezoneForCity(entity.city) ?? DEFAULT_TIMEZONE
  );
}

// ── Trackable coupon code generation ─────────────────────────────────────────

// Crockford-ish base32, no ambiguous chars (no I, L, O, U, 0, 1).
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Generate a random 8-char human-readable code (vary by salt for determinism). */
export function generateDealCode(salt: number): string {
  let out = "";
  let n = Math.abs((salt * 2654435761) ^ (salt << 13)) + 0x9e3779b9;
  for (let i = 0; i < 8; i++) {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    out += CODE_ALPHABET[n % CODE_ALPHABET.length];
  }
  return out;
}

/**
 * Generate a code not already present in the Deal table. The DB unique
 * constraint on Deal.code is the real guarantee; this just avoids most
 * collisions up front. Caller should still handle a P2002 on create.
 */
export async function generateUniqueDealCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateDealCode(attempt + Date.now());
    try {
      const existing = await prisma.deal.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!existing) return code;
    } catch (err) {
      // Table missing or transient -- fall back to the generated code and let
      // the create path enforce uniqueness.
      if (isMissingTable(err)) return code;
    }
  }
  // Extremely unlikely: append a time suffix as a last resort.
  return generateDealCode(Date.now()) + String(Date.now() % 100);
}

// ── Active-deal queries ──────────────────────────────────────────────────────

export type ActiveDeal = {
  id: string;
  entityId: string;
  title: string;
  description: string | null;
  discountType: string;
  discountValue: Prisma.Decimal | null;
  terms: string | null;
  code: string;
  endsAt: Date;
};

const ACTIVE_DEAL_SELECT = {
  id: true,
  entityId: true,
  title: true,
  description: true,
  discountType: true,
  discountValue: true,
  terms: true,
  code: true,
  startsAt: true,
  endsAt: true,
  recurringDays: true,
  dailyStart: true,
  dailyEnd: true,
} as const;

function toActiveDeal(row: {
  id: string;
  entityId: string;
  title: string;
  description: string | null;
  discountType: string;
  discountValue: Prisma.Decimal | null;
  terms: string | null;
  code: string;
  endsAt: Date;
}): ActiveDeal {
  return {
    id: row.id,
    entityId: row.entityId,
    title: row.title,
    description: row.description,
    discountType: row.discountType,
    discountValue: row.discountValue,
    terms: row.terms,
    code: row.code,
    endsAt: row.endsAt,
  };
}

/**
 * The single active deal for an entity right now, or null. Evaluates the
 * weekday/time window in the entity's local timezone. Newest active deal wins
 * if more than one qualifies.
 */
export async function getActiveDealForEntity(
  entityId: string,
): Promise<ActiveDeal | null> {
  const now = new Date();
  try {
    const rows = await prisma.deal.findMany({
      where: {
        entityId,
        status: "ACTIVE",
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      select: {
        ...ACTIVE_DEAL_SELECT,
        entity: { select: { timezone: true, city: true } },
      },
      orderBy: { startsAt: "desc" },
    });
    for (const row of rows) {
      const tz = effectiveTimezone(row.entity);
      if (
        isWithinLocalWindow({
          now,
          timezone: tz,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          recurringDays: row.recurringDays,
          dailyStart: row.dailyStart,
          dailyEnd: row.dailyEnd,
        })
      ) {
        return toActiveDeal(row);
      }
    }
    return null;
  } catch (err) {
    if (!isMissingTable(err)) {
      console.debug("[deals] getActiveDealForEntity failed", err);
    }
    return null;
  }
}

/**
 * Batch lookup of the active deal for a set of entity IDs. Returns a Map
 * entityId -> ActiveDeal. Entities without an active in-window deal are absent.
 */
export async function getActiveDealsByEntityIds(
  entityIds: string[],
): Promise<Map<string, ActiveDeal>> {
  const map = new Map<string, ActiveDeal>();
  if (entityIds.length === 0) return map;
  const now = new Date();
  try {
    const rows = await prisma.deal.findMany({
      where: {
        entityId: { in: entityIds },
        status: "ACTIVE",
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      select: {
        ...ACTIVE_DEAL_SELECT,
        entity: { select: { timezone: true, city: true } },
      },
      orderBy: { startsAt: "desc" },
    });
    for (const row of rows) {
      if (map.has(row.entityId)) continue;
      const tz = effectiveTimezone(row.entity);
      if (
        isWithinLocalWindow({
          now,
          timezone: tz,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          recurringDays: row.recurringDays,
          dailyStart: row.dailyStart,
          dailyEnd: row.dailyEnd,
        })
      ) {
        map.set(row.entityId, toActiveDeal(row));
      }
    }
  } catch (err) {
    if (!isMissingTable(err)) {
      console.debug("[deals] getActiveDealsByEntityIds failed", err);
    }
  }
  return map;
}

// ── Display helpers ──────────────────────────────────────────────────────────

/** Short human label for a deal's discount, e.g. "20% off", "$5 off", "BOGO". */
export function dealDiscountLabel(
  discountType: string,
  discountValue: Prisma.Decimal | number | null,
): string {
  const v =
    discountValue == null
      ? null
      : typeof discountValue === "number"
        ? discountValue
        : Number(discountValue);
  switch (discountType) {
    case "PERCENT":
      return v != null ? `${v}% off` : "Deal";
    case "AMOUNT":
      return v != null ? `$${v} off` : "Deal";
    case "FIXED_PRICE":
      return v != null ? `$${v}` : "Deal";
    case "BOGO":
      return "Buy one get one";
    default:
      return "Deal";
  }
}
