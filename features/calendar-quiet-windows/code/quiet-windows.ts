/**
 * External calendar API client for the recurring quiet window.
 *
 * The origin used a free, public observance-calendar API (no key required)
 * that returns the precise local start/end instants of the upcoming weekly
 * quiet window per location. Swap the provider; keep the shape. We hit it
 * server-side and rely on Next.js fetch caching (1 hour TTL) so each region
 * only generates a few requests per day even at scale.
 */

import { REGION_GEO, type RegionGeo } from "@/config/regions";

const CALENDAR_API_BASE = "https://calendar-provider.example.com/windows"; // swap for your provider
const FETCH_REVALIDATE_SECONDS = 60 * 60; // 1 hour

interface CalendarLocation {
  title: string;
  city: string;
  tzid: string;
  latitude: number;
  longitude: number;
  cc: string;
  country: string;
}

interface CalendarItem {
  title: string;
  date: string;          // ISO date or datetime
  category: string;      // "window-open" | "window-close" | "anchor" | "holiday" | ...
  memo?: string;
  link?: string;
}

interface CalendarResponse {
  title: string;
  date: string;
  location: CalendarLocation;
  items: CalendarItem[];
  range?: { start: string; end: string };
}

export interface QuietWindowInfo {
  /** Display-friendly window start time, e.g. "7:01pm" */
  windowStartTime: string;
  /** Full ISO datetime for the window start */
  windowStartISO: string;
  /** Display-friendly date, e.g. "Friday, April 10" */
  windowStartDate: string;
  /** Display-friendly window end time, e.g. "8:00pm" */
  windowEndTime: string;
  /** Full ISO datetime for the window end */
  windowEndISO: string;
  /** Display-friendly date, e.g. "Saturday, April 11" */
  windowEndDate: string;
  /** Label for this occurrence (the provider's anchor item title) */
  anchorLabel: string;
  /** Provider link to read more about this occurrence */
  anchorLink?: string;
  /** Any holiday overlapping this window */
  holiday?: string;
  /** City + state from the provider */
  locationLabel: string;
}

function formatTimeFromTitle(title: string): string {
  // The provider returns titles like "Window opens: 7:01pm" or "Window closes: 8:00pm"
  const match = title.match(/(\d{1,2}:\d{2}\s*[ap]m)/i);
  return match ? match[1].toLowerCase().replace(/\s+/g, "") : title;
}

function formatDateLong(iso: string, tzid: string): string {
  // The provider returns ISO datetimes with offset; format in the region's timezone.
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: tzid,
  }).format(date);
}

/**
 * Fetch the upcoming quiet window for a region.
 * Returns null if the provider is unreachable or returns no usable data.
 */
export async function fetchQuietWindow(geo: RegionGeo): Promise<QuietWindowInfo | null> {
  const url = new URL(CALENDAR_API_BASE);
  url.searchParams.set("cfg", "json");
  url.searchParams.set("latitude", String(geo.lat));
  url.searchParams.set("longitude", String(geo.lng));
  url.searchParams.set("tzid", geo.tzid);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      next: { revalidate: FETCH_REVALIDATE_SECONDS },
      headers: { "User-Agent": "YourApp/1.0 (+https://your-app.example.com)" },
    });
  } catch (err) {
    console.error("[quiet-window] fetch failed", err);
    return null;
  }

  if (!res.ok) {
    console.error("[quiet-window] provider returned", res.status);
    return null;
  }

  const data = (await res.json()) as CalendarResponse;
  if (!data?.items?.length) return null;

  // Find the anchor item for the upcoming window. The provider returns at
  // most one anchor per call, so its index also anchors which window-open +
  // window-close items belong to it.
  const anchorIdx = data.items.findIndex((i) => i.category === "anchor");
  if (anchorIdx < 0) return null;
  const anchor = data.items[anchorIdx];

  // Strategy: items are chronologically sorted. The window-open that belongs
  // to this anchor is either:
  //   (a) the window-open item whose memo references this anchor by name, OR
  //   (b) the most recent window-open item appearing BEFORE the anchor in the array.
  // The window-close that belongs to this anchor is the next window-close AFTER it.
  const open =
    data.items.find((i) => i.category === "window-open" && i.memo === anchor.title) ??
    [...data.items.slice(0, anchorIdx)].reverse().find((i) => i.category === "window-open");

  const close = data.items.slice(anchorIdx).find((i) => i.category === "window-close");

  if (!open || !close) return null;

  // Optional: any holiday in this window (e.g. when the weekly window overlaps
  // a calendar holiday).
  const holiday = data.items.find((i) => i.category === "holiday");

  return {
    windowStartTime: formatTimeFromTitle(open.title),
    windowStartISO: open.date,
    windowStartDate: formatDateLong(open.date, geo.tzid),
    windowEndTime: formatTimeFromTitle(close.title),
    windowEndISO: close.date,
    windowEndDate: formatDateLong(close.date, geo.tzid),
    anchorLabel: anchor.title,
    anchorLink: anchor.link,
    holiday: holiday?.title,
    locationLabel: data.location.title,
  };
}

/** Convenience: fetch by region slug. */
export async function fetchQuietWindowForSlug(slug: string): Promise<QuietWindowInfo | null> {
  const geo = REGION_GEO[slug];
  if (!geo) return null;
  return fetchQuietWindow(geo);
}

// Coarse fallback bounds for the weekly quiet window, used only when the
// provider is down. The origin's window recurred from Friday evening to
// Saturday night; set these to conservative bounds of YOUR window.
const FALLBACK_START = { weekday: "Fri", fromHour: 18 }; // Friday from ~6pm
const FALLBACK_END = { weekday: "Sat", untilHour: 21 }; // Saturday until ~9pm

/**
 * True when `now` falls inside the quiet window for the given region. Used by
 * the deals layer to suppress commerce CTAs (the deal still renders; the "Get
 * this deal" action is hidden) per the personalization priority-1 rule.
 *
 * The precise window comes from the calendar provider (window open .. window
 * close), never from local sunset math. When the provider is unreachable, we
 * fail CLOSED with a coarse weekly guard in the region's timezone --
 * deliberately conservative (it may over-suppress on an outage) rather than
 * risk surfacing commerce during a quiet window. This fallback is NOT an
 * authoritative time.
 */
export async function isQuietWindowNow(
  regionSlug: string,
  now: Date = new Date(),
): Promise<boolean> {
  const info = await fetchQuietWindowForSlug(regionSlug);
  if (info) {
    const start = new Date(info.windowStartISO).getTime();
    const end = new Date(info.windowEndISO).getTime();
    const t = now.getTime();
    return t >= start && t <= end;
  }

  // Provider unavailable: coarse fail-closed guard.
  const tz = REGION_GEO[regionSlug]?.tzid ?? "America/New_York";
  let weekday = "";
  let hour = 0;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  } catch {
    return false;
  }
  if (weekday === FALLBACK_START.weekday) return hour >= FALLBACK_START.fromHour;
  if (weekday === FALLBACK_END.weekday) return hour < FALLBACK_END.untilHour;
  return false;
}
