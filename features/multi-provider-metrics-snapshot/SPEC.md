# Multi-Provider Metrics Snapshot (null = unavailable, cron writes, pages read)

> An integrations dashboard over 6+ external APIs where any subset may be unconfigured or down: a daily cron fans out to every provider, writes one snapshot row to a KV table, and pages read the snapshot so a dead provider shows "connect" instead of a lying 0.

<!-- Structure over skin: the value is the nullable-slot contract and the cron/KV split, not the specific providers. -->

- **Slug:** `multi-provider-metrics-snapshot`
- **Tags:** `dashboard, integrations, cron, aggregation, kv-cache, resilience, vercel-cron, metrics`
- **Source project:** wellness web app (marketing site + team console)
- **Stack:** Next.js 15 App Router + Drizzle + Postgres + Vercel Cron; provider adapters over plain `fetch`
- **Reuse confidence:** drop-in (aggregator / snapshot / cron-auth shape; adapters swap per project)
- **Status in origin:** live in prod

## Problem it solves
A team overview page wants numbers from everywhere at once: first-party DB counts (waitlist), social scheduler (Buffer), transactional email (Mailgun), newsletter (Beehiiv), analytics (GA4), paid (Meta). Three failure modes kill the naive build. One: any single provider being down or unconfigured throws and blanks the whole dashboard. Two: rendering "0 subscribers" when the real fact is "we can't see the provider" makes the founder chase phantom regressions. Three: fanning out to six external APIs on every page load makes the hub slow and burns rate limits. This pattern fixes all three: per-provider error isolation, a type system that distinguishes "zero" from "unavailable", and a cron-written snapshot so page loads are a single DB read.

## When to reach for this
- Any internal dashboard/console aggregating 3+ third-party APIs where credentials arrive incrementally over the project's life (some providers wired, some planned).
- You have been burned by a dashboard 500ing because one provider changed its API, or by a "0" that was actually "no token configured".
- Page loads must be fast SSR; the data is fine being up to a day (or an hour) stale.
- You want to pre-wire adapters for providers you have NOT set up yet, so the dashboard lights up the day the env var lands, with no deploy.

## How it works
1. **Provider adapters, one file each.** Each adapter exports `fetch<X>Stats(): Promise<Stats | null>` (or a zeroed struct when creds are missing). Two representative shapes ship here: `mailgun-stats.ts` (configured provider: real fetch, per-domain try/catch accumulation) and `ga4-stats.ts` (gated provider: returns `null` until env vars exist, TODO body, so the snapshot and UI light up automatically once configured, without pulling in an uninstalled dependency).
2. **Aggregator fans out in parallel, isolates failures.** `computeMarketingMetrics()` runs first-party DB counts and all provider fetches under `Promise.all`, with each external call wrapped in `.catch(() => null)`. One dead provider degrades exactly one slot of the snapshot to `null`; everything else lands.
3. **The snapshot type makes absence first-class.** `MarketingSnapshot` declares every provider slot as `Thing | null`. `null` means "unavailable: not configured, or down", and the consuming UI renders a connect/setup state for it. Zero is a real number that only appears when the provider actually answered.
4. **Ambiguous empties get resolved explicitly.** Some APIs return `[]` both for "genuinely nothing" and "bad/missing token" (Buffer does). `getBufferSnapshot()` shows the disambiguation move: if scheduled AND sent are both empty, report `available: false` rather than zeros. Imperfect by design; see gotchas.
5. **Cron writes, pages read.** A Vercel Cron GET hits `/api/cron/marketing-snapshot` daily. The route recomputes the snapshot and upserts it into `team_state['marketing_snapshot']` (generic KV table, jsonb value, `updatedAt`). Overview pages call `readMarketingSnapshot()`: one indexed primary-key read, no live fan-out on request, and the `updatedAt` timestamp renders as "as of ..." so staleness is visible instead of silent.
6. **Cron auth is a bearer check.** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; the route compares against the env var and 401s otherwise. No secret configured means nothing runs (fail closed).

## Data model
```ts
// code/schema.ts (Drizzle slice)
team_state
  key         text PK        -- e.g. 'marketing_snapshot'
  data        jsonb          -- the whole MarketingSnapshot blob
  updated_at  timestamp      -- drives the "as of ..." label
```
One generic KV table for all cached console blobs; every new snapshot type is a new key, not a migration. The snapshot shape itself lives in TypeScript (`MarketingSnapshot`), not in SQL.

## Key decisions & gotchas
- **`null` is a load-bearing value, not a bug to paper over.** The entire pattern collapses if a UI dev "fixes" a null slot with `?? 0`. The contract is: null renders a connect state, numbers render numbers. Write that in the component, not just here.
- **`.catch(() => null)` per provider, not one try/catch around the fan-out.** A single wrapper turns "Meta is down" into "everything is down". Per-call catches give you partial snapshots, which is the whole point.
- **Cron-written KV over on-request fetching.** On-request fan-out was the origin's first version (see `marketing-snapshot.ts`, kept here for the live-read variant); it makes every page load pay the slowest provider's latency and hits rate limits under team usage. The cron/KV split makes reads O(1) and pins external API usage to once a day regardless of traffic.
- **The empty-vs-unconfigured heuristic has a known false negative.** Treating "both lists empty" as unavailable will mislabel a genuinely idle account as disconnected. Accepted in origin: a real account with zero scheduled AND zero recent sent posts is indistinguishable from a dead token through that API, and "connect" is the safer message than "0". If your provider exposes a cheap auth-check endpoint, use it instead.
- **Gated adapters return null early and keep heavy deps out.** `ga4-stats.ts` deliberately does NOT import `@google-analytics/data`; an uninstalled dependency inside an unused adapter must not fail the build. The import lands with the implementation, behind the env check.
- **Bearer-compare cron auth, fail closed.** `if (!secret) return false` means a missing CRON_SECRET disables the endpoint entirely instead of leaving it open. Note Vercel only attaches the header for crons defined in `vercel.json`; hitting the route manually requires the header.
- **The cron route returns 500 on compute failure on purpose,** so Vercel's cron dashboard shows the failure instead of a green check over a stale snapshot. The previous snapshot stays in the KV row untouched.
- **Deliberately not handled:** retries/backoff inside adapters (the next day's run is the retry), per-provider staleness tracking (one `updatedAt` covers the blob), history/time-series (the KV row is overwritten; add an append table if you need trends), and timezone-aware "last 7d" windows (UTC millisecond math).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/marketing-metrics.ts` | The aggregator: first-party DB counts + parallel provider fan-out with per-call `.catch(() => null)`, snapshot type with nullable slots, `write`/`read` helpers over the KV table | `@/lib/db`, `@/lib/schema`, the five adapter modules (swap for yours) |
| `code/marketing-snapshot.ts` | Live-read (request-time) variant for one provider, showing the `available: false` disambiguation for APIs whose empty response is ambiguous | `@/lib/buffer-graphql` (any list-returning provider fetcher) |
| `code/cron-route.ts` | `GET` handler: CRON_SECRET bearer auth -> compute -> upsert snapshot -> `{ok, generatedAt}` | `@/lib/marketing-metrics`, `CRON_SECRET` |
| `code/mailgun-stats.ts` | Representative configured adapter: env-gated, multi-domain accumulation, per-domain try/catch | `MAILGUN_API_KEY`, `MAILGUN_DOMAINS` |
| `code/ga4-stats.ts` | Representative gated adapter: typed interface + null-until-configured stub that keeps the heavy dependency uninstalled | `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_JSON`, later `@google-analytics/data` |
| `code/schema.ts` | Drizzle slice: `team_state` KV table | `drizzle-orm/pg-core` |

## Structure to keep, skin to drop
- **Keep (the idea):** the `Provider | null` snapshot contract and its "empty means unavailable, not zero" reading; per-provider `.catch(() => null)` isolation inside a `Promise.all` fan-out; the cron-writes / pages-read split with a generic jsonb KV table keyed by string; bearer-token cron auth that fails closed; the gated-adapter shape (typed interface now, null until env vars + dependency arrive); surfacing `updatedAt` as visible staleness.
- **Drop (regenerate natively):** the specific providers (Buffer/Mailgun/Beehiiv/GA4/Meta) and their stat shapes; the `waitlist` table and its 7d/24h windows (that is the origin's first-party metric, count whatever yours is); the snapshot key name; the daily cadence; the marketing framing entirely, the same shape serves an ops health board or a finance rollup.

## Adaptation notes
- Env: `CRON_SECRET` (Vercel generates one when a cron is configured, or set your own), plus whatever each adapter needs (`MAILGUN_API_KEY`, `MAILGUN_DOMAINS`, etc.). Every adapter must no-op cleanly when its creds are absent.
- Vercel: register the cron in `vercel.json`: `{"crons": [{"path": "/api/cron/marketing-snapshot", "schedule": "0 6 * * *"}]}`. Route stays `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`; set `maxDuration` above your slowest provider's worst case (origin used 60).
- DB: create `team_state` via your migration tool. If you already have a KV/cache table, point `writeMarketingSnapshot`/`readMarketingSnapshot` at it; the only requirements are string key, jsonb value, timestamp.
- Adapters: write one file per provider exporting a single typed fetch function. Copy `mailgun-stats.ts` for providers you have creds for, `ga4-stats.ts` for ones you plan to add. Keep return types honest: zeroed-struct if the API genuinely reported zeros, `null` if you could not ask.
- UI: the consuming page reads the snapshot, renders `null` slots as connect/setup cards, and shows `updatedAt`. Resist `?? 0`.
- If you need fresher-than-daily numbers for one provider, use the `marketing-snapshot.ts` live-read variant for just that card and leave the rest on the cron.

## Provenance
- Origin files: `therma-site/lib/marketing-metrics.ts`, `therma-site/lib/marketing-snapshot.ts`, `therma-site/app/api/cron/marketing-snapshot/route.ts`, `therma-site/lib/mailgun-stats.ts`, `therma-site/lib/ga4-stats.ts`, `therma-site/lib/schema.ts` (teamState slice), cron registration in `therma-site/vercel.json` @ 2026-08-08 (wellness web app, live).
- Genericized for this library: hardcoded brand sending domains in the Mailgun adapter replaced with a `MAILGUN_DOMAINS` env list; a founder name in the GA4 adapter comment neutralized; relative imports flattened to `@/lib/*`; brief comments added marking the two adapters as the "configured" and "gated" archetypes and flagging the per-call catch. Aggregation logic, snapshot types, and the cron handler are otherwise intact.
- Related features: [[dashboard-integrations-panel]], [[dashboard-app-shell]], [[first-party-engagement-counters]]
- Related memory: team console memory (the /team/ dashboard surface this feeds).
