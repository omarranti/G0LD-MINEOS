# Members Access-Code Gate

> A private-site entry gate: a code-entry screen that auto-submits a code passed in
> the URL, backed by a server action that verifies invite codes, throttles brute
> force with a signed cookie, and issues an HMAC session on success.

- **Slug:** `members-access-code-gate`
- **Tags:** `access`, `gate`, `privacy`, `auth-lite`
- **Source project:** Momentum Motorcars
- **Stack:** Next.js 15 App Router + Server Actions (cookies, redirect)
- **Reuse confidence:** adapt-the-shape (Gate.tsx + the action are reusable; the codes and session libs are project-specific)
- **Status in origin:** built, private members site (not yet deployed)

## Problem it solves
You want to put a whole site behind a shared or invite code without standing up real
user accounts, while still resisting brute force and keeping the secret off the
client. A naive "compare a password in the browser" leaks the code and has no
throttling. This does it server-side with a real lockout.

## When to reach for this
- A private or pre-launch site needs a soft wall (members area, client preview, beta).
- You want shareable invite codes (a code in a link that auto-admits) rather than one
  global password.
- You need brute-force protection but not full auth.

## How it works
- `Gate.tsx` (client) is the code-entry UI: it focuses the input, and if a code was
  passed in (prefilled from the URL) it auto-submits once after a short delay. It
  renders `wrong` and `locked` states driven by an `?err=` query param.
- `enterAction` (server action) does the real work: read the code from FormData, read
  a signed throttle cookie, and if locked, redirect to `?err=locked`.
- On a bad code it increments attempts in the throttle cookie; at `MAX_ATTEMPTS` (3)
  it sets a `LOCKOUT_MS` (60s) lockout. On a good code it mints a session token,
  records the admission (which invite, session id), sets an httpOnly session cookie,
  clears the throttle, and redirects into the site.
- The secret never reaches the client: validation, throttling, and session issuance
  are all server-side.

## Data model
Two cookies: a signed `throttle` cookie (`{ attempts, lockedUntil }`, httpOnly,
sameSite strict, ~30m) and an httpOnly `session` cookie (HMAC token, `SESSION_MAX_AGE`).
Invite codes and admissions live in the app's data layer (`@/lib/codes`).

## Key decisions & gotchas
- **This is a shared-secret / invite gate, not real authentication.** No accounts, no
  per-user identity beyond the invite. Say so to stakeholders; do not gate anything
  truly sensitive behind it.
- **Throttle state rides in a signed cookie, not a DB.** Cheap and serverless-friendly,
  but it is per-browser: clearing cookies resets attempts. Acceptable for this threat
  model; for stricter limits, key throttling by IP server-side.
- **URL auto-submit** makes invite links one-click, but it also means the code appears
  in the URL (history, referrer). Fine for low-sensitivity invites, not for secrets.
- **httpOnly + sameSite=strict + secure** on both cookies; `secure` is relaxed only in
  development.
- The action uses `redirect()` for every outcome, so the client stays dumb and the
  state is entirely in the URL `err` param plus cookies.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/Gate.tsx` | Code-entry UI, URL auto-submit, wrong/locked states | a brand art component (`Sedan9`), your styles |
| `code/actions.ts` | Server action: verify, throttle, lockout, issue session | `@/lib/codes` (verifyCodeDetailed, recordAdmission), `@/lib/session` (newSessionToken, signThrottle/verifyThrottle, COOKIE_NAMES, SESSION_MAX_AGE) |

## Adaptation notes
- Provide your own `lib/codes` (validate a code, return an invite id) and `lib/session`
  (HMAC sign/verify a token and the throttle blob). For a single shared password,
  `verifyCodeDetailed` can just compare to an env var.
- Replace the `Sedan9` brand component and styles with your own.
- Pair with middleware that checks the session cookie and redirects un-admitted
  visitors back to the gate.

## Provenance
- Origin files: `momentum-motorcars/app/Gate.tsx`, `app/actions.ts` @ `0123d7b`
- Related features: [[pin-auth-gate]]
- Related memory: `project_momentum_motorcars.md`
