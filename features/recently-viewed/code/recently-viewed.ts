/**
 * Recently-viewed listing tracker — pure client-side, localStorage-backed.
 *
 * Anonymous-friendly (no auth needed) and private (data never leaves the
 * device). Used by the listing card click handler and the listing detail
 * page to record visits, and by the /account "Recently viewed" panel to
 * read them back.
 */

const STORAGE_KEY = "kc_recently_viewed_v1";
const MAX_ENTRIES = 24;

export interface RecentlyViewedEntry {
  id: string;
  slug: string;
  name: string;
  city: string;
  viewedAt: string; // ISO timestamp
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readAll(): RecentlyViewedEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentlyViewedEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof e.id === "string" &&
        typeof e.slug === "string" &&
        typeof e.name === "string" &&
        typeof e.viewedAt === "string",
    );
  } catch {
    return [];
  }
}

function writeAll(entries: RecentlyViewedEntry[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* quota exceeded — silently drop */
  }
}

/**
 * Record a listing visit. De-dupes by id, moves the entry to the front,
 * and trims to MAX_ENTRIES.
 */
export function trackRecentlyViewed(listing: Omit<RecentlyViewedEntry, "viewedAt">): void {
  if (!isBrowser()) return;
  const existing = readAll().filter((e) => e.id !== listing.id);
  const next: RecentlyViewedEntry[] = [
    { ...listing, viewedAt: new Date().toISOString() },
    ...existing,
  ].slice(0, MAX_ENTRIES);
  writeAll(next);
}

export function getRecentlyViewed(): RecentlyViewedEntry[] {
  return readAll();
}

export function clearRecentlyViewed(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
