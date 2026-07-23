# Dashboard Integrations Panel (Connect Your Tools)

> A "connect your tools" panel for a dashboard home that lists external
> connectors and their live connection state, with Google Calendar as the first
> connector. Shipped as a typed scaffold: the UI and the integration contract are
> real, the OAuth wiring is stubbed out so it renders in demo mode without
> touching Google.

- **Slug:** `dashboard-integrations-panel`
- **Tags:** `integrations`, `oauth`, `calendar`, `dashboard`
- **Source project:** Loft (personal OS dashboard)
- **Stack:** Next.js 15 (App Router, async server components) + Google Calendar API (intended)
- **Reuse confidence:** reference-only (the panel UI + status-pill pattern and the typed integration contract are drop-in; the actual OAuth handshake, token store, and event fetch are all unimplemented stubs you must build)
- **Status in origin:** prototype / scaffold (not wired, runs in demo mode)

## Problem it solves
A dashboard needs a single place that says, honestly, "here is what this app is
plumbed into and whether each connection is live." Instead of pretending an
integration works, the panel surfaces three explicit states (`not_configured`,
`disconnected`, `connected`) so the operator knows exactly what is scaffolded vs.
genuinely connected. It also defines the shape an integration must conform to, so
adding a second connector is a copy of the first.

## When to reach for this
- You are building a dashboard "Integrations" or "Connect your tools" card and
  want a clean list-of-connectors UI with a status pill per row.
- You want to ship the surface BEFORE the OAuth backend exists, with a typed
  contract that compiles and renders an accurate "not wired yet" state.
- You want one integration module shape that every future connector copies, so
  the connect/disconnect/sync surface stays uniform.

## How it works
- `IntegrationsPanel` is an async server component. It `await`s
  `getConnectionStatus()` for each connector (currently just Google Calendar) and
  renders a row: connector name, a one-line description, and a `<StatusPill>`.
- `StatusPill` maps the integration state to a color and a label via a
  `STATE_META` record: `not_configured` -> grey "scaffold", `disconnected` ->
  amber, `connected` -> emerald. This is the whole connect/disconnect visual
  language.
- `gcal.ts` defines the integration contract as a set of discriminated-union
  types (`GCalConnectionStatus`, `GCalSyncResult`, `GCalEvent`) plus three
  functions: `getConnectionStatus()`, `pullUpcomingEvents()`, and `isConfigured()`.
- `isConfigured()` is the gate: it returns true only when all three OAuth env
  vars are present. When false, every function short-circuits to a typed
  "not configured" result, so the UI renders but the code can never accidentally
  hit Google.
- The intended (documented but unimplemented) flow: user clicks Connect ->
  `/api/integrations/gcal/start` kicks off OAuth -> Google redirects to
  `/api/integrations/gcal/callback` with a code -> exchange it, store the refresh
  token, mark connected -> a sync calls `pullUpcomingEvents()` to read the next
  24h of events.

## Data model
Currently **stateless** in this scaffold (no rows are read or written). The module
documents the storage it WOULD need once wired:
- A `users` row (real authenticated user, intended via Supabase auth).
- An `oauth_tokens` table (or equivalent secure store) holding the per-user Google
  Calendar refresh token, plus a last-successful-sync timestamp.

`getConnectionStatus()` would query the `oauth_tokens` row for the active user and
return `{ state: "connected", email, lastSyncedAt }`; `pullUpcomingEvents()` would
read that refresh token, exchange it for an access token, and hit the Calendar API.

## Key decisions & gotchas
- **Token storage is the part that does not exist yet.** The whole "how do we keep
  a per-user refresh token securely and refresh the access token" problem is
  described in comments but not solved. When you wire it: refresh tokens are
  long-lived secrets, store them server-side (encrypted column or secret manager),
  never in a cookie or client.
- **Access-token refresh is on you.** The intended path exchanges the stored
  refresh token for a short-lived access token (via `google-auth-library`) on each
  sync. Handle the case where Google has revoked the refresh token: that should
  flip the connector back to `disconnected`, not crash the panel.
- **Env credentials gate everything.** `isConfigured()` requires
  `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and
  `GOOGLE_OAUTH_REDIRECT_URI`. Miss any one and the connector silently reports
  `not_configured` (by design, so a half-set environment fails safe rather than
  erroring).
- **What happens when not connected:** typed graceful degradation. `getConnectionStatus()`
  returns `not_configured`; `pullUpcomingEvents()` returns `{ ok: false, reason }`.
  Callers (e.g. a daily briefing) render an informative empty state instead of
  pretending a fetch happened. This is the main reason to copy the discriminated-union
  return shape rather than throwing.
- **Adding a second connector** means: add a sibling of `gcal.ts` exporting the
  same three-function contract, add one `<li>` row in `IntegrationsPanel` that
  `await`s its `getConnectionStatus()`, and reuse `StatusPill` as-is. The
  `IntegrationState` union and `STATE_META` are connector-agnostic.
- **Scope chosen** is `calendar.events.readonly` (read-only), narrowest scope for
  a "pull upcoming events into a briefing" use case. Widen only if you need writes.
- **Deliberately NOT handled:** the OAuth start/callback routes, the token table,
  multi-account, token encryption, and sync scheduling. All named, none built.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/IntegrationsPanel.tsx` | Async server component: connector list + per-row status pill. Renders connection state from `getConnectionStatus()`. | `./Card`, `@/lib/integrations/gcal` |
| `code/gcal.ts` | Google Calendar integration contract: connection-status / sync / event types, `getConnectionStatus()`, `pullUpcomingEvents()`, `isConfigured()` env gate. Stubbed (no real OAuth). | `process.env.GOOGLE_OAUTH_*`; (intended) `google-auth-library`, a token store |

## Adaptation notes
- The panel UI is genuinely drop-in: copy `IntegrationsPanel.tsx`, supply your own
  `Card` wrapper, and keep the `IntegrationState` / `STATE_META` / `StatusPill`
  trio. Tailwind classes use project tokens (`text-text`, `border-amber/40`,
  `text-emerald`); remap to your palette.
- To make Google Calendar real, supply Google OAuth credentials in env
  (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
  `GOOGLE_OAUTH_REDIRECT_URI`), set up an OAuth consent screen with the
  `calendar.events.readonly` scope, then implement the start + callback routes,
  the `oauth_tokens` store, and fill in the bodies of `getConnectionStatus()` and
  `pullUpcomingEvents()` where the comments mark the TODO.
- The strings reference Loft build phases ("phase 6", "Supabase auth") and an
  operator name; strip those from the descriptions for a different project.

## Provenance
- Origin files: `Loft/apps/web/src/components/dashboard/IntegrationsPanel.tsx`,
  `Loft/apps/web/src/lib/integrations/gcal.ts` @ `5a1adfb`
- Related features: none captured yet
- Related memory: `project_loft.md`
