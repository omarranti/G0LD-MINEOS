/**
 * Listing metrics -- first-party daily counters for the vendor analytics
 * surface (/business/[listingId]/analytics, Premium tier).
 *
 * One ListingMetric row per (listing, UTC day). Four counters:
 *   views          listing detail page loads
 *   phoneTaps      taps on the phone number
 *   websiteClicks  clicks on the website link
 *   directionsTaps taps on the directions link
 *
 * IMPORTANT: local dev and Vercel prod use DIFFERENT Neon databases, so
 * the ListingMetric table may not exist in a given environment until the
 * additive DDL has been applied there. Every function in this module
 * swallows table-missing errors (Prisma P2021) and degrades to a no-op /
 * empty result so the listing page and dashboard never break.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export const LISTING_METRIC_KEYS = [
  "view",
  "phone",
  "website",
  "directions",
] as const;

export type ListingMetricKey = (typeof LISTING_METRIC_KEYS)[number];

const METRIC_COLUMN: Record<ListingMetricKey, "views" | "phoneTaps" | "websiteClicks" | "directionsTaps"> = {
  view: "views",
  phone: "phoneTaps",
  website: "websiteClicks",
  directions: "directionsTaps",
};

export function parseMetricKey(input: unknown): ListingMetricKey | null {
  if (typeof input !== "string") return null;
  return (LISTING_METRIC_KEYS as readonly string[]).includes(input)
    ? (input as ListingMetricKey)
    : null;
}

/** Midnight UTC for "today" -- the bucket key for daily counters. */
function utcDayStart(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** True for "this table does not exist yet" (DDL not applied). */
function isMissingTable(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021"
  );
}

/**
 * Increment one daily counter. Best-effort by design: a metrics write must
 * never break a page or an API response. Foreign-key violations (junk
 * listing IDs) and a missing table are both swallowed.
 */
export async function recordListingMetric(
  listingId: string,
  metric: ListingMetricKey,
): Promise<void> {
  const column = METRIC_COLUMN[metric];
  const day = utcDayStart();
  try {
    await prisma.listingMetric.upsert({
      where: { listingId_day: { listingId, day } },
      create: { listingId, day, [column]: 1 },
      update: { [column]: { increment: 1 } },
    });
  } catch (err) {
    // P2021 = table missing (DDL not applied yet), P2003 = bad listingId.
    console.debug("[listing-metrics] write skipped", metric, err);
  }
}

export interface ListingMetricDay {
  day: Date;
  views: number;
  phoneTaps: number;
  websiteClicks: number;
  directionsTaps: number;
}

export interface ListingMetricsSummary {
  /** Daily rows in ascending date order. Days with no activity are absent. */
  days: ListingMetricDay[];
  totals: {
    views: number;
    phoneTaps: number;
    websiteClicks: number;
    directionsTaps: number;
  };
  /** False when the ListingMetric table doesn't exist in this database yet. */
  collecting: boolean;
}

/**
 * Read the last `windowDays` of counters for a listing. Returns an empty
 * summary with collecting=false when the table hasn't been created yet,
 * so the analytics page can show a calm "warming up" state.
 */
export async function getListingMetricsSummary(
  listingId: string,
  windowDays = 30,
): Promise<ListingMetricsSummary> {
  const since = utcDayStart();
  since.setUTCDate(since.getUTCDate() - (windowDays - 1));

  try {
    const rows = await prisma.listingMetric.findMany({
      where: { listingId, day: { gte: since } },
      orderBy: { day: "asc" },
      select: {
        day: true,
        views: true,
        phoneTaps: true,
        websiteClicks: true,
        directionsTaps: true,
      },
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.views += r.views;
        acc.phoneTaps += r.phoneTaps;
        acc.websiteClicks += r.websiteClicks;
        acc.directionsTaps += r.directionsTaps;
        return acc;
      },
      { views: 0, phoneTaps: 0, websiteClicks: 0, directionsTaps: 0 },
    );

    return { days: rows, totals, collecting: true };
  } catch (err) {
    if (!isMissingTable(err)) {
      console.debug("[listing-metrics] read failed", err);
    }
    return {
      days: [],
      totals: { views: 0, phoneTaps: 0, websiteClicks: 0, directionsTaps: 0 },
      collecting: false,
    };
  }
}
