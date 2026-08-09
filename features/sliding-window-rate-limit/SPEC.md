# Sliding-Window Rate Limit (Upstash-backed, serverless-safe)

> A rate limiter that actually holds up on serverless: Redis-backed sliding window
> when Upstash is configured, graceful per-instance in-memory fallback when it isn't.

- **Slug:** `sliding-window-rate-limit`
- **Tags:** `infra`, `security`, `api`, `serverless`, `redis`
- **Source project:** directory / marketplace web app
- **Stack:** TypeScript + `@upstash/redis` + `@upstash/ratelimit` (framework-agnostic; deployed on Vercel serverless)
- **Reuse confidence:** drop-in
- **Status in origin:** live in prod

## Problem it solves
On Vercel (and any serverless platform), an in-memory rate limiter is mostly
theater: every instance has its own Map, instances scale out, and cold starts
wipe the counters, so the effective limit is `limit x live_instances` and resets
constantly. This is the fix: a shared sliding-window counter in Upstash Redis
that all instances see, with a deliberate in-memory fallback so dev, preview,
and build environments work with zero configuration.

## When to reach for this
- Your rate-limited routes run on serverless (Vercel, Lambda) and the limit needs
  to actually hold across instances, not just per-process.
- You already have (or accept adding) an Upstash account. The REST API means no
  connection pooling, no long-lived socket, no self-hosted Redis.
- You want local dev and preview deploys to keep working without Redis creds,
  degrading to best-effort instead of erroring or failing closed.
- Contrast with [[token-bucket-rate-limit]], the simpler in-memory fixed-window
  module from the same library. That one is the right choice when you have zero
  infrastructure appetite, run a single long-lived process, or accept best-effort
  throttling (its SPEC documents the cold-start limitation plainly). Reach for
  this one the moment the limit is a real security or cost control on serverless:
  auth endpoints, expensive AI calls, scrape-prone public APIs.

## How it works
- `rateLimitAsync(key, limit, windowMs)` is the public entry point. It asks
  `getUpstashLimiter(limit, windowMs)` for a limiter; if one comes back it calls
  `limiter.limit(key)` and maps the result to `{ ok, retryAfterMs }` (with
  `retryAfterMs = reset - now` on rejection). If Upstash is not configured, or
  the Upstash call throws, it falls through to the in-memory path.
- **Gating is env-var presence.** `getRedis()` returns a memoized singleton only
  when both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set;
  otherwise it memoizes `null` and every caller takes the fallback. Configuration
  is deployment-time, not code-time.
- **Sliding window, not fixed.** The Upstash limiter uses
  `Ratelimit.slidingWindow(limit, windowMs)`, which weights the previous window,
  so there is no 2x burst at window seams. The in-memory fallback is also a true
  sliding window: a timestamp array per key, filtered to the window on each call,
  rejecting once `length >= limit` with `retryAfterMs` computed from the oldest
  timestamp.
- **Limiter instances are cached per `(limit, windowMs)` pair** in a module Map so
  hot routes do not re-instantiate `Ratelimit` on every request.
- A synchronous `rateLimit()` export preserves the old in-memory-only signature
  for call sites that cannot await; new code uses `rateLimitAsync`.

## Data model
No database tables. State lives in:
- Upstash Redis keys under the prefix `app:rl` (managed entirely by
  `@upstash/ratelimit`, self-expiring).
- A process-local `Map<string, { timestamps: number[] }>` for the fallback.
  Nothing persisted.

## Key decisions & gotchas
- **Fail open, deliberately.** If the Upstash call throws (network blip, bad
  token), the handler falls back to in-memory limiting rather than failing
  closed. Trade-off: a Redis outage weakens the limit to per-instance instead of
  locking out every legitimate request. For abuse throttling that is the right
  side to err on; for a hard billing quota it would not be.
- **Env presence is the only switch.** There is no config flag or constructor
  option. This keeps preview/build sandboxes (where secrets may be absent)
  working automatically, but it also means a typo'd env var name silently
  downgrades prod to in-memory. Verify the vars exist in the production
  environment after deploy.
- **The memoized `null` is per-process.** If envs are injected after module load
  (rare, but some test setups do it), `getRedis()` will have already cached
  `null`. Set envs before first import in tests.
- **The in-memory fallback has no sweeper.** Unlike [[token-bucket-rate-limit]],
  there is no `setInterval` cleanup; stale keys hold their (filtered) timestamp
  arrays until touched. Fine on serverless where instances are short-lived; on a
  long-lived server with high key cardinality, add a sweep or use the Upstash
  path.
- **`retryAfterMs` can be slightly negative** from the Upstash path if `reset`
  has just passed by the time the response is mapped. Clamp to 0 before putting
  it in a `Retry-After` header.
- **Key choice is the caller's job.** The module takes an opaque `key`; the origin
  keys by IP or by `userId:route`. Pair it with an IP-extraction helper like the
  one in [[token-bucket-rate-limit]] (`x-forwarded-for` caveats apply there).
- **Deliberately not handled:** per-route config registries, response-header
  wiring, analytics (Upstash `analytics: false` to avoid extra Redis commands),
  and multi-region consistency (Upstash sliding window is per-database).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/rate-limit.ts` | Public API: async Upstash-first limiter with in-memory sliding-window fallback, plus a sync in-memory-only export | `./upstash` (relative import, keep the pair together) |
| `code/upstash.ts` | Memoized Redis singleton gated on env vars + per-`(limit, windowMs)` cached `Ratelimit` factory | `@upstash/redis`, `@upstash/ratelimit`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |

## Structure to keep, skin to drop
- **Keep (the idea):** the two-tier design (shared Redis when configured, local
  fallback when not), env-presence gating with a memoized singleton, the
  fail-open catch around the Upstash call, sliding-window semantics in both
  tiers, the `{ ok, retryAfterMs }` return contract, and the limiter cache keyed
  by `(limit, windowMs)`.
- **Drop (regenerate natively):** the Redis key prefix (`app:rl`; namespace it
  per project), the sync `rateLimit()` export if you have no legacy sync call
  sites, and the comment referencing the origin file layout. There is no UI or
  styling in this pattern.

## Adaptation notes
- `npm i @upstash/redis @upstash/ratelimit`. Copy both files side by side; the
  relative `./upstash` import is the only internal dependency.
- Env: set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in production
  (Upstash console -> REST API). Leave them unset in dev/preview to get the
  fallback.
- Change the `prefix` in `code/upstash.ts` to a project-specific namespace so
  multiple apps can share one Upstash database.
- In route handlers: `const { ok, retryAfterMs } = await rateLimitAsync(key, 10,
  60_000); if (!ok) return new Response("Too many requests", { status: 429,
  headers: { "Retry-After": String(Math.max(0, Math.ceil(retryAfterMs / 1000))) } });`
- If you later want request-level analytics, flip `analytics: true` and accept
  the extra Redis command per check.

## Provenance
- Origin files: `src/lib/rate-limit.ts` and `src/lib/upstash.ts` @ 2026-08-08
  (directory / marketplace web app, live in prod). Genericized for this library:
  the Redis key prefix was changed from the product's namespace to the neutral
  placeholder `app:rl`. No other changes; control flow, comments, and signatures
  are verbatim.
- Related features: [[token-bucket-rate-limit]] (the simpler in-memory
  fixed-window module this complements)
- Related memory: none
