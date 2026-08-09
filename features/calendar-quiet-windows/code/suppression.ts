/**
 * Calendar-driven "is today a day we must not send outreach" check.
 *
 * The notification rules make this a hard constraint: no sends during the
 * weekly quiet window, on full quiet days, or during the quiet season. All
 * external-calendar dates come from the calendar provider. We resolve the
 * send date to its external-calendar date via the provider's free converter
 * endpoint and apply deterministic rules, so there is nothing to maintain
 * year to year.
 *
 * Fail CLOSED: if we cannot resolve the calendar date, we suppress. Missing
 * one weekly send during a provider outage is acceptable; sending inside a
 * quiet window is not.
 */

const CALENDAR_CONVERTER = "https://calendar-provider.example.com/converter"; // swap for your provider

/// Full quiet days by external-calendar month -> days of that month.
/// (Half-observed intermediate days are intentionally absent -- sending is
/// fine on those.) Populate from your calendar authority; the shape below
/// mirrors the origin's data.
const FULL_QUIET_DAYS: Record<string, number[]> = {
  Month1: [1, 2, 10, 15, 16, 22, 23],
  Month7: [15, 16, 21, 22],
  Month9: [6, 7],
};

/// The quiet season: a solemn stretch on the external calendar during which
/// festive outreach is suppressed (month + inclusive day range).
const QUIET_SEASON = { month: "Month5", from: 1, to: 10 };

async function externalCalendarDate(date: Date): Promise<{ hm: string; hd: number } | null> {
  const gy = date.getUTCFullYear();
  const gm = date.getUTCMonth() + 1;
  const gd = date.getUTCDate();
  // Provider-specific query shape; swap for your converter's contract.
  const url = `${CALENDAR_CONVERTER}?cfg=json&gy=${gy}&gm=${gm}&gd=${gd}&g2h=1`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 12 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { hm?: unknown; hd?: unknown };
    if (typeof data.hm !== "string" || typeof data.hd !== "number") return null;
    return { hm: data.hm, hd: data.hd };
  } catch {
    return null;
  }
}

export type SuppressionReason =
  | null
  | "weekly-quiet"
  | "full-quiet-day"
  | "quiet-season"
  | "calendar-unavailable";

/**
 * Why (if at all) outreach should be suppressed on `date`. Returns null when
 * sending is permitted. Defaults to "now" so callers can pass nothing.
 */
export async function outreachSuppression(date = new Date()): Promise<SuppressionReason> {
  // Weekly quiet window: the origin's ran Friday sundown through Saturday
  // night. The recap cron runs on Sunday, but guard the civil weekend
  // defensively in case the schedule ever drifts. (UTC day: 5 = Friday,
  // 6 = Saturday.)
  const dow = date.getUTCDay();
  if (dow === 5 || dow === 6) return "weekly-quiet";

  const cal = await externalCalendarDate(date);
  if (!cal) return "calendar-unavailable"; // fail closed
  const { hm, hd } = cal;

  if (FULL_QUIET_DAYS[hm]?.includes(hd)) return "full-quiet-day";

  // The quiet season: no festive outreach for the configured stretch,
  // including the closing day even when its observance is deferred.
  if (hm === QUIET_SEASON.month && hd >= QUIET_SEASON.from && hd <= QUIET_SEASON.to) {
    return "quiet-season";
  }

  return null;
}
