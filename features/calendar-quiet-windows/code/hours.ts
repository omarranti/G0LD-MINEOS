/**
 * Hours of operation -- shared utility.
 *
 * Stored in the database as Entity.hours (String? @db.Text) containing a
 * JSON array of display strings, one per day:
 *
 *   ["Monday: 9:00 AM – 9:00 PM", "Tuesday: 9:00 AM – 9:00 PM", ..., "Sunday: Closed"]
 *
 * This format exists because the original import was Google Places, which
 * already provides `weekday_text` in that exact shape. Keeping the wire
 * format means existing data stays readable and the public hours display
 * card works unchanged.
 *
 * The admin editor works with a structured day-open-close representation
 * (DayHours[]) and serializes it via structuredToStrings() before save.
 */

export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type DayName = (typeof DAYS)[number];

export interface DayHours {
  day: DayName;
  closed: boolean;
  /** "HH:MM" 24h format (e.g. "09:00"). Empty when closed. */
  open: string;
  /** "HH:MM" 24h format. Empty when closed. */
  close: string;
}

/** Default schedule: everything closed -- caller picks which days to set. */
export function emptyStructuredHours(): DayHours[] {
  return DAYS.map((day) => ({ day, closed: true, open: "", close: "" }));
}

/** Parse "9:00 AM" or "21:00" into a 24h "HH:MM" string. Returns "" on failure. */
function parseTimeTo24h(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // 24h "HH:MM"
  const h24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) {
    const h = parseInt(h24[1], 10);
    const m = parseInt(h24[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  // 12h with AM/PM: "9:00 AM", "12:30 PM"
  const h12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (h12) {
    let h = parseInt(h12[1], 10);
    const m = parseInt(h12[2], 10);
    const ampm = h12[3].toUpperCase();
    if (h === 12) h = 0;
    if (ampm === "PM") h += 12;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  // Bare hour: "9 AM", "12 PM"
  const bareH12 = trimmed.match(/^(\d{1,2})\s*(AM|PM)$/i);
  if (bareH12) {
    let h = parseInt(bareH12[1], 10);
    const ampm = bareH12[2].toUpperCase();
    if (h === 12) h = 0;
    if (ampm === "PM") h += 12;
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, "0")}:00`;
  }

  return "";
}

/** Format a 24h "HH:MM" back to a display string like "9:00 AM". */
export function formatDisplayTime(hhmm: string): string {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return "";
  const h24 = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${min} ${ampm}`;
}

/**
 * Parse a single display string ("Monday: 9:00 AM – 9:00 PM" or
 * "Sunday: Closed") into a structured DayHours row.
 */
function parseDisplayLine(line: string): DayHours | null {
  const colonIdx = line.indexOf(":");
  if (colonIdx < 0) return null;
  const dayPart = line.slice(0, colonIdx).trim();
  const rest = line.slice(colonIdx + 1).trim();
  if (!DAYS.includes(dayPart as DayName)) return null;
  const day = dayPart as DayName;

  if (rest.toLowerCase().includes("closed")) {
    return { day, closed: true, open: "", close: "" };
  }

  // Split on any dash variant: – — - separated by optional whitespace.
  const parts = rest.split(/\s*[–—-]\s*/).map((p) => p.trim());
  if (parts.length < 2) {
    return { day, closed: true, open: "", close: "" };
  }

  const open = parseTimeTo24h(parts[0]);
  const close = parseTimeTo24h(parts[1]);
  if (!open || !close) {
    return { day, closed: true, open: "", close: "" };
  }

  return { day, closed: false, open, close };
}

/**
 * Parse the wire format (JSON string[]) into 7 structured rows.
 * Returns a full week with missing days defaulting to closed.
 */
export function parseStructuredHours(wire: string | null | undefined): DayHours[] {
  const base = emptyStructuredHours();
  if (!wire) return base;

  let lines: string[];
  try {
    const parsed = JSON.parse(wire);
    if (!Array.isArray(parsed)) return base;
    lines = parsed.filter((l): l is string => typeof l === "string");
  } catch {
    return base;
  }

  for (const line of lines) {
    const day = parseDisplayLine(line);
    if (day) {
      const idx = DAYS.indexOf(day.day);
      if (idx >= 0) base[idx] = day;
    }
  }
  return base;
}

/**
 * Serialize structured hours back to the wire format (JSON array of
 * display strings). Returns null if every day is closed (so the column
 * is stored as NULL instead of a useless "all closed" blob).
 */
export function structuredToStrings(hours: DayHours[]): string | null {
  const lines: string[] = [];
  let anySet = false;
  for (const row of hours) {
    if (row.closed) {
      lines.push(`${row.day}: Closed`);
    } else if (row.open && row.close) {
      lines.push(
        `${row.day}: ${formatDisplayTime(row.open)} – ${formatDisplayTime(row.close)}`,
      );
      anySet = true;
    } else {
      lines.push(`${row.day}: Closed`);
    }
  }
  if (!anySet) return null;
  return JSON.stringify(lines);
}

/** "HH:MM" 24h -> minutes since local midnight, or null if malformed. */
function hhmmToMinutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

// JS getDay() convention: 0 = Sunday .. 6 = Saturday.
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * True when `now` falls inside a deal's time window, evaluated in the given
 * IANA timezone. Used by the deals layer (./deals.ts) to decide whether an
 * ACTIVE deal is live right now.
 *
 * The check is, in order:
 *   1. absolute window: startsAt <= now <= endsAt (compared as instants)
 *   2. weekday gate: local weekday in recurringDays (empty = every day)
 *   3. intra-day window: local time within [dailyStart, dailyEnd) (null = all day),
 *      supporting overnight windows where dailyStart > dailyEnd.
 *
 * Timezone math uses Intl (hourCycle h23) so DST and no-DST zones (e.g.
 * America/Phoenix) are correct without hand-rolled offset arithmetic.
 */
export function isWithinLocalWindow(opts: {
  now: Date;
  timezone: string;
  startsAt: Date;
  endsAt: Date;
  recurringDays: number[];
  dailyStart: string | null;
  dailyEnd: string | null;
}): boolean {
  const { now, timezone, startsAt, endsAt, recurringDays, dailyStart, dailyEnd } =
    opts;

  if (now < startsAt || now > endsAt) return false;

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    // Bad timezone string -- the absolute window already passed, so allow it
    // rather than hiding a live deal over a config typo.
    return true;
  }

  const wdName = parts.find((p) => p.type === "weekday")?.value ?? "";
  const weekday = WEEKDAY_INDEX[wdName];
  if (weekday === undefined) return true;

  if (recurringDays.length > 0 && !recurringDays.includes(weekday)) {
    return false;
  }

  if (dailyStart && dailyEnd) {
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(
      parts.find((p) => p.type === "minute")?.value ?? "0",
      10,
    );
    const cur = hour * 60 + minute;
    const start = hhmmToMinutes(dailyStart);
    const end = hhmmToMinutes(dailyEnd);
    if (start === null || end === null) return true; // malformed -> don't over-restrict
    if (start <= end) return cur >= start && cur < end;
    return cur >= start || cur < end; // overnight window
  }

  return true;
}
