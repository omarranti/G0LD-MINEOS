# Save-Intent Replay Across Auth

> When a logged-out visitor taps "save" and gets bounced to signup, park the intent in localStorage and replay it automatically after auth, so the acquisition moment ends with the thing the user asked for instead of a silently dropped tap.

<!-- Structure over skin: the value is the handoff protocol (park, expire, clear-on-read, replay, broadcast), not the bookmark button. -->

- **Slug:** `save-intent-replay-across-auth`
- **Tags:** `growth, activation, auth, signup-funnel, optimistic-ui, localstorage, analytics`
- **Source project:** directory / marketplace web app
- **Stack:** Next.js 15 App Router + React 19 + NextAuth (JWT sessions) + Prisma + Postgres
- **Reuse confidence:** drop-in
- **Status in origin:** live in prod

## Problem it solves
The anonymous "save this item" tap is the single best account-acquisition trigger a content or directory site has: the user just expressed intent. The naive flow routes them to /signup and forgets why they left. In the origin app, analytics proved it: the pre-signup prompt event fired constantly while the post-signup `listing_saved` event had never fired once. Users completed signup, landed back on the page, saw an unfilled save button, and assumed the product was broken. This module carries the save across the auth boundary and completes it for them, then tells them it happened.

A second problem rides along: on grid pages with dozens of cards, each save button hydrating its own "is this saved?" fetch means 60 identical requests per render. A shared context collapses them to one.

## When to reach for this
- Any app where an anonymous user can express intent (save, favorite, follow, add-to-cart, upvote) that requires an account to persist.
- You see the "prompted to sign up" event firing but the downstream action event flat at zero.
- Pages render many instances of the same per-entity state button and each one fetches its own state.
- Personalized state (saved/not saved) must hydrate client-side because the pages themselves are edge-cached or statically generated.

## How it works
1. **Park on bounce.** The save button optimistically toggles, the server action returns `unauthenticated`, the button reverts, writes `{ entityId, source, at }` to localStorage, and routes to `/signup?callbackUrl=<current page>`. If the client held a session the server rejected (a JWT that outlived its user row), it signs out first so the dead cookie stops poisoning every write.
2. **Expire stale intent.** Entries older than 1 hour are ignored on read. A save abandoned days ago must not fire on some unrelated later login.
3. **Clear on read.** `takePendingSave()` removes the localStorage entry in the same call that reads it. That single decision is what survives React 18 double-invoked effects and remounts without a mutex: the second invocation reads nothing.
4. **Replay once authenticated.** A mount-once, render-nothing `<PendingSaveReplay />` inside the session provider waits for `status === "authenticated"`, takes the pending entry, checks current server state first (the mutation is a toggle; replaying against an account that already saved the entity would silently unsave it), then applies the save and fires analytics with `via: "pending_save_replay"`.
5. **Broadcast, don't refetch.** The replay lands after every save button has already hydrated from `/api/me/saved`, so it dispatches a window CustomEvent (`app:saved-changed`) that the shared context and standalone buttons listen to, plus `router.refresh()` for server components. Buttons flip to "Saved" without a second fetch.
6. **One fetch for N cards.** `SavedListingsProvider` does the single `/api/me/saved` fetch, exposes `savedSet`, `isHydrated`, and an optimistic `markSaved`. Buttons use the context when present and fall back to a per-instance fetch when not (detail pages with one button skip the provider).
7. **Tell the user.** `PostAuthToast` mounts app-wide, listens for the `via: "replay"` broadcast and a sessionStorage post-signup flag, waits 1.2s so a replay about to land can upgrade the copy, and shows one toast ("Saved to your list" / "You're in") with view, CTA, and dismiss instrumentation.

## Data model
```
SavedListing   userId   listingId   createdAt        -- one row per (user, entity) save
```
Client-side state:
```
localStorage["pending_save"]        {"listingId","source","at"}   TTL 1h, cleared on read
sessionStorage["post_signup_nudge"] "1"  set by the signup form, consumed by the toast
window CustomEvent "app:saved-changed"  {listingId, saved, via?}  cross-component sync bus
```

## Key decisions & gotchas
- **Clear-on-read over a handled flag.** The `useRef` guard in the replay component helps, but the real double-fire protection is that reading the pending save deletes it. Any number of concurrent readers, only one gets a value.
- **Check state before replaying a toggle.** `toggleSavedListing` is a toggle, not an idempotent set. A user who taps save anonymously, then signs in to an existing account that already saved that entity, would otherwise have it silently unsaved. The replay fetches `/api/me/saved` and no-ops if the id is already there.
- **Anonymous clicks skip the hydration gate.** The button disables itself while `/api/me/saved` hydrates, but only for signed-in sessions. An anonymous click can't touch saved state anyway, and anonymous visitors are the acquisition case; making them wait seconds for a fetch that returns `{ids: []}` leaves the money button dead exactly when it matters.
- **The dead-cookie branch.** If the server says `unauthenticated` while the client's session status is `authenticated`, the JWT outlived its user row (deleted account). Keep that cookie and every write on the site fails silently forever. The button calls `signOut({ callbackUrl })` instead of a plain redirect.
- **The API returns 200 `{ids: []}` for anonymous, never 401.** One code path client-side, and the response is explicitly `Cache-Control: private, no-store` so a CDN never serves one user's saves to another.
- **Broadcast carries `via`.** Manual saves and replayed saves both dispatch `app:saved-changed`, but only `via: "replay"` arms the toast. Without the discriminator every manual save would pop a toast.
- **Toast delays 1.2s before painting.** The replay needs a session check plus a server action after navigation; painting immediately would show generic signup copy, then awkwardly need to change to save-confirmation copy.
- **Deliberately not handled:** multiple queued saves (last write wins, the payload is one entity), replaying across devices (localStorage is per-browser, acceptable), and surfacing replay failures (the entry is already cleared; the user can save manually).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/pending-save.ts` | localStorage park/take with 1h TTL and clear-on-read | none (rename the storage key) |
| `code/pending-save-replay.tsx` | Mount-once replay: session gate, state check, toggle, broadcast, `router.refresh()` | `next-auth/react`, `@/app/actions/saved-listings` (your save mutation), `@/lib/analytics` |
| `code/saved-listings-context.tsx` | Shared one-fetch saved-set context: `savedSet`, `isHydrated`, optimistic `markSaved`, event listener | none (endpoint path) |
| `code/save-listing-button.tsx` | The toggle button: context-or-standalone hydration, optimistic update with revert, bounce-to-signup with intent parking, dead-cookie signOut | `next-auth/react`, `lucide-react`, `@/lib/analytics`, `@/lib/founding-prompt` (optional milestone hook, delete if unused) |
| `code/post-auth-toast.tsx` | App-wide toast for signup and replay confirmation with view/CTA instrumentation | `next-auth/react`, `lucide-react`, `@/lib/analytics` |
| `code/route.ts` | `GET /api/me/saved`: the ids of the current user's saves, 200 `{ids:[]}` when anonymous, `private, no-store` | `@/auth`, `@/lib/db` (Prisma) |

## Structure to keep, skin to drop
- **Keep (the idea):** the park -> expire -> clear-on-read -> replay-once-authenticated protocol; the check-before-toggle guard; the one-fetch provider with optimistic `markSaved` and provider-or-standalone fallback; the CustomEvent sync bus with the `via` discriminator; the anonymous-skips-hydration-gate rule; the dead-JWT signOut branch; the 200-empty-array API contract with `no-store`.
- **Drop (regenerate natively):** every Tailwind class (the `brand-*`, `font-*`, `rounded-pill`/`rounded-brand` tokens are the origin's design system), the Bookmark/Sparkles icons, the three button variants, all toast copy, the `source`/`surface` vocabulary (`city_hub`, `pseo_card`), and the analytics function names. Restyle and re-voice for the destination.

## Adaptation notes
- Rename "listing" to your entity everywhere (`listingId`, `SavedListing`, `toggleSavedListing`). The mechanics are entity-agnostic.
- Mount `<PendingSaveReplay />` and `<PostAuthToast />` once, inside your session provider in the root layout. Wrap grid pages in `<SavedListingsProvider>`; single-button pages can skip it.
- Provide the server action the replay and button call. Contract: returns `{ ok: boolean, saved?: boolean, error?: "unauthenticated" | string }`. If yours is a set rather than a toggle, you may drop the check-before-replay fetch (but keep it if there is any chance of double-apply side effects).
- Have your signup form set `sessionStorage["post_signup_nudge"] = "1"` just before its post-signup redirect, or delete the signup arm of the toast.
- Swap `@/lib/analytics` calls for your tracker or delete them. If you keep them, keep the `via: "pending_save_replay"` property; it is how you prove the funnel works.
- Auth stack assumptions: NextAuth `useSession` and an `auth()` server helper. Any auth with a client-side "authenticated" signal and a server-side session read works; the localStorage handoff does not care who issues the session.
- The API route needs `runtime = "nodejs"` and `dynamic = "force-dynamic"`; keep the `private, no-store` header.

## Provenance
- Origin files: `src/lib/pending-save.ts`, `src/components/listings/pending-save-replay.tsx`, `src/components/listings/saved-listings-context.tsx`, `src/components/listings/save-listing-button.tsx`, `src/components/post-auth-toast.tsx`, `src/app/api/me/saved/route.ts` @ 2026-08-08 (directory / marketplace web app, live in prod).
- Scrubs for this library: app-prefixed localStorage/sessionStorage keys and the CustomEvent name genericized (`pending_save`, `post_signup_nudge`, `app:saved-changed`), one dated audit reference in a comment generalized, em dashes in comments replaced with commas. Logic untouched.
- Related features: [[feature-gating-kit]] (the `recordSaveForFoundingPrompt` milestone hook the button calls lives there)
- Related memory: save flow audit + signup funnel blockers dockets in the source project's memory.
