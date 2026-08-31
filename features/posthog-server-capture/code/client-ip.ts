/**
 * The requesting client's IP, or null when it cannot be determined.
 *
 * Feed this to captureServer() as `clientIp` so PostHog geolocates the real
 * person instead of your serverless egress IP.
 *
 * x-real-ip is platform-set (Vercel and most proxies); the leftmost
 * x-forwarded-for entry is CLIENT-FORGEABLE, so the fallback takes the
 * RIGHTMOST entry, which the platform appends. Trusting the leftmost entry
 * would let a caller choose its own answer, which matters anywhere this IP is
 * used for geo, throttling, or abuse limits.
 */
export function clientIpFromHeaders(h: Headers): string | null {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = h.get("x-forwarded-for")?.split(",") ?? [];
  return forwarded[forwarded.length - 1]?.trim() || null;
}
