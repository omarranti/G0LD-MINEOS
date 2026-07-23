# In-Memory Fixed-Window Rate Limit

> A tiny fixed-window rate limiter for API routes, keyed by a caller identifier
> (usually IP), with a helper to pull the client IP from request headers.

- **Slug:** `token-bucket-rate-limit`
- **Tags:** `infra`, `security`, `api`
- **Source project:** Therma
- **Stack:** framework-agnostic TypeScript (uses the Web `Request` type for the IP helper)
- **Reuse confidence:** adapt-the-shape (drop-in code, but read the serverless caveat first)
- **Status in origin:** live in prod

## Problem it solves
You want to throttle abusive callers on an endpoint (form posts, auth, an API) with
zero infrastructure, returning the standard limit/remaining/reset values so the
caller can set rate-limit headers or block.

## When to reach for this
- A single endpoint needs basic abuse protection and you do not want to stand up
  Redis/Upstash yet.
- You are on a long-lived server (one Node process), or you accept best-effort
  throttling on serverless.
- You need the standard `{ success, limit, remaining, resetAt }` shape.

## How it works
- A module-level `Map<identifier, { count, resetAt }>` holds counters.
- `checkRateLimit(id, { limit, windowSeconds })` is fixed-window: first hit in a
  window creates an entry with `resetAt = now + window`; subsequent hits increment;
  once `count >= limit` it returns `success: false` until the window expires, then
  the next call starts a fresh window.
- `getClientIdentifier(req)` reads `x-forwarded-for` (first IP) or `x-real-ip`
  (Vercel-provided), falling back to `"unknown"`.
- A `setInterval` sweeps expired entries every 5 minutes so the Map does not grow
  unbounded.

## Data model
In-memory only. A process-local `Map`. Nothing persisted.

## Key decisions & gotchas
- **Serverless statelessness is the headline caveat.** On Vercel/Lambda each cold
  instance has its own Map, and instances scale out, so the effective limit is
  `limit x number_of_live_instances` and resets on cold start. The source file says
  it plainly: "For production, consider using Redis or Upstash." Treat this as
  best-effort, not a hard guarantee.
- **Fixed window, not sliding/token-bucket.** Despite the slug, it is a fixed window,
  so it allows bursts at window boundaries (up to 2x limit across the seam).
- **`x-forwarded-for` is spoofable** unless your platform overwrites it. Behind a
  trusted proxy (Vercel) it is fine; exposed directly it is not.
- **`"unknown"` fallback shares one bucket** for all IP-less callers, which can throttle
  legitimate traffic together. Acceptable for the abuse case it targets.
- **The sweeper depends on a long-lived process.** On serverless the interval may never
  fire; expired entries are also lazily replaced on next access, so this is fine.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/rate-limit.ts` | Fixed-window counter + IP extraction helper | none (uses global `Map`, `Request`) |

## Adaptation notes
- Drop-in as-is for single-instance servers. For real distributed limits, keep the
  `checkRateLimit` signature and back it with Redis/Upstash `INCR` + `EXPIRE`.
- Tune the default `{ limit: 5, windowSeconds: 60 }` per route.
- Wire the result into response headers (`X-RateLimit-Remaining`, `Retry-After`).

## Provenance
- Origin file: `therma-site/lib/rate-limit.ts` @ `52f65787`
- Related features: [[ssrf-url-guard]], [[pin-auth-gate]]
