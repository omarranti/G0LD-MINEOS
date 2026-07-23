/**
 * Google Calendar integration — scaffold only.
 *
 * Status: NOT WIRED. Phase 6 of the build prompt calls for a Google
 * Calendar sync, but the dashboard currently runs in demo mode (no
 * Supabase, no real user, no OAuth tokens), so a real sync would have
 * nothing to read or write against. This module documents the intended
 * shape of the integration so the wiring is a single edit when:
 *
 *   1. Supabase auth is live and there's a real `users` row.
 *   2. A `oauth_tokens` table exists for storing per-user GCal refresh
 *      tokens (or an equivalent secure store).
 *   3. The Google Cloud project has `https://www.googleapis.com/auth/
 *      calendar.events.readonly` and an OAuth consent screen approved.
 *
 * The intended flow:
 *   - User clicks "Connect Google Calendar" in /dashboard.
 *   - Server kicks off the OAuth dance via /api/integrations/gcal/start.
 *   - Google redirects back to /api/integrations/gcal/callback with a
 *     code; we exchange it, store the refresh token, and mark the
 *     account as connected.
 *   - A scheduled (or on-demand) sync calls `pullUpcomingEvents()` to
 *     populate the daily briefing in the Smart Tool.
 *
 * For now, every function in this module short-circuits with a typed
 * "not configured" result so callers compile and render UI but cannot
 * accidentally hit Google.
 */

export type GCalEvent = {
  id: string;
  summary: string;
  startsAt: string; // ISO 8601
  endsAt: string; // ISO 8601
  location?: string;
  attendees?: string[];
  hangoutLink?: string;
};

export type GCalConnectionStatus =
  | { state: "not_configured"; reason: string }
  | { state: "disconnected" }
  | { state: "connected"; email: string; lastSyncedAt: string | null };

export type GCalSyncResult =
  | { ok: false; reason: string }
  | { ok: true; events: GCalEvent[]; fetchedAt: string };

/**
 * Returns the current connection status for the active user. In demo
 * mode this always reports `not_configured` so the UI can show the
 * accurate "phase 6 integration not yet wired" callout.
 */
export async function getConnectionStatus(): Promise<GCalConnectionStatus> {
  if (!isConfigured()) {
    return {
      state: "not_configured",
      reason:
        "Google Calendar sync is scaffolded but not wired. Requires Supabase auth + a real OAuth flow."
    };
  }
  // Real implementation would query the oauth_tokens row for the
  // current user and return the most recent successful sync timestamp.
  return { state: "disconnected" };
}

/**
 * Pulls the next 24 hours of events for the connected user. In demo
 * mode this always returns an `ok: false` result with a clear reason
 * so the daily briefing can render an informative empty state instead
 * of pretending it tried.
 */
export async function pullUpcomingEvents(): Promise<GCalSyncResult> {
  if (!isConfigured()) {
    return {
      ok: false,
      reason:
        "Demo mode: Google Calendar is not wired. Connect Supabase + add OAuth credentials to enable."
    };
  }
  // Real implementation would:
  //   1. Look up the user's refresh token in oauth_tokens.
  //   2. Exchange it for an access token via google-auth-library.
  //   3. Hit https://www.googleapis.com/calendar/v3/calendars/primary/events
  //      with timeMin = now and timeMax = now + 24h.
  //   4. Map response.items into GCalEvent[] and return.
  return {
    ok: true,
    events: [],
    fetchedAt: new Date().toISOString()
  };
}

/**
 * True only when the env vars required for a real OAuth handshake are
 * all present. The UI uses this to gate the "Connect" button.
 */
export function isConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}
