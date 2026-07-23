# PIN Auth Gate for Internal Areas

> A lightweight PIN gate for internal team/admin pages: scrypt-hashed PINs, an
> HMAC session cookie that auto-invalidates when a PIN rotates, with a DB-override
> layer on top of env-var PINs.

- **Slug:** `pin-auth-gate`
- **Tags:** `auth`, `admin`, `security`
- **Source project:** Therma (therma.one website)
- **Stack:** Next.js 15 App Router + Drizzle + Postgres + Node crypto
- **Reuse confidence:** adapt-the-shape (`pin-hash.ts` is drop-in; `team-auth.ts` is Drizzle- and cookie-shaped)
- **Status in origin:** live in prod

## Problem it solves
You have an internal surface (a `/team` console, an admin dashboard, a staging
area) that needs to keep the public out, but it does not warrant a full identity
provider, user accounts, OAuth, or password reset flows. A shared/per-person PIN
is enough friction. The job is to do that PIN check without storing the PIN in
plaintext and without minting a session cookie that survives a PIN change.

## When to reach for this
- Small internal/admin area with a known, fixed set of people (here: 5 named
  team members), not public signups.
- You want PINs configurable two ways: bootstrap from env vars, then let a member
  rotate their own PIN into the DB without a redeploy.
- You want "rotate the PIN, kill every old session" to be automatic, not a manual
  cookie-secret bump.
- You explicitly do NOT need accounts, email, password reset, or roles beyond a
  flat admin/not-admin split.

## How it works
- `pin-hash.ts` is pure Node crypto: `hashPin` runs scrypt (N=16384, 32-byte key,
  16-byte random salt) and packs the result as `scrypt$<N>$<saltHex>$<derivedHex>`.
  `verifyPin` re-derives with the stored salt and compares with `timingSafeEqual`.
- `team-auth.ts` resolves a PIN two ways per member: a DB row in `user_pins` wins
  if present (scrypt hash via `verifyPin`), otherwise it falls back to the env var
  `TEAM_PIN_<MEMBER>` compared with a constant-time string compare.
- `validatePin(pin, member?)` either checks one member or loops all of them and
  returns the matching member name (or null).
- The session is stateless: two cookies, `therma_team_token` (an HMAC) and
  `therma_team_user` (the member name). The token is
  `HMAC-SHA256(TEAM_TOKEN_SECRET, "<member>:<seed>")`.
- The clever bit is the **seed**. For a DB-backed member the seed is `db:<saltHex>`
  (the scrypt salt). Rotating the PIN generates a new salt, which changes the seed,
  which invalidates every cookie minted against the old PIN, with no separate
  session table. For env-only members the seed is `env:<pin>`.

## Data model
```ts
// user_pins: one optional override row per member.
// Absent row => fall back to env var TEAM_PIN_<MEMBER>.
export const userPins = pgTable('user_pins', {
  member: text('member').primaryKey(),     // 'Sam' | 'Kyle' | ...
  pinHash: text('pin_hash').notNull(),     // 'scrypt$N$saltHex$derivedHex'
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```
Session state lives entirely in two cookies (no session table):
- `therma_team_token` (HMAC, HttpOnly, SameSite=Strict, Secure in prod, 7-day expiry)
- `therma_team_user` (the member name)

Env vars: `TEAM_PIN_OMAR` ... (one per member, the bootstrap PINs) and
`TEAM_TOKEN_SECRET` (the HMAC secret, required, throws if missing).

## Key decisions & gotchas
- **This is a gate, not real auth. Be honest about it.** It is a shared-secret
  bouncer for a small known group. There are no user accounts, no email
  verification, no password reset, no rate limiting, no lockout, no audit trail,
  no MFA. A PIN is low-entropy by nature, so this is brute-forceable if exposed to
  the public internet without a WAF or rate limit in front. Do not put anything
  behind it that a real attacker would pay to reach. For anything user-facing or
  regulated, use a real identity provider.
- **Hash choice is sound for what it is.** scrypt with a random per-PIN salt and a
  constant-time compare is the right shape and avoids the classic mistakes (no
  plaintext, no unsalted hash, no `==` comparison). The `N` value is recorded in
  the hash string for future migration but is not currently read back on verify
  (`void n`), so changing default scrypt params later would silently break old
  hashes until you wire `n` into the verify call.
- **Two PIN sources, DB wins.** Env vars bootstrap the gate; a DB row lets a member
  rotate without a redeploy. The fall-through means a member with no DB row still
  works off the env var.
- **Self-invalidating sessions via salt-as-seed.** The token is derived from the
  scrypt salt, so a PIN rotation rotates the salt and instantly voids old cookies.
  No revocation list, no session table. The trade-off: rotating `TEAM_TOKEN_SECRET`
  logs everyone out at once (intended kill switch).
- **Constant-time everywhere it matters.** `verifyPin` uses `timingSafeEqual`; the
  env-var path uses a `timingSafeCompare` that burns equal time on a length
  mismatch before returning false. Worth keeping if you adapt it.
- **`validatePin()` with no member loops all members.** Fine for 5 people, do not
  ship this shape for a large set (it is O(members) scrypt calls per attempt).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/pin-hash.ts` | scrypt hash + constant-time verify, self-describing hash string | none (drop-in, Node `crypto` only) |
| `code/team-auth.ts` | PIN resolution (DB-over-env), HMAC cookie mint/verify, login/logout cookie builders | `next/headers`, `drizzle-orm`, `./db`, `./schema` (`userPins`), `./team-members` |

## Adaptation notes
- `pin-hash.ts` is genuinely drop-in. Copy it as-is (Node-only, no project deps).
- For `team-auth.ts`: replace the member list (`TEAM_PINS`, `VALID_MEMBERS`) and
  `./team-members` import with your own roster, map `userPins` to your schema/ORM
  (it is Drizzle here), and swap `next/headers` cookie access if you are not on
  Next.js App Router.
- Set `TEAM_TOKEN_SECRET` and the per-member `TEAM_PIN_<NAME>` env vars. The HMAC
  derive throws hard if `TEAM_TOKEN_SECRET` is missing, by design.
- Rename the cookie constants (`therma_team_token` / `therma_team_user`) and the
  env-var prefix for your project.
- If you expose this to the open internet, add rate limiting / lockout in front; it
  is not built in.

## Provenance
- Origin files: `therma-site/lib/pin-hash.ts`, `therma-site/lib/team-auth.ts` @ `52f65787`
- Pairs with: `lib/schema.ts` (`user_pins` table), `lib/admin-api-auth.ts`,
  `app/api/team/me/pin/route.ts` (PIN rotation endpoint)
- Related memory: `project_therma_team_console.md` (the `/team` console this gates)
