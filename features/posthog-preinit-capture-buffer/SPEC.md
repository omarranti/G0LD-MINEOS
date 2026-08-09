# PostHog Pre-Init Capture Buffer (typed analytics module)

> A bounded queue that holds analytics events captured before `posthog.init()` runs, fixing the React effect-ordering race that silently drops every mount-time capture, wrapped in a typed one-function-per-event analytics module.

<!-- Structure over skin: the value is the init-race fix and the typed-helper convention, not the specific funnel events. -->

- **Slug:** `posthog-preinit-capture-buffer`
- **Tags:** `analytics, posthog, react, race-condition, instrumentation, conventions`
- **Source project:** directory / marketplace web app
- **Stack:** Next.js 15 App Router + posthog-js + next-auth
- **Reuse confidence:** drop-in
- **Status in origin:** live in prod

## Problem it solves
React runs a child's effects BEFORE its parent's. The PostHog provider wraps `{children}` in the root layout and calls `posthog.init()` inside its own effect, so any component that captures in its mount effect fires first, and posthog-js silently discards the event. Nothing throws, so even a try/catch around the capture never sees it. In origin this was not hypothetical: `explore_searched` was wired correctly, shipped, and never fired once on production across four separate searches, while `explore_filter_applied` in the same file worked immediately because a click necessarily happens after init. The bug is invisible in code review, invisible at runtime, and only detectable by comparing code against the warehouse (see [[build-correctness-linters]], which is what caught it).

## When to reach for this
- Any React app where `posthog.init()` (or any client-side analytics init) runs inside a provider effect and any component captures on mount: page-viewed events, exposure events, experiment views.
- An event you "definitely wired" shows zero ingests while sibling click events work fine. That signature IS this bug.
- You are starting a new app's instrumentation and want the typed-helper convention from day one instead of raw `posthog.capture` strings scattered through components.

## How it works
- `analytics.ts` owns a module-level `initialised` flag and a `pending: Array<[event, props]>` queue, capped at `MAX_PENDING = 50` so a page that never initialises (no key, blocked script) cannot grow it unbounded.
- Every event goes through one private `capture()`: no-op on the server (`typeof window === "undefined"`), queue if not yet initialised, otherwise send. `send()` wraps `posthog.capture` in try/catch so analytics can never break a user flow.
- The provider calls `posthog.init()` in its effect, then immediately calls `flushPendingAnalytics()`, which flips the flag and drains the queue in order. Events fired from clicks, timers, or flag callbacks were always safe; only the mount-time window changes.
- Every event is a typed exported function (`trackSignupAttempted(method)`), never a raw string at the call site. Naming convention: **snake_case, object-past-tense verb** (`listing_saved`, `signup_completed`, `paywall_viewed`). Payload unions are typed (`SaveSurface`, `ModalDismissMethod`) so surfaces and dismiss methods stay enumerable in the warehouse.
- The provider is also the consent gate: cookieless-by-default init (`persistence: "memory"` until accept, `localStorage+cookie` after, full opt-out on decline) and the identity sync (`posthog.identify` on session, `posthog.reset` on sign-out).

## Data model
Stateless client-side. One localStorage key (scrubbed name `app_consent`: `"accepted" | "declined" | null`) read by the provider to pick persistence mode.

## Key decisions & gotchas
- **The queue lives in the analytics module, not the provider.** Any component can import `capture` helpers with zero knowledge of init state; the provider only has to call `flushPendingAnalytics()` once. No context, no ref passing.
- **Bounded queue, drop-newest.** If init never happens, holding 50 events is harmless; holding unbounded events is a leak. Events past the cap are dropped silently, which is correct: with no init they were never going to send anyway.
- **One function per event is load-bearing.** It makes events greppable (the dead-instrumentation linter scrapes `capture("...")` literals), makes payloads typed, and creates a natural place for the comment explaining why an event exists or was removed. The origin file keeps tombstone comments for deleted events (`referral_landed`, client-side `founding_checkout_completed`) so nobody re-adds them; that habit is worth copying.
- **Revenue events belong server-side.** The origin deliberately captures checkout completion from the Stripe webhook, not a success page: a success page can be missed entirely (closed tab, redirect race) and a client twin would double-count. See [[posthog-server-capture]].
- **Exported but never imported is the sibling failure.** The queue fixes captures that run too early; it cannot fix helpers nothing calls. Origin shipped two events that no component imported. Only a code-vs-warehouse check catches that class.
- **Consent posture:** memory persistence pre-consent keeps anonymous funnels visible without setting cookies; this is a product/legal decision, re-litigate it per project.
- **Deliberately not handled:** retry/persistence of the queue across page loads (a navigation before init loses the queue, accepted), batching, and non-PostHog providers.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/analytics.ts` | The pending queue + `flushPendingAnalytics()` + every typed event helper + identify/reset | `posthog-js`, `NEXT_PUBLIC_POSTHOG_KEY` |
| `code/posthog-provider.tsx` | Root provider: consent-aware `posthog.init()`, then flush; session-driven identify/reset | `posthog-js/react`, `next-auth/react`, `@/lib/analytics`, two app-specific children (`PendingSaveReplay`, `PostAuthToast`) to delete |

## Structure to keep, skin to drop
- **Keep (the idea):** the initialised flag + bounded pending queue + flush-after-init contract; the single private `capture()` gate with SSR guard and try/catch; the typed one-function-per-event convention with snake_case object-past-tense names; init-then-flush ordering inside the provider effect; identify-on-session / reset-on-signout.
- **Drop (regenerate natively):** every event helper below the queue (waitlist, signup, founding, paywall, explore funnels are the origin's product; write your own in the same shape), the tombstone comments' specifics, the consent banner semantics and storage key, the `PendingSaveReplay` / `PostAuthToast` children, and the `/ingest` reverse-proxy host if you do not proxy PostHog.

## Adaptation notes
- Env: `NEXT_PUBLIC_POSTHOG_KEY`. `api_host: "/ingest"` assumes a reverse-proxy rewrite to PostHog; use `https://us.posthog.com` (or EU) directly if you do not have one.
- Mount `PostHogProvider` around `{children}` in `app/layout.tsx`. Delete the two app-specific children and the `Suspense` wrapper they needed, or substitute your own post-auth components.
- If you do not use next-auth, replace `PostHogIdentify`'s `useSession` with your session source; keep the identify/reset shape.
- Replace the event helpers wholesale with your product's funnels, keeping the convention. Then wire the dead-instrumentation check from [[build-correctness-linters]] so "exported but never imported" and "wired but never ingested" both get caught.
- The consent key name was genericized to `app_consent`; rename to your prefix and keep it in one place.

## Provenance
- Origin files: `src/lib/analytics.ts`, `src/components/posthog-provider.tsx` @ main, 2026-08-08 (directory / marketplace web app, live in prod). Scrubs: app name removed from the module header; branded localStorage/cookie key prefixes replaced with `app_` (`app_consent` in the provider, `app_ref` in a comment). All logic, event helpers, and comments otherwise verbatim.
- Related features: [[posthog-server-capture]], [[build-correctness-linters]], [[consent-gated-analytics]]
- Related memory: observability corrections; "seo cta never fired" incident (init race, wiring verified 07-28).
