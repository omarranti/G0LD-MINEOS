# Admin Gate at the Edge (closing the RSC payload leak)

> Enforce an admin gate in Next.js middleware rather than in the admin layout,
> because a layout-level check controls what renders but still ships every admin
> page's data inside the RSC flight payload.

<!-- GUIDING PRINCIPLE: capture the STRUCTURE, not the skin. The reusable value is
the idea, the data model, the logic, the contracts, the flow. -->

- **Slug:** `admin-gate-edge-middleware`
- **Tags:** `security`, `auth`, `admin`, `middleware`, `edge-runtime`, `nextjs`, `app-router`, `data-leak`
- **Source project:** directory / marketplace web app
- **Stack:** Next.js 15 App Router + Edge middleware + WebCrypto
- **Reuse confidence:** drop-in (both files are dependency-light; swap the cookie name, the env var names, and the protected path prefix)
- **Status in origin:** live in prod, shipped as a security fix

## Problem it solves
An admin console was gated in `admin/layout.tsx`: the layout checked the PIN
cookie and rendered a login prompt instead of the console when it was missing.
That looks correct in a browser and is not. In the App Router, a layout does not
prevent its child page segments from executing. Next still runs those segments in
parallel and serializes their results into the RSC flight payload. A request with
no admin cookie got a rendered login screen and, in the same response body, the
serialized data of every admin page it navigated to.

The fix is to reject the request before any segment renders. That means
middleware, which forces the cookie verification into the Edge runtime, which in
turn forces a second implementation of the signature check that cannot use
`node:crypto`.

## When to reach for this
- You have any App Router surface gated by a check inside a layout or a server
  component, and the data behind it is not public.
- You are about to write "the layout redirects if not authed" and want to know why
  that is insufficient.
- You need the same signed-cookie scheme verified in two runtimes (Node for page
  guards and API routes, Edge for middleware) without the two drifting apart.
- You want an admin gate that fails closed on misconfiguration instead of 500ing
  every request.

## How it works
- **The signature scheme is shared, the implementations are not.** The cookie value
  is `HMAC-SHA256(secret, "admin-pin-gate:<pin>")` as hex. The Node module
  (`admin-pin-gate.ts`, not copied here) produces it with `createHmac`; the Edge
  module reproduces it with `crypto.subtle`. A parity unit test asserts the two
  agree, so the schemes cannot silently diverge.
- **Middleware runs the gate before anything renders.** On `/admin` and
  `/admin/*`, an invalid or missing cookie redirects to `/admin-access` with the
  original path preserved in `?next=`. No page segment executes, so nothing is
  serialized into a flight payload.
- **Ordering inside middleware is load-bearing.** The admin branch must run before
  the attribution branch, because attribution returns early when it stamps a
  cookie and would skip the gate entirely for a visitor arriving on an admin URL
  carrying utm params.
- **The layout check stays** as defense in depth. Removing it is not part of the fix.
- **Fail closed, deliberately differently in each runtime.** In production, the Node
  gate throws on a missing secret because that surfaces the misconfiguration loudly
  at the page level. The Edge gate returns `""` instead, so middleware redirects to
  the PIN page rather than turning every admin request into a 500.
- **Constant-time comparison is hand-rolled**, because `crypto.timingSafeEqual` is
  not available on Edge. Length mismatch returns false immediately.

## Data model
Stateless. One cookie:

| Cookie | Value | Notes |
|--------|-------|-------|
| `app_admin_pin` | HMAC-SHA256 hex of `admin-pin-gate:<pin>` | Never stores the raw PIN. Rotating `ADMIN_PIN` invalidates every existing cookie for free, since the expected value changes. |

Env vars: `ADMIN_PIN` (the shared PIN), `AUTH_SECRET` or `APP_ADMIN_PIN_SECRET`
(the HMAC key). Both have dev-only fallbacks and no production fallback.

## Key decisions & gotchas
- **A layout is not an authorization boundary in the App Router.** This is the
  whole entry. If you take one thing, take this. Page segments render in parallel
  with the layout, and their data lands in the RSC payload regardless of what the
  layout chose to display.
- **The Edge runtime cannot import `node:crypto` or `next/headers`.** Any shared
  helper that touches either one will fail to build the moment middleware imports
  it. That is why the cookie name is exported from the Edge module and re-exported
  by the Node one, rather than the other way around: the direction of the import
  keeps the Node-only dependencies out of the Edge bundle.
- **Two implementations of one scheme need a test that pins them together.** The
  parity test computes the expected value with `createHmac` and asserts the
  WebCrypto path produces the identical string. Without it, a future change to
  either file silently locks everyone out or silently accepts stale cookies.
- **Dev fallbacks must not exist in production.** A literal default secret in the
  repo means anyone reading it can forge a valid admin cookie. Both modules return
  null in production instead.
- **Deliberately not handled:** per-user admin identity, roles, audit logging, and
  rate limiting on the PIN entry form. This is a flat admin/not-admin gate for a
  known, small group. If you need to know *which* admin acted, this is the wrong
  pattern.

## Code layer

| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/admin-pin-edge.ts` | Edge-safe cookie verification: WebCrypto HMAC, constant-time compare, fail-closed config reads. The single source of the cookie name. | none (WebCrypto is global); env vars `ADMIN_PIN`, `AUTH_SECRET` / `APP_ADMIN_PIN_SECRET` |
| `code/middleware.ts` | The gate itself, plus the host-rewrite and attribution branches that show the required ordering. | `@/lib/attribution` (drop if unused), `@/lib/admin-pin-edge` |
| `code/admin-pin-edge.test.ts` | Parity test binding the Edge implementation to the Node one, plus fail-closed and tamper cases. | `vitest`, `node:crypto` (test-only) |

The Node-side counterpart (`admin-pin-gate.ts`) is not copied here; see
[[pin-auth-gate]] for a fuller PIN-gate implementation including scrypt hashing
and a DB override layer.

## Structure to keep, skin to drop
- **Keep (the idea):** the gate living in middleware, the HMAC-of-PIN cookie
  scheme, the two-runtime split with a parity test, the fail-closed-on-Edge
  divergence, the branch ordering inside middleware, and the `?next=` round-trip.
- **Drop (regenerate natively):** the `/admin-access` page itself (a PIN form,
  not copied here, rebuild it in the destination's design system), the
  `REVIEWS_HOSTS` rewrite branch (app-specific, kept only to show the ordering
  constraint), the attribution branch, and the cookie/env names.

## Adaptation notes
- Rename `ADMIN_PIN_COOKIE` from `app_admin_pin` to something namespaced to the
  destination app, and rename `APP_ADMIN_PIN_SECRET` to match.
- Change the protected prefix. The gate hardcodes `/admin`; if the console lives
  elsewhere, change both the `pathname` test and the redirect target.
- Check the `matcher`. It excludes `api/`, so API routes under the console are
  **not** covered by this gate and need their own check (in the origin app that is
  a separate `requireAdminAuth()` helper returning a `NextResponse`).
- If the destination has no attribution middleware, delete that branch and the
  `@/lib/attribution` import. If it has other middleware branches, put the admin
  gate before any of them that can return early.
- Port the parity test along with the code. It is the only thing keeping the two
  runtime implementations honest.
- Build the `/admin-access` PIN form natively. It needs to set the cookie to the
  value produced by the Node module and honor `?next=`.

## Provenance
- Origin file(s): `src/lib/admin-pin-edge.ts`, `src/middleware.ts`,
  `tests/unit/admin-pin-edge.test.ts` @ `0285711` (2026-08-29), "fix(security):
  enforce the admin PIN gate in middleware, closing the RSC data leak"
- Related features: [[pin-auth-gate]], [[members-access-code-gate]],
  [[utm-and-appstore-attribution]]
