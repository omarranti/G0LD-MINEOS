# Client-Side A/B Copy Test (hero headline)

> A tiny client component that assigns a visitor into one of three copy
> variants, persists the assignment in localStorage, and renders the matching
> headline. Built for testing hero copy on a marketing page without a server,
> a flag service, or a deploy per variant.

- **Slug:** `ab-copy-testing`
- **Tags:** `cro`, `experimentation`, `copy`
- **Source project:** Therma
- **Stack:** Next.js 15 App Router (client component) + React hooks + localStorage
- **Reuse confidence:** reference-only (the assignment + persistence shell is sound; analytics tracking is not actually wired, and the variants ship identical copy)
- **Status in origin:** live in prod (but inert: all three variants render the same text, so it measures nothing yet)

## Problem it solves
You want to test two or three hero headlines against each other on a static or
statically rendered page, without standing up a feature-flag backend, an
experiments service, or a separate deploy per variant. Assignment has to happen
in the browser (the page is cached/SSR'd the same for everyone) and has to stick
for repeat visits so a returning user does not flip between headlines.

## When to reach for this
- Marketing/landing page where the HTML is identical for all visitors (CDN/SSR
  cache) and you cannot branch server-side per user.
- You want a stable, sticky per-visitor variant with a manual override for QA and
  screenshots (`?ab=b`).
- You explicitly do NOT want a third-party experiment SDK for a one-off copy test.
- Treat this as a starting shell: it gives you assignment + persistence + forced
  override. You still have to add the actual distinct copy and the analytics
  event yourself (see gotchas).

## How it works
- The component is `'use client'`. On mount, a `useEffect` decides the variant in
  three steps: URL override, then stored value, then a fresh random draw.
- **Forced override:** if `?ab=control|a|b` is in the query string, that value is
  written to localStorage and used. This is the QA / screenshot lever.
- **Sticky read:** otherwise it reads `localStorage['therma_ab_headline']` and
  reuses it if valid.
- **First-time assignment:** otherwise `Math.random()` is bucketed into even
  thirds (`< 1/3` control, `< 2/3` a, else b), the result is stored, and used.
- The chosen key indexes a `variants` map of JSX and renders it inside an `<h1>`.
- Default state before the effect runs is `control`, so SSR/first paint shows the
  control copy and the client may swap it after hydration.

## Data model
Stateless on the server. Client-side persistence only:
- `localStorage['therma_ab_headline']` holds one of `'control' | 'a' | 'b'`.
- No cookie, no DB row, no server flag. The assignment lives entirely in the
  visitor's browser, so it does not survive a cleared storage, an incognito
  window, or a different device, and it cannot be read server-side.

## Key decisions & gotchas
- **No analytics is actually wired.** Despite the "tracking" framing, neither
  component fires an event, sets a data attribute, or pushes to any analytics
  layer. As written you cannot tell which variant a converting user saw. Wiring a
  `variant_assigned` event (PostHog/GA) at the moment of assignment is the missing
  half and the first thing to add.
- **The variants are identical.** In the live code `control`, `a`, and `b` all
  render the exact same headline ("A quieter place to check in."). The harness is
  in place; the experiment is inert until you give the buckets different copy.
- **The subheadline file is not an A/B test.** `ABTestSubheadline.tsx` is a plain
  static component with zero variant logic, despite the name. It is included for
  provenance, not as a second experiment.
- **Hydration flash.** Initial render is always `control`; the real variant is
  picked in `useEffect` after hydration. If a/b ever differ from control, returning
  b/a users see a brief control flash before the swap. Acceptable for copy, not for
  layout-shifting changes.
- **Even-thirds split is hardcoded** in the `Math.random()` bucketing. Changing the
  weighting means editing the thresholds; there is no config.
- **Storage failures fall back to control.** The whole effect is wrapped in
  try/catch; if localStorage throws (private mode, blocked), it silently shows
  control and never persists.
- **Forced override is sticky on purpose.** Visiting `?ab=b` once writes `b` to
  storage, so the override persists on later visits without the query param. Clear
  storage to re-randomize.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/ABTestHeadline.tsx` | Client component: assign (override → stored → random thirds), persist to localStorage, render variant `<h1>` | none (pure React + browser APIs); className passed by caller |
| `code/ABTestSubheadline.tsx` | Static `<h2>` subheadline, no variant logic (included for provenance) | none |

## Adaptation notes
- Rename the storage key `therma_ab_headline` and the override param `ab` to avoid
  collisions if you run more than one test.
- Put real, distinct copy in the `variants` map or the experiment measures nothing.
- Add the analytics call you actually use at the assignment site (right after
  `setVariant`), keyed by the chosen variant, so conversions can be attributed.
  This is the load-bearing change; without it the component is decoration.
- If you need a server-readable assignment (server-side personalization, edge
  routing), swap localStorage for a cookie set in middleware instead.
- Decide whether the control-first hydration flash is acceptable for your change;
  for anything beyond a text swap, consider gating render until assigned.

## Provenance
- Origin files: `therma-site/components/ABTestHeadline.tsx`,
  `therma-site/components/ABTestSubheadline.tsx` @ `52f65787`
- Related memory: `project_therma_chat_widget.md` (homepage in-flow experiment, `ct=` attribution pattern)
