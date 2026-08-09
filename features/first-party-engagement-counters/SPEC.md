# First-Party Engagement Counters (per-entity daily upsert)

> Anonymous, ad-blocker-proof engagement counting for directory entities: one DB row per entity per UTC day, written via sendBeacon so taps that navigate away still count, and degrading to a no-op until the table's DDL lands.

<!-- Structure over skin: the value is the one-row-per-entity-per-day upsert and the never-break-the-page delivery chain, not the four specific counters. -->

- **Slug:** `first-party-engagement-counters`
- **Tags:** `analytics, metrics, first-party, sendbeacon, prisma, vendor-dashboard, monetization`
- **Source project:** directory / marketplace web app
- **Stack:** Next.js 15 App Router + Prisma + Postgres
- **Reuse confidence:** drop-in
- **Status in origin:** live in prod (powers the paid vendor analytics tier)

## Problem it solves
A directory sells vendors on "N people viewed your listing, M tapped your phone number". Third-party analytics cannot honestly power that: ad blockers eat 20-40% of pings, the data lives in someone else's warehouse, and the interesting taps (tel: links, external website, directions) navigate away before a normal fetch completes. This module counts those four actions first-party, anonymously (no user id, no session, just an aggregate per entity per UTC day), with a delivery chain built so an engagement ping can never break the page and a schema rollout that cannot break the deploy.

## When to reach for this
- You need per-entity engagement numbers you can show back to the entity's owner (vendor dashboards, "your listing this month" emails, sponsor reporting).
- The actions you count include immediate-navigation taps (tel:, mailto:, external links, directions) where regular fetch gets killed mid-flight.
- You want counts that survive ad blockers and consent banners because they are anonymous aggregates, not behavioral tracking.
- You need the DDL to ship independently of the code (multiple environments, different databases, additive migrations landing at different times).

## How it works
- **Client** (`trackListingMetric`): fire-and-forget POST of `{metric}` to `/api/listings/[id]/track`. Prefers `navigator.sendBeacon` (survives page unload); falls back to `fetch` with `keepalive: true`; the whole thing is wrapped in try/catch and never throws.
- **Route**: validates id length and metric key against a whitelist, applies a per-IP-per-entity rate limit (30 requests / 10 min), then records. Returns **204 on accepted input even when the write is skipped**; only malformed input gets a 4xx.
- **Storage** (`recordListingMetric`): a Prisma `upsert` keyed on `@@unique([listingId, day])` where `day` is midnight UTC. `create` seeds the counter at 1, `update` does an atomic `{ increment: 1 }`. No read-modify-write race.
- **Read** (`getListingMetricsSummary`): last N days of rows plus totals, with a `collecting: boolean` flag so the dashboard can render a calm "warming up" state instead of an error when the table does not exist yet.
- **Rollout tolerance**: every DB call swallows Prisma `P2021` (table missing), so the additive DDL can land in each environment on its own schedule while the code is already deployed everywhere.

## Data model
```prisma
model ListingMetric {
  id             String   @id @default(cuid())
  listing        Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)
  listingId      String
  day            DateTime @db.Date   // UTC calendar day
  views          Int      @default(0)
  phoneTaps      Int      @default(0)
  websiteClicks  Int      @default(0)
  directionsTaps Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([listingId, day])
  @@index([day])
}
```
One row per (entity, UTC day). The `@@unique` is the upsert key and the entire integrity story.

## Key decisions & gotchas
- **sendBeacon first, keepalive fetch second.** A tel: tap unloads the page; a plain fetch dies with it. sendBeacon is queued by the browser past unload. The fetch fallback keeps `keepalive: true` for the same reason. Note sendBeacon sends a Blob with an explicit `application/json` type so the route's `req.json()` parses it.
- **One row per day, not one row per event.** Counters stay O(entities x days) instead of O(taps), reads are trivial range scans, and there is nothing personal to delete under privacy law. The trade: you can never join these counts to a person, session, or funnel. Origin hit exactly this wall and added a separate PostHog event for the one tap that needed funnel membership, keeping ListingMetric as the count of record.
- **Swallowing P2021 is a deploy-ordering decision.** Local dev and prod used different databases; the table existed in one before the other. Degrading to no-op (and `collecting: false` on read) means code and DDL ship independently and nothing 500s in between. The cost: a typo'd table name would also be silently swallowed, which is why writes log via `console.debug`.
- **204 even on skipped writes.** Junk listing ids (FK violation P2003), rate-limited clients, and missing tables all get 204. Tracking must never surface an error to a visitor, and a 4xx/5xx here would just teach retries.
- **Rate limit keyed `ip:entityId`** so one client cannot inflate a sponsor's numbers, generous enough (30 per 10 min) for real browsing across a listing's actions.
- **UTC day bucketing** keeps the unique key stable regardless of visitor timezone; render in the owner's timezone at display time if it matters.
- **Deliberately not handled:** dedupe of repeat taps by the same visitor within a day (anonymous by design means no visitor identity to dedupe on; the rate limit is the only inflation guard), bot filtering, and backfill.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/track-listing-metric.ts` | Client fire-and-forget ping: sendBeacon, keepalive fetch fallback, never throws | type import from the metrics module |
| `code/listing-metrics.ts` | Metric key whitelist + parse, UTC day bucketing, P2021-tolerant upsert write and windowed summary read | `@/lib/db` (Prisma client), `@prisma/client` |
| `code/route.ts` | `POST /api/listings/[id]/track`: validate, rate-limit, record, always 204 on accepted input | `@/lib/rate-limit` (see [[token-bucket-rate-limit]]) |
| `code/schema-slice.prisma` | The ListingMetric model, verbatim, plus the back-relation note | your entity model name |

## Structure to keep, skin to drop
- **Keep (the idea):** the (entity, UTC day) unique key with atomic increment upsert; the sendBeacon-then-keepalive-fetch delivery chain; the P2021 swallow + `collecting` flag for DDL-independent rollout; 204-on-skip; the per-IP-per-entity rate limit; the metric-key whitelist with a `METRIC_COLUMN` map so the API vocabulary and column names can differ.
- **Drop (regenerate natively):** the four counter names (`views`, `phoneTaps`, `websiteClicks`, `directionsTaps` are a restaurant directory's vocabulary; a job board wants `views`, `applyClicks`, `saveTaps`), the "Listing" entity naming throughout, the vendor dashboard that reads the summary, and the 30/10min limit values.

## Adaptation notes
- Rename `Listing`/`listingId` to your entity across all four files and the schema; keep the `@@unique([entityId, day])` shape.
- Prisma: paste the model, add the back-relation (`metrics ListingMetric[]`) on your entity, migrate. The P2021 tolerance means you can deploy code before DDL, but do not let that become permanent.
- Swap `@/lib/rate-limit` for your limiter ([[token-bucket-rate-limit]] matches the call signature: key, max, windowMs) and `@/lib/db` for your Prisma client export.
- Wire call sites: page mount for `view`, and the tap handlers for the navigation metrics; call `trackListingMetric` BEFORE the navigation happens.
- If you later need any of these actions inside a behavioral funnel, add a separate analytics event for that action rather than trying to make these rows join; see the origin's split in [[posthog-preinit-capture-buffer]].
- Behind a proxy, confirm `x-forwarded-for` holds the client IP (first entry); otherwise the rate limit collapses onto one key.

## Provenance
- Origin files: `src/lib/track-listing-metric.ts`, `src/lib/listing-metrics.ts`, `src/app/api/listings/[id]/track/route.ts`, `prisma/schema.prisma` (ListingMetric model) @ main, 2026-08-08 (directory / marketplace web app, live in prod). No brand tokens were present; code is verbatim, with the schema slice extracted into `code/schema-slice.prisma` plus a back-relation note.
- Related features: [[token-bucket-rate-limit]], [[posthog-preinit-capture-buffer]], [[posthog-server-capture]]
- Related memory: local vs prod databases differ (the P2021 rationale); save-flow and funnel-join limits of per-day counters.
