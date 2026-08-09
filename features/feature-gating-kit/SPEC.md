# Feature Gating Kit (free-account vs paid, copy registry, metered reads)

> One consistent gate architecture for a freemium product: every locked surface distinguishes "needs a free account" from "needs a paid plan", pulls its pitch from a per-feature copy registry, is fully instrumented, and anonymous readers get a metered taste before the wall.

<!-- Structure over skin: the reusable value is the tier model, the registry shape, the instrument-at-the-modal decision, and the metering math. Every string and Tailwind class is disposable. -->

- **Slug:** `feature-gating-kit`
- **Tags:** `paywall, monetization, freemium, gating, metering, cro, analytics, a11y`
- **Source project:** directory / marketplace web app
- **Stack:** Next.js 15 App Router + React 19 + NextAuth session endpoint + PostHog (flags + events) + Tailwind
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live in prod

## Problem it solves
Freemium products grow ad-hoc gates: one feature checks `session?.user`, another checks `plan === "PREMIUM"`, each with its own modal, its own copy, and usually no instrumentation. The result is three real failures the origin hit and fixed here: gates that asked anonymous users to PAY when the actual next step was a free account; paywall views that were never tracked (only 1 of 4 gate surfaces fired `paywall_viewed`); and a server-side auth read in the layout that silently killed edge caching for ~15k static pages. This kit is the consolidated answer: one subscription context, one gate component, one modal with a copy registry, one metering hook.

## When to reach for this
- A product with three access levels: anonymous, free account, paid, where "create a free account" is the north-star conversion and paid is the second ask.
- Gate copy is drifting per call site, or you cannot answer "which gate converts best" because views/dismissals are untracked.
- Content pages (blog, guides) need a leaky paywall: full SEO visibility, metered anonymous reads, wall after N.
- Your pages are edge-cached or statically generated, so gating must resolve client-side without breaking the cache.
- You want an upgrade prompt triggered by an activation milestone (first save, Nth action) rather than an interrupt on arrival.

## How it works
1. **One tier resolver.** `resolveSubscription(user)` maps a plan string + trial date to a flat `SubscriptionState` (`isAnonymous`, `isFreeAccount`, `isPaid`, `isTrial`, `trialDaysRemaining`, `hasAccess`, `tier`). Every gate reads this via `useSubscription()`; no component parses plan strings.
2. **Client-side hydration, anonymous-first.** `SubscriptionGate` (the provider) starts as anonymous and fetches `/api/auth/session` on mount. Initial render shows gates closed, which is exactly what crawlers should index, and the layout never reads cookies server-side, so static/edge caching survives.
3. **Two-level gates.** `PaywallGate` wraps content with `requiredTier: "free" | "paid"`. Free means any logged-in account; paid means `hasAccess` (paid plan OR active trial). Unauthorized content renders blurred with a lock overlay (or a compact inline lock), and a click opens the modal.
4. **Copy registry keyed by feature.** `GATE_COPY` in `UpgradeModal` maps each gate moment (`map`, `filter`, `favorites`, `listing`, `blog`, ...) to `{ icon, tier, headline, body, features[], dismiss }`. The modal picks the CTA stack by tier: free gates lead with "create free account" plus a soft pointer to paid; paid gates lead with the annual offer. New gate = new registry entry, zero new components.
5. **Instrument at the modal, not the call sites.** `paywall_viewed` fires on the open transition inside the modal, so every present and future call site is measured by construction. Every non-CTA way out (backdrop, X, Escape, dismiss link) routes through one `dismiss(method)` handler, so viewed = cta_clicked + dismissed always adds up, and the `method` separates rage-closes from considered passes.
6. **Metered anonymous reads.** `useArticleLimit` counts full reads in localStorage, either lifetime or resetting per calendar month (rolling monthly meter, matching Google Flexible Sampling). `GatedArticleContent` shows full HTML under the limit, then a truncated view with the full text still in the DOM (`sr-only`) for SEO, plus the gate card.
7. **Milestone-triggered upgrade prompt.** `recordSaveForFoundingPrompt()` counts saves in localStorage and, exactly once per browser (fires on `===` threshold, not `>=`), dispatches a window CustomEvent that a listening modal component reacts to. The paid pitch arrives after the aha moment, not on arrival.
8. **Flags default to the winner.** Both experiment hooks (`free-gate-cta`, `blog-meter-generous`) default to the shipped winning variant; only an explicit "control" opts back out. See gotchas for why.

## Data model
```
User   plan (FREE | MONTHLY | YEARLY | FAMILY | FOUNDING_ANNUAL | LIFETIME)   trialEndsAt
```
Client-side state:
```
localStorage["articles_read"]   lifetime mode: "3"   monthly mode: {"month":"2026-06","count":2}
localStorage["save-count"]      running save counter for the milestone trigger
window CustomEvent "app:save-milestone"   {citySlug?}   fired once at threshold
PostHog flags: "free-gate-cta" (free-first | control), "blog-meter-generous" (generous | control)
```

## Key decisions & gotchas
- **Default flags to the winner, not to control (the expensive one).** After an experiment ships, the hook's default is the winning arm and only an explicit "control" value opts out. When these hooks defaulted to control, every reader whose flag call was slow, ad-blocked, or unresolved got the retired experience: measured live, 330 of 682 calls on one flag and 80 of 177 on the other returned no variant, so roughly half of users were silently in the losing arm.
- **Never read auth in a cached layout.** The provider's earlier server-side version (`auth()` in a layout) opted the entire route tree out of edge caching. The flash of anonymous-then-logged-in on first hard navigation is the accepted cost; soft navigations keep the resolved state.
- **The free/paid tier split lives in the registry, not the call site.** A gate's `tier` travels with its copy, so analytics can segment free-gates vs paid-gates and the CTA stack can never contradict the pitch.
- **Instrumentation centralization was a bug fix, not a nicety.** Three of four gate surfaces shipped unmeasured because each call site was trusted to fire its own event.
- **The leaky paywall keeps full HTML in the DOM.** The truncated view hides content visually but keeps it in source (`sr-only`) so search engines index the full article. Trivially bypassable by a devtools user; that is the accepted tradeoff of a soft gate.
- **Client-side meters are honest-user meters.** localStorage counters reset on new browsers/incognito. Deliberate: the meter's job is conversion pacing, not DRM.
- **Milestone fires on `===` threshold.** Using `>=` would re-announce on every subsequent save; `===` announces exactly once per browser.
- **The milestone is deliberately NOT wired to the cross-auth save replay** (see related feature): a replayed save belongs to the brand-new-account moment where a welcome flow owns the screen, and a retired experiment showed that a paid interrupt in the first seconds of a new account hurts activation.
- **Modal a11y is one shared hook.** Escape, Tab focus-trap, body scroll lock, and focus restore live in `useModalA11y` so every modal in the product behaves identically.
- **Deliberately not handled:** server-enforced access control (these are UI gates; the origin also enforces server-side in actions and routes, which you must too), cross-device meter sync, and per-feature entitlement matrices beyond the two-level free/paid split.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/useSubscription.ts` | Tier types, `resolveSubscription()` plan-string resolver, context + `useSubscription()` hook | none (plan enum names) |
| `code/SubscriptionGate.tsx` | Root provider: anonymous-first, hydrates from `/api/auth/session` client-side to preserve edge caching | your session endpoint shape |
| `code/PaywallGate.tsx` | Wrapper gate: `requiredTier` free/paid check, blur + lock overlay or inline lock, opens the modal | `lucide-react` |
| `code/UpgradeModal.tsx` | The modal: `GATE_COPY` registry, tier-dependent CTA stacks, view/CTA/dismiss instrumentation, flag-gated CTA variant | `posthog-js`, `@/lib/analytics`, `lucide-react`, `next/link` |
| `code/gated-article-content.tsx` | Metered blog content: full for accounts, metered for anonymous, SEO-safe truncation, gate card | `posthog-js`, `@/lib/analytics` |
| `code/useArticleLimit.ts` | localStorage read meter, lifetime or rolling-monthly | none (storage key) |
| `code/useModalA11y.ts` | Escape, focus-trap, scroll lock, focus restore for any modal | none |
| `code/founding-prompt.ts` | Save-count milestone trigger dispatching a window CustomEvent, threshold tunable in one place | none (event/key names) |

## Structure to keep, skin to drop
- **Keep (the idea):** the anonymous/free/paid three-state model and flat `SubscriptionState`; client-side hydration to protect edge caching; the two-level `requiredTier` gate; the copy registry keyed by feature with tier attached; instrument-on-open + single dismiss handler with `method`; the lifetime-vs-monthly meter math and SEO-safe truncation; the once-per-browser milestone event; flags defaulting to the shipped winner; the shared modal a11y hook.
- **Drop (regenerate natively):** every string in `GATE_COPY` and the gate cards (all placeholder text here; rewrite in the destination's voice for its actual features), all Tailwind classes (`brand-*` tokens, `rounded-pill`, `font-display` are the origin's design system), the lucide icons, the specific plan tier names (`family`, `founding_annual`, `lifetime`), the founding-offer pricing block (placeholder `$XX`), and the PostHog flag names.

## Adaptation notes
- Mount `SubscriptionGate` once in the root layout (client boundary). Point its fetch at your session endpoint and map your user shape into `resolveSubscription`'s `{ plan, trialEndsAt }` input; edit the plan enum in `useSubscription.ts` to your tiers.
- Rewrite `GATE_COPY` for your features. Keep the shape (`icon, tier, headline, body, features, dismiss`) and keep `tier` accurate per gate; that is what makes free-vs-paid analytics and CTA stacks work.
- Swap `@/lib/analytics` tracker functions (`trackPaywallViewed/CtaClicked/Dismissed`, `trackBlogArticleGated`) for your tracker. Keep the property set: `feature`, `source`, `tier`, `method`, `cta`.
- If you don't use PostHog, delete the two flag hooks and hardcode their winning defaults (`free-first`, `{limit: 3, monthly: true}`); both are written so that is a two-line change.
- Env: `NEXT_PUBLIC_POSTHOG_KEY` guards the flag hooks; absent key means defaults apply.
- Wire the milestone: call `recordSaveForFoundingPrompt()` from your aha-moment action and have your upgrade modal listen for `SAVE_MILESTONE_EVENT`. Tune `FOUNDING_PROMPT_SAVE_THRESHOLD` in one place.
- These are UI gates only. Mirror every gate server-side (in the actions and API routes behind the gated features) or the paywall is decorative.
- `/signup`, `/login`, `/pricing`, `/explore` routes are assumed; adjust to your routes.

## Provenance
- Origin files: `src/components/paywall/PaywallGate.tsx`, `src/components/paywall/SubscriptionGate.tsx`, `src/components/paywall/UpgradeModal.tsx`, `src/components/paywall/gated-article-content.tsx`, `src/hooks/useSubscription.ts`, `src/hooks/useArticleLimit.ts`, `src/hooks/useModalA11y.ts`, `src/lib/founding-prompt.ts` @ 2026-08-08 (directory / marketplace web app, live in prod).
- Scrubs for this library: all `GATE_COPY` and gate-card strings rewritten as neutral directory placeholders (origin copy was product-specific, including certification names and community terms; one registry key renamed `vendors`); founding-offer prices replaced with `$XX`/`$YY` placeholders; app-prefixed localStorage keys and the milestone CustomEvent genericized (`articles_read`, `save-count`, `app:save-milestone`); dated experiment/PR references in comments generalized; em dashes in comments replaced. Logic, registry shape, flag defaults, and instrumentation untouched.
- Related features: [[stripe-subscription-webhook]] (the webhook that flips `User.plan` when the paid CTA converts), [[save-intent-replay-across-auth]] (the save button that calls the milestone trigger)
- Related memory: founding modal + paywall docket and observability corrections in the source project's memory.
