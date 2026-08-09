# Calendar-Aware Quiet Windows

> Browse stays live while commerce and notifications go dark during defined calendar windows, decided by a single fail-closed predicate consulted at both the render layer and the API layer.

<!-- Structure over skin: the value is the two-tier failure policy and the
single-predicate discipline, not the specific calendar the origin observed. -->

- **Slug:** `calendar-quiet-windows`
- **Tags:** `calendar, timezones, suppression, fail-closed, commerce, notifications, codegen`
- **Source project:** directory / marketplace web app
- **Stack:** Next.js 15 App Router + Prisma + Postgres
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live in prod

## Problem it solves
Some products serve audiences with recurring windows when commerce and outreach must stop: quiet hours, regional or religious holidays, maintenance windows. Hiding the whole product punishes browsers, so the rule is "browse stays live, commerce goes dark." Two things make this hard. First, the window is local to each entity or region, so the server clock is always the wrong clock. Second, the precise bounds come from a calendar authority (an API or a library on another calendar system), which can be down exactly when you need it, and whose dates can silently drift if hand-typed into content.

## When to reach for this
- Any "is X live right now" question that must be answered in an entity's local timezone, not the server's (store hours, happy-hour offers, regional promos).
- Commerce or notifications that must pause during defined calendar windows: quiet hours, regional holidays, maintenance windows, observance periods.
- Sends (email, push, cron outreach) that must never fire on certain calendar days, where a missed send is acceptable but a wrong send is not.
- Dates from a non-Gregorian or externally-authored calendar that appear in published content and must never go stale.

## How it works
- **One predicate decides.** `isQuietWindowNow(regionSlug)` fetches the precise start/end instants of the upcoming window from an external calendar API (server-side, Next `fetch` with `revalidate: 3600`) and answers whether now is inside. The render layer consults it to suppress CTAs (the content still renders, the action is hidden and clicks are not logged) and the API layer consults it again before logging clicks or sending. Never computed from local sunset or offset math.
- **Fail closed on the calendar, two ways.** If the window API is unreachable, the predicate falls back to a coarse weekly guard in the region's timezone that deliberately over-suppresses. If the date-converter API is unreachable, the notification path returns `"calendar-unavailable"` and the send is skipped entirely. Missing one send during an outage is acceptable; commerce or push inside the window is not.
- **Entity-local "active now."** `isWithinLocalWindow` layers three checks: absolute window (instants), recurring-weekday gate, and intra-day window with overnight support (`dailyStart > dailyEnd`). Local time comes from `Intl.DateTimeFormat` with `hourCycle: "h23"`, so DST and no-DST zones (America/Phoenix) are correct with no offset arithmetic.
- **Time-windowed offers on top of it.** The DB query narrows by status and absolute window; the in-process predicate applies the weekday and daily windows in each entity's timezone (`Entity.timezone`, derived from region config with a safe default). Newest qualifying offer wins. Every read tolerates the table not existing yet (Prisma P2021) so additive DDL lands on prod independently of the deploy.
- **Deterministic suppression rules.** The send date is converted to the external calendar via the provider's converter endpoint, then static month/day rules apply (full quiet days, a quiet season range). Because the rules are positional on the external calendar, there is nothing to maintain year to year.
- **Build-time date sync.** A script generates a committed dates file from a deterministic calendar library, and a `--check` mode runs in CI: byte-compare the committed file against a regeneration, and assert that hand-authored content still cites each event's `dateDisplay` verbatim. Published dates cannot drift.

## Data model
```
Deal    id   entityId   status ("ACTIVE"|...)   startsAt   endsAt
        recurringDays Int[]  (JS getDay convention, empty = every day)
        dailyStart "HH:MM"?  dailyEnd "HH:MM"?  (entity-local, overnight ok)
        title  description  discountType  discountValue  terms
        code (unique, trackable coupon)
Entity  id   city   timezone (IANA, nullable; derived from region config on read)
```
Quiet windows themselves have no rows: precise instants come from the calendar API at read time, and fixed dates live in the generated `CALENDAR_DATES` config. The hours wire format is a JSON array of per-day display strings on `Entity.hours` (Google Places `weekday_text` shape).

## Key decisions & gotchas
- **Suppress at render AND at API.** The origin shipped the CTA suppression in components and repeated the predicate in the click-logging and push routes. One layer alone leaks: render-only can be bypassed by a direct POST, API-only shows dead buttons.
- **Two failure policies in one feature, both deliberate.** The quiet-window and send paths fail CLOSED (over-suppress, skip the send). But inside `isWithinLocalWindow`, a bad timezone string fails OPEN: the absolute window already passed, so a config typo should not hide a live paid offer. Match the failure direction to which mistake costs more.
- **The coarse fallback is not an authoritative time.** It is a wide guard (in the origin, Friday evening to Saturday night) that exists only for outages, and it is expected to over-suppress. Do not present fallback bounds to users as real times.
- **`Intl` over offset math.** Hand-rolled UTC-offset arithmetic breaks on DST transitions and on zones that skip DST. `formatToParts` with `hourCycle: "h23"` is the whole timezone implementation.
- **Overnight daily windows.** `dailyStart > dailyEnd` means the window wraps midnight (`cur >= start || cur < end`). Easy to get wrong with a naive range check.
- **P2021 tolerance is a deploy strategy.** Reads degrading to "no active offer" when the table is missing lets the DDL and the code deploy independently. Only the table-missing code is swallowed; other errors still log.
- **Generated dates get sanity caps.** A per-event max-span assertion catches the year where an event on another calendar system occurs twice in one Gregorian year, which silently produces a months-long "window."
- **The prose check is the point of `--check`.** Freshness of the generated file is easy; the origin's incident risk was hand-authored pages (heavily cited by AI answer engines) quietly disagreeing with the generated dates. The check fails CI unless each listed content file cites the `dateDisplay` verbatim.
- **Deliberately not handled:** per-user quiet-hour overrides, multiple overlapping windows per region, and client-side countdown to window end (server decides, client renders the decision).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/hours.ts` | Hours wire-format parse/serialize + `isWithinLocalWindow`, the entity-local "active now" predicate (absolute + weekday + intra-day, overnight-safe) | none (pure, `Intl`) |
| `code/deals.ts` | Time-windowed offers: active-offer single + batch queries, timezone derivation with fallback chain, P2021-tolerant reads, trackable code generation | `@/lib/db` (Prisma), `@/config/regions` |
| `code/quiet-windows.ts` | Calendar API client: precise window instants per region + `isQuietWindowNow` with the fail-closed coarse guard | `@/config/regions`, provider base URL + response shape |
| `code/suppression.ts` | Deterministic send suppression by external-calendar date, fail closed on converter outage | converter URL + response shape |
| `code/sync-dates.mts` | Build-time date generation + `--check` freshness and prose-citation CI gate | your deterministic calendar library |
| `code/calendar-dates.generated.ts` | Example generated output (shape reference only) | regenerated, never edited |

## Structure to keep, skin to drop
- **Keep (the idea):** the single predicate consulted at both render and API layers; the split failure policy (fail closed on suppression, fail open on an entity timezone typo); `Intl`-based entity-local window math with overnight support; the three-layer window check (absolute, weekday, intra-day); P2021-tolerant reads as a deploy strategy; the generated-dates plus `--check` plus prose-citation discipline; render-still-shows-but-CTA-hides semantics.
- **Drop (regenerate natively):** the origin's specific window semantics (a weekly Friday-evening observance window) and its fallback bounds; the region/city config mapping; the hours wire format if you are not importing from Google Places; the coupon-code alphabet and discount label strings; provider URL and response field names, which are placeholders here.

## Adaptation notes
- Define your calendar authority twice: an API (or your own endpoint) returning precise window open/close instants per location, and a deterministic library for fixed dates. Swap `CALENDAR_API_BASE`, `CALENDAR_CONVERTER`, and the `@your/calendar-lib` import, then reshape the response interfaces to the provider's real contract.
- Create `@/config/regions` exporting `REGIONS` (slug, name, dbName), `REGION_GEO` (`{ lat, lng, tzid }` per slug), and `regionDbNames`. Set `FALLBACK_START` / `FALLBACK_END` in `code/quiet-windows.ts` to conservative bounds of YOUR window, and populate `FULL_QUIET_DAYS` / `QUIET_SEASON` in `code/suppression.ts` from your calendar authority.
- Prisma: add the `Deal` model (fields per Data model) and an `Entity.timezone` column; migrate. Keep the P2021 tolerance if you deploy DDL separately from code, delete it if you do not.
- Wire `isQuietWindowNow` into every surface that renders a commerce CTA and every API route that logs a conversion or sends a push. Wire `outreachSuppression` at the top of send crons.
- Add `dates:sync` / `dates:check` npm scripts and put `dates:check` in the build or CI pipeline. List every content file that cites a date in `CONTENT_CITATIONS`.
- Restyle all user-facing strings and cards natively (see Structure to keep, skin to drop).

## Provenance
- Origin files: `src/lib/hours.ts`, `src/lib/deals.ts`, `src/lib/shabbat-times.ts`, `src/lib/jewish-calendar.ts`, `scripts/holidays/sync-dates.mts`, `src/config/holiday-dates.generated.ts` @ 2026-08-08 (directory / marketplace web app, live in prod).
- Genericized for this library per its editorial convention: the origin is a religious-calendar feature (a weekly observance window plus holiday dates). Published here as the general calendar-aware quiet-window mechanism: observance-specific identifiers renamed to quiet-window vocabulary (window open/close, full quiet days, quiet season), calendar-provider names and product-specific config (billing constants, city map, blog/FAQ citation lists) removed or collapsed into generic placeholders. The control flow, timezone math, failure policies, and CI gate are intact.
- Related features: [[stripe-subscription-webhook]] (same P2021/additive-DDL tolerance discipline)
- Related memory: none

