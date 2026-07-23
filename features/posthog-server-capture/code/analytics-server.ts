/**
 * Server-side PostHog capture for events that happen where no browser is
 * present: Stripe webhooks, cron jobs, background tasks. Posts straight to the
 * PostHog HTTP capture endpoint using the SAME project key the client SDK
 * uses, with the user id as distinct_id, so a server event lands on the same
 * person timeline as that user's client-side events.
 *
 * Best-effort by design: analytics must never break a webhook or a cron. Every
 * failure path swallows and logs at debug level, and the request is bounded by
 * a short timeout so a slow analytics host can't stall the caller.
 */

const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/capture/";

export async function captureServer(
  distinctId: string,
  event: string,
  properties?: Record<string, string | number | boolean | null | undefined>,
): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return;

  try {
    await fetch(POSTHOG_CAPTURE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        // Tag server events so you can tell them apart from client SDK events.
        properties: { ...properties, $lib: "app-server" },
        timestamp: new Date().toISOString(),
      }),
      // Never let a slow analytics host stall the webhook/cron that called us.
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    console.debug("[analytics-server] capture failed", event, err);
  }
}
