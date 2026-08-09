// Sliding-window rate limiter. Uses Upstash Redis when configured
// (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set) and falls back
// to an in-memory bucket per instance for local dev or unconfigured envs.
//
// The in-memory bucket is per-instance only -- on serverless (Vercel),
// each cold start gets a fresh Map so limits are approximate. Upstash is
// the source of truth in prod.

import { getUpstashLimiter } from "./upstash";

type Bucket = { timestamps: number[] };
const buckets = new Map<string, Bucket>();

function rateLimitInMemory(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= limit) {
    const retryAfterMs = windowMs - (now - bucket.timestamps[0]);
    buckets.set(key, bucket);
    return { ok: false, retryAfterMs };
  }
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { ok: true, retryAfterMs: 0 };
}

/**
 * Synchronous in-memory limiter. Preserved for callers that can't await.
 * New code should prefer rateLimitAsync.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterMs: number } {
  return rateLimitInMemory(key, limit, windowMs);
}

/**
 * Async limiter. Uses Upstash if configured; otherwise falls back to the
 * in-memory bucket. Recommended for all new rate-limited routes.
 */
export async function rateLimitAsync(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfterMs: number }> {
  const upstash = getUpstashLimiter(limit, windowMs);
  if (upstash) {
    try {
      const result = await upstash.limit(key);
      return {
        ok: result.success,
        retryAfterMs: result.success ? 0 : result.reset - Date.now(),
      };
    } catch {
      // Network or auth failure -- fall through to in-memory rather than
      // failing closed and locking out every request.
      return rateLimitInMemory(key, limit, windowMs);
    }
  }
  return rateLimitInMemory(key, limit, windowMs);
}
