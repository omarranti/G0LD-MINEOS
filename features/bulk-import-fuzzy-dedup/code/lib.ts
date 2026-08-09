/**
 * Shared helpers for the bulk-import acquisition pipeline. Run agent-side via
 * `npx tsx`; never imported by app code.
 */
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.join(__dirname, "..", "..");
export const ACQ = path.join(ROOT, "data", "acquisition");

export interface SourceRecord {
  name: string;
  type: string;
  address?: string;
  city: string;
  state: string;
  postalCode?: string;
  phone?: string;
  website?: string;
  latitude?: number | null;
  longitude?: number | null;
  /** Primary source authority (certifying agency, license board, registry...). */
  authority: string;
  authorityName?: string;
  /** Domain-specific boolean attributes; OR-merged across sources. Rename per domain. */
  attrA?: boolean;
  attrB?: boolean;
  sourceUrl?: string;
  sourceId?: string;
}

export interface MergedRecord extends SourceRecord {
  source: string;
  cityDbName: string;
  cityMapped: boolean;
  slug: string;
  provenance: Array<{ source: string; sourceUrl?: string; sourceId?: string }>;
}

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

export function isUsState(s: string): boolean {
  return US_STATES.has((s || "").trim().toUpperCase());
}

/** Mirror of the destination importer's slugify so dedup keys line up. */
export function slugify(name: string, city: string): string {
  return `${name} ${city}`
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Generic filler words plus entity-type words. Add your vertical's qualifier
// words here (the adjectives every listing name in your niche repeats).
const NAME_STOPWORDS = new Set([
  "the", "restaurant", "cafe", "grill", "llc", "inc",
  "co", "and", "of",
]);

/** Aggressive name normalization for cross-source matching (not display). */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !NAME_STOPWORDS.has(t))
    .join(" ");
}

export function nameTokens(name: string): Set<string> {
  return new Set(normalizeName(name).split(" ").filter(Boolean));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** 10-digit phone key, or null when not a full US number. */
export function phoneKey(phone?: string | null): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length === 10 ? digits : null;
}

/** Street number + zip5. Weak alone; combined with name similarity. */
export function addrKey(address?: string | null, postalCode?: string | null): string | null {
  const streetNum = (address || "").trim().match(/^(\d+)/)?.[1];
  const zip = (postalCode || "").trim().match(/^(\d{5})/)?.[1];
  return streetNum && zip ? `${streetNum}|${zip}` : null;
}

const CITY_ABBREV: Array<[RegExp, string]> = [
  [/^n\.?\s+/i, "North "],
  [/^s\.?\s+/i, "South "],
  [/^e\.?\s+/i, "East "],
  [/^w\.?\s+/i, "West "],
  [/^ft\.?\s+/i, "Fort "],
  [/^st\.?\s+/i, "Saint "],
  [/^mt\.?\s+/i, "Mount "],
];

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export interface CityAlias {
  dbName: string;
  state: string;
}

export function loadCityAliases(): Record<string, CityAlias> {
  const p = path.join(ACQ, "config", "city-aliases.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * Map a raw scraped city to the canonical dbName. Returns the canonical city
 * (mapped=true) or a cleaned title-case fallback (mapped=false) that still
 * imports fine; it just has no hub page yet.
 */
export function normalizeCity(
  rawCity: string,
  state: string,
  aliases: Record<string, CityAlias>,
): { city: string; mapped: boolean } {
  let c = (rawCity || "").trim().replace(/\s+/g, " ");
  for (const [re, sub] of CITY_ABBREV) c = c.replace(re, sub);
  const key = `${c.toLowerCase()}|${state.toUpperCase()}`;
  const hit = aliases[key];
  if (hit) return { city: hit.dbName, mapped: true };
  return { city: titleCase(c), mapped: false };
}

export function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function writeJson(p: string, data: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 1));
}

export function csvEscape(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
