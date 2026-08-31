# Location Provenance Resolver (the answer plus how much to trust it)

> Reconstruct a user's city from whatever signals they left behind, and ship the
> provenance alongside the answer so an inference can never be misread as a fact.

<!-- GUIDING PRINCIPLE: capture the STRUCTURE, not the skin. The reusable value is
the idea, the data model, the logic, the contracts, the flow. -->

- **Slug:** `location-provenance-resolver`
- **Tags:** `geo`, `location`, `personalization`, `data-quality`, `provenance`, `admin`, `confidence`, `derived-signals`
- **Source project:** directory / marketplace web app
- **Stack:** TypeScript, pure functions (no ORM, no framework imports)
- **Reuse confidence:** adapt-the-shape (the precedence ladder and the provenance-carrying return type are the value; the three specific sources are app-shaped)
- **Status in origin:** live in the internal admin console

## Problem it solves
The app deliberately never asks for location at signup, because a location field
costs signups. But almost every downstream question ("which cities should we
expand to", "who do we email about this city") needs a city per user.

The tempting move is to derive a `city` column from whatever is available and
read it as truth. That quietly destroys the distinction between a user who
*chose* their city and one whose city was guessed from two saved listings. In
the origin app the numbers were 4 of 29 stated versus 12 of 29 resolved, so
two thirds of the "known" cities were inferences. Flattening them into one field
would have made a 41% coverage number look like 100%.

The fix is to make provenance a first-class part of the return value, so the UI
is structurally unable to render an inference as a stated fact.

## When to reach for this
- You need a per-user attribute (city, timezone, language, industry) that you
  never explicitly collected, and must assemble it from behavioral leftovers.
- You are about to add a derived column to a users table and read it as truth
  later. Read the gotchas first.
- You have an internal console showing derived data and want the confidence
  visible next to the value rather than buried in a doc nobody opens.
- You want a coverage metric that honestly separates "we know" from "we guessed".

## How it works
- **A precedence ladder, declared sources first.** `stated` (the user picked it)
  beats `alert` (they subscribed to a city's notifications) beats `saves` (the
  modal city among their saved items). An inference can never outrank something
  the user actually said. New sources slot into the ladder by trust level, not by
  recency or convenience.
- **One return type carries value plus provenance plus a human detail.**
  `{ provenance, label, detail }`. The `detail` is the evidence in words
  ("3 of 5 saved"), so a reviewer can judge the answer without opening a query.
- **`none` is a real state, not null.** Users with no signal are counted, not
  dropped, which is what keeps the coverage bar honest.
- **Deterministic tie-breaking.** The modal-city computation breaks ties
  alphabetically. Without it the page (force-dynamic) flickers between two
  equally-common cities on every render.
- **Coverage is an aggregation over the same resolver**, not a separate query.
  `locationCoverage()` just counts provenances across resolved users, so the
  summary can never drift from the per-user answers.
- **Pure module by design.** No ORM and no `next/headers` imports, so the whole
  precedence ladder is unit-testable without a database.

## Data model
No new tables. The resolver reads three existing shapes and owns none of them:

```ts
interface UserLocationInput {
  preferredCitySlug: string | null;              // from onboarding quiz / account editor
  cityAlerts: { citySlug, cityName }[];          // notification subscriptions
  savedCities: { city, state }[];                // city of each saved listing
}
```

Output is `{ provenance: "stated" | "alert" | "saves" | "none", label, detail }`.

Deliberately **not** a denormalized `user.city` column. See gotchas.

## Key decisions & gotchas
- **Do not flatten provenance into a single column.** The moment the answer is a
  bare `city` string, every consumer reads it as stated fact, and there is no way
  to recover the distinction later. Carrying provenance in the type makes the
  weaker cases impossible to ignore at the call site.
- **A derived value computed at read time can be recomputed; a persisted one is a
  liability.** This resolver is a pure function over current data, so improving
  the ladder improves every historical user for free. If you persist instead, you
  own a backfill and a staleness problem.
- **Never backfill an inferred value into a declared field.** In the origin app a
  separate bug had been writing a server-side IP geolocation that resolved to the
  datacenter, producing a fabricated city for a subset of users. The decision was
  forward-only: fix the source, never retro-populate, and put a date floor on any
  historical breakdown. See [[posthog-server-capture]] for that failure mode.
- **The ladder can hide reachable signal.** Some cities only ever appear via
  alerts, so they are invisible to a "stated city" query even though the app
  knows about them. That is an argument for reporting coverage per provenance,
  not for promoting inferences.
- **Tie-breaks must be deterministic** on any surface that re-renders per request.
- **Deliberately not handled:** timezone inference, multi-city users (someone who
  genuinely splits time between two places resolves to one), and confidence as a
  numeric score. The four-level enum was chosen because it maps to something a
  human can act on; a 0.0-1.0 score would invite false precision.

## Code layer

| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/user-location.ts` | The whole pattern: precedence ladder, modal-city computation, per-user breakdown, and the coverage aggregator. | `@/lib/quiz-prefs` (only for `METRO_LABELS`, a slug to display-name map) |

The admin surfaces that consume it (a provenance badge, a coverage bar, a user
detail panel) are intentionally **not** included. They are skin.

## Structure to keep, skin to drop
- **Keep (the idea):** the precedence ladder ordered by trust, the
  `{ provenance, label, detail }` return type, `none` as a counted state, the
  deterministic tie-break, the coverage aggregator built on the same resolver,
  and the purity constraint that keeps it testable.
- **Drop (regenerate natively):** the three specific sources (yours will differ),
  the `PROVENANCE_LABEL` display strings, the `detail` copy, and every component
  that renders this. Rebuild the badge and coverage bar in the destination's
  design system. The origin's versions are Tailwind-token-coupled.

## Adaptation notes
- Replace the three input sources with whatever your app actually leaves behind.
  Keep them ordered declared-first; that ordering is the pattern.
- Swap `METRO_LABELS` for your own slug to display-name map, or drop it and use
  the slug directly.
- If you add an IP-derived source, put it **below** both declared sources, and
  read the datacenter-geolocation gotcha in [[posthog-server-capture]] before
  trusting a server-side IP at all.
- Port the tie-break. It looks cosmetic and is not, on any dynamic page.
- Widen `LocationProvenance` rather than adding a parallel boolean when you add a
  source. The exhaustive `Record<LocationProvenance, ...>` maps will then force
  every display site to handle it.

## Provenance
- Origin file: `src/lib/user-location.ts` @ `408c539` (2026-08-30), "Show where
  users are, and how much that answer can be trusted"
- Related features: [[posthog-server-capture]], [[profile-next-steps-engine]],
  [[ios-geo-anchor-city-snap]]
