/**
 * Generates src/config/calendar-dates.generated.ts from a deterministic
 * calendar library.
 *
 * Events on the external calendar sit on fixed dates in that system, so their
 * Gregorian dates are computed deterministically and offline (no network, no
 * hand-typed dates that can drift). Use the library published by the same
 * project as your calendar API provider so generated dates and API responses
 * agree.
 *
 *   npm run dates:sync -- 2026     # write the generated file for a year
 *   npm run dates:check            # verify the committed file is fresh +
 *                                  # content prose still cites the dates (CI)
 *
 * Convention: dateDisplay spans the event DAYS. The eve (sundown the night
 * before, when observance starts early) lives in eveDate and in the
 * hand-authored content prose.
 */
import { calendarEvents } from "@your/calendar-lib"; // swap: deterministic library from your calendar authority
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), "src/config/calendar-dates.generated.ts");
const YEAR = Number(process.argv.find((a) => /^\d{4}$/.test(a))) || 2026;
const CHECK = process.argv.includes("--check");

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Library event name -> our config slug. Eve events share a name and are
// filtered out of the day range (captured as eveDate instead).
const EVENT_TO_SLUG: Record<string, string> = {
  "Spring Festival": "spring-festival",
  "Early Summer Festival": "early-summer-festival",
  "Summer Fast": "summer-fast",
  "Autumn New Year": "autumn-new-year",
  "Day of Rest": "day-of-atonement",
  "Harvest Festival": "harvest-festival",
  "Winter Festival": "winter-festival",
};

// Sanity caps (days) to catch two occurrences of one event in a Gregorian year.
const MAX_SPAN: Record<string, number> = {
  "spring-festival": 8,
  "harvest-festival": 8,
  "winter-festival": 9,
  "autumn-new-year": 2,
  "early-summer-festival": 2,
  "quiet-season": 22,
};

const EXPECTED = [
  "spring-festival", "early-summer-festival", "summer-fast", "quiet-season",
  "autumn-new-year", "day-of-atonement", "harvest-festival", "winter-festival",
];

// Hand-authored content that cites the generated dates. The --check guard
// asserts each file still contains its event's dateDisplay verbatim, so a
// library correction or year roll cannot leave stale dates on a page AI
// answers cite (those pages amplify a stale date widely). When rolling a
// year, add that year's posts here.
const CONTENT_CITATIONS: Array<{ year: number; path: string; slugs: string[] }> = [
  { year: 2026, path: "content/blog/holiday-calendar-2026.md", slugs: ["spring-festival", "autumn-new-year", "winter-festival"] },
  { year: 2026, path: "content/blog/autumn-new-year-2026-whats-open.md", slugs: ["autumn-new-year"] },
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const minus1 = (d: Date) => {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  return x;
};
const localDate = (isoStr: string) => new Date(`${isoStr}T00:00:00`);
function display(start: Date, end: Date): string {
  const y = start.getFullYear();
  if (iso(start) === iso(end)) return `${MONTHS[start.getMonth()]} ${start.getDate()}, ${y}`;
  if (start.getMonth() === end.getMonth())
    return `${MONTHS[start.getMonth()]} ${start.getDate()}-${end.getDate()}, ${y}`;
  return `${MONTHS[start.getMonth()]} ${start.getDate()} - ${MONTHS[end.getMonth()]} ${end.getDate()}, ${y}`;
}

interface CalendarDate {
  startDate: string;
  endDate: string;
  eveDate: string;
  dateDisplay: string;
  gregorianYear: number;
}

async function main() {
  // The library returns every calendar event for the Gregorian year as
  // { name, isEve, date }. The origin's library exposed this via
  // basename()/getDesc()/getDate().greg(); adapt to your library's API.
  const events = calendarEvents({ year: YEAR });

  const dayDates: Record<string, Date[]> = {};
  const eveDates: Record<string, Date> = {};

  for (const ev of events) {
    const slug = EVENT_TO_SLUG[ev.name];
    if (!slug) continue;
    if (ev.isEve) {
      eveDates[slug] = ev.date;
      continue;
    }
    (dayDates[slug] ??= []).push(ev.date);
  }

  const rows: Record<string, CalendarDate> = {};
  const buildRow = (slug: string, dates: Date[], eve?: Date) => {
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    const cap = MAX_SPAN[slug] ?? 1;
    if (spanDays > cap)
      throw new Error(`"${slug}" spans ${spanDays}d (cap ${cap}) in ${YEAR}: possible double occurrence, check the year.`);
    rows[slug] = {
      startDate: iso(start),
      endDate: iso(end),
      eveDate: iso(eve ?? minus1(start)),
      dateDisplay: display(start, end),
      gregorianYear: start.getFullYear(),
    };
  };

  for (const slug of Object.keys(dayDates)) buildRow(slug, dayDates[slug], eveDates[slug]);

  // Derived multi-event span: the quiet season runs from the summer fast
  // through its closing day. Derived rows are built from already-generated
  // rows so they can never disagree with their endpoints.
  if (rows["summer-fast"]) {
    const seasonEnd = new Date(localDate(rows["summer-fast"].startDate));
    seasonEnd.setDate(seasonEnd.getDate() + 21);
    buildRow("quiet-season", [localDate(rows["summer-fast"].startDate), seasonEnd]);
  }

  for (const slug of EXPECTED) {
    if (!rows[slug])
      throw new Error(`Missing date for "${slug}": check EVENT_TO_SLUG against the library output for ${YEAR}.`);
  }

  const ordered = Object.entries(rows).sort((a, b) => a[1].startDate.localeCompare(b[1].startDate));
  const body = ordered
    .map(
      ([slug, r]) =>
        `  ${JSON.stringify(slug)}: { startDate: ${JSON.stringify(r.startDate)}, endDate: ${JSON.stringify(r.endDate)}, eveDate: ${JSON.stringify(r.eveDate)}, dateDisplay: ${JSON.stringify(r.dateDisplay)}, gregorianYear: ${r.gregorianYear} },`
    )
    .join("\n");
  const content = `// AUTO-GENERATED by scripts/calendar/sync-dates.mts. Do not edit by hand.
// Source: deterministic calendar library, Gregorian year ${YEAR}.
// dateDisplay spans the event days; the eve (sundown before) is in eveDate.
// Regenerate: npm run dates:sync -- ${YEAR}   |   Verify: npm run dates:check

export interface CalendarDate {
  startDate: string;
  endDate: string;
  eveDate: string;
  dateDisplay: string;
  gregorianYear: number;
}

export const CALENDAR_DATES: Record<string, CalendarDate> = {
${body}
};
`;

  if (!CHECK) {
    writeFileSync(OUT, content);
    console.log(`Wrote ${OUT} (${Object.keys(rows).length} events, ${YEAR}).`);
    return;
  }

  // --check: committed file must be fresh, and content prose must still cite
  // the dates verbatim.
  const existing = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (existing !== content) {
    console.error(`✗ src/config/calendar-dates.generated.ts is stale. Run: npm run dates:sync -- ${YEAR}`);
    process.exit(1);
  }

  let failed = false;
  for (const { year, path, slugs } of CONTENT_CITATIONS) {
    if (year !== YEAR) continue;
    const p = join(process.cwd(), path);
    if (!existsSync(p)) continue;
    const md = readFileSync(p, "utf8");
    for (const slug of slugs) {
      const r = rows[slug];
      if (!r) continue;
      if (!md.includes(r.dateDisplay)) {
        console.error(`✗ ${path}: must cite "${r.dateDisplay}" (${slug}) verbatim. Fix the date to match the generated calendar.`);
        failed = true;
      }
    }
  }

  if (failed) process.exit(1);
  console.log(`✓ Calendar dates fresh + content prose consistent (${YEAR}, ${EXPECTED.length} events).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
