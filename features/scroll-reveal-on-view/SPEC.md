# Scroll-Reveal On View

> A tiny client wrapper that fades and lifts its children into place the first
> time they scroll into the viewport, then leaves them alone.

- **Slug:** `scroll-reveal-on-view`
- **Tags:** `animation`, `ui`, `intersection-observer`
- **Source project:** Rendezvous (film studio marketing site)
- **Stack:** Next.js 15 App Router + React 19 client component, framer-motion v12 (`whileInView` / `viewport`)
- **Reuse confidence:** drop-in (one import to repoint, one peer dep to install, nothing else)
- **Status in origin:** live on the about and contact pages

## Problem it solves
Marketing pages want content to arrive as the visitor scrolls, not all at once on
load. Writing an IntersectionObserver, a ref, an `isVisible` state flag, and the
enter transition by hand at every section is repetitive and easy to get subtly
wrong (re-triggering on scroll-up, firing before the element is meaningfully on
screen, leaking observers). This captures that whole pattern as one wrapper you
drop around any block: `<ScrollReveal>...</ScrollReveal>`.

## When to reach for this
- You have a long marketing / editorial page and want sections to fade-and-rise in
  as they enter the viewport.
- You want the reveal to happen once and stay revealed, not animate every time the
  element scrolls back into view.
- You want to stagger siblings cheaply (pass an incrementing `delay`, e.g.
  `delay={i * 0.08}`) without orchestrating a parent timeline.
- You are already on (or willing to add) framer-motion and do NOT want to hand-roll
  an IntersectionObserver per section.

## How it works
- It is a thin wrapper over framer-motion's `motion.div`. framer-motion's
  `whileInView` is what owns the IntersectionObserver under the hood, so this file
  never touches the `IntersectionObserver` API directly. That is the key shortcut:
  the library does the observing, the wrapper just declares the states.
- Two variants are declared: `hidden` (`opacity: 0, y: 24`, i.e. transparent and
  24px low) and `visible` (`opacity: 1, y: 0`). `initial="hidden"` sets the
  pre-reveal state, `whileInView="visible"` is the target once it intersects.
- `viewport={{ once: true, margin: '-80px' }}` is the trigger config. `once: true`
  means it observes, fires a single time, then disconnects (no re-animate on
  scroll-up). `margin: '-80px'` shrinks the trigger box inward by 80px so the
  element has to be ~80px past the viewport edge before it counts as "in view",
  which keeps the animation from firing while the block is still half off-screen.
- The transition is `duration: 0.9s` with a custom cubic-bezier ease
  `[0.16, 1, 0.3, 1]` (an "ease-out-expo"-style curve: fast start, long soft
  settle) and an optional `delay` prop for staggering.
- `className` is passed straight through to the `motion.div`, so the wrapper does
  not impose any layout of its own (it is a plain block-level div you style at the
  call site).

## Data model
Stateless. No storage, no cookies, no flags, no server state. Props only:

```
ScrollReveal {
  children:   ReactNode   // the block to reveal
  delay?:     number      // seconds, default 0; used for stagger
  className?: string      // forwarded to the motion.div, no default
}
```

## Key decisions & gotchas
- **Observe-once is deliberate.** `viewport={{ once: true }}` disconnects the
  observer after the first intersection, so content does not re-fade when scrolled
  back to. If you actually want repeat-on-every-entry, drop `once` (and accept that
  fast scrolling will re-trigger the animation).
- **The threshold is expressed as `margin`, not an amount-visible ratio.** This
  version uses `margin: '-80px'` (a negative root margin that pulls the trigger
  line inward), not framer-motion's `amount` option. Net effect is similar ("wait
  until it is well into view") but it is pixel-based, not percentage-based. If your
  sections are shorter than ~160px the `-80px` inset can mean they nearly never
  trigger; tune the margin to the content height.
- **No-JS / no-hydration fallback is the real trap.** Because `initial="hidden"`
  sets `opacity: 0`, the content starts invisible and only becomes visible once
  framer-motion (client JS) runs and the observer fires. If JS is disabled, fails
  to load, or the `'use client'` boundary never hydrates, the wrapped content stays
  at `opacity: 0` and is effectively unreadable. There is no SSR-visible fallback
  here. For SEO the text is still in the DOM (crawlable), but for a human with
  broken JS it is blank. Accept this only for non-critical marketing sections; do
  not wrap above-the-fold critical copy or legal text in it.
- **SSR hydration flash.** The server renders the element at its `hidden` state, so
  there is no flash-of-visible-then-hidden. The opposite mild artifact exists: a
  brief moment where the block is present-but-invisible until hydration + intersect.
  In practice the `-80px` margin plus on-load intersect makes this unnoticeable for
  below-the-fold content; it can be visible for content that is already on screen at
  first paint (it will fade in a beat late).
- **Reduced-motion is NOT handled.** This component does not check
  `prefers-reduced-motion`; every visitor gets the 0.9s translate+fade regardless of
  their OS setting. That is an accessibility gap, not a feature. framer-motion ships
  a `useReducedMotion()` hook and a `MotionConfig reducedMotion="user"` wrapper;
  add one of those if the destination project cares about motion sensitivity. Called
  out explicitly because it is the most likely thing a reviewer will (correctly)
  flag.
- **Stagger is caller-driven, not built in.** There is no parent
  `staggerChildren`; you fake stagger by passing `delay={i * step}` at each call
  site. Simple and good enough, but if you have dozens of items a real
  `staggerChildren` variant on a parent is cleaner.
- **The wrapper adds a div.** Every reveal is a `motion.div`, so it injects a
  block-level element into your markup. If you need to reveal a `<li>`, `<span>`,
  or a grid child without breaking layout, swap `motion.div` for the appropriate
  `motion.<tag>` or pass layout styles via `className`.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/scroll-reveal.tsx` | The whole feature: a `'use client'` `ScrollReveal` wrapper that fades+lifts children in on first viewport entry via framer-motion `whileInView` | `framer-motion` (peer dep, v12 in origin), React 19 `ReactNode` type |

## Adaptation notes
- Install the peer dep in the destination project: `framer-motion` (origin uses
  `^12.0.0`). On framer-motion v11+ the import can also be `motion/react`; this file
  imports from `framer-motion`, which still works on v12. If the project is already
  on the newer `motion` package, change the import line to `from 'motion/react'`.
- No `@/`-style internal imports to repoint. The only import is the third-party
  `framer-motion`, so there are no project-local paths to fix.
- Drop it anywhere and wrap blocks: `<ScrollReveal delay={0.1} className="...">`.
  In origin it is used on `src/app/about/page.tsx` and `src/app/contact/page.tsx`,
  including staggered lists via `delay={i * 0.08}`.
- Tunables to consider per project: `duration` (0.9s is slow/editorial), the ease
  curve, the `hidden` offset (`y: 24`), and the viewport `margin`. If you want
  trigger-by-percentage instead of pixels, replace `margin` with
  `amount: 0.3` (etc.).
- If accessibility matters, add reduced-motion handling (see gotchas) before
  shipping. If broken-JS readability matters, do not use this wrapper for that
  content.

## Provenance
- Origin file: `rendezvous-site/src/components/scroll-reveal.tsx` @ `3cfd9d6`
- Call sites in origin: `src/app/about/page.tsx`, `src/app/contact/page.tsx`
- Related memory: `project_rendezvous_site.md`
