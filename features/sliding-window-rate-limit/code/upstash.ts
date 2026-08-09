import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

/**
 * Upstash Redis singleton + ratelimit helpers.
 *
 * Reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN. Both must be set
 * for Upstash to be active. If either is missing (local dev, build sandbox),
 * Redis is null and callers should fall back to the in-memory limiter.
 *
 * Why: Vercel serverless functions are stateless per-instance, so the
 * existing in-memory rate-limit Map() in src/lib/rate-limit.ts effectively
 * does nothing across cold starts. Upstash adds shared state without
 * adding a long-running process or self-hosted Redis.
 */

let _redis: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    _redis = null;
    return null;
  }
  _redis = new Redis({ url, token });
  return _redis;
}

/**
 * Sliding-window rate limiter against Upstash. Returns null if Upstash isn't
 * configured so callers can fall through to the in-memory limiter.
 *
 * Limiters are cached per (limit, windowMs) so we don't re-instantiate on
 * every request.
 */
const limiterCache = new Map<string, Ratelimit>();

export function getUpstashLimiter(
  limit: number,
  windowMs: number,
): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;

  const key = `${limit}:${windowMs}`;
  const cached = limiterCache.get(key);
  if (cached) return cached;

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
    analytics: false,
    prefix: "app:rl",
  });
  limiterCache.set(key, limiter);
  return limiter;
}
