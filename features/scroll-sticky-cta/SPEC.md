# Mobile Sticky CTA Bar

> A fixed bottom action bar that pins a single primary CTA to the bottom of the
> viewport on narrow screens, so the download (or convert) button is always one tap
> away without scrolling.

- **Slug:** `scroll-sticky-cta`
- **Tags:** `cro`, `conversion`, `ui`
- **Source project:** Therma (therma.one marketing site)
- **Stack:** Next.js 15 App Router + React client component + Tailwind + CSS variables
- **Reuse confidence:** adapt-the-shape (the structure is drop-in, but the styling is wired to Therma's CSS-variable theme tokens you must swap)
- **Status in origin:** live in prod

## Problem it solves
On a long marketing page, the primary CTA scrolls out of view and the visitor has to
hunt for it to act. A bar pinned to the bottom of the viewport keeps the conversion
button persistently in reach, which matters most on mobile where the hero CTA is
gone after the first thumb-scroll.

## When to reach for this
- You have a long-scroll landing page and want the primary action always visible.
- You only want the persistent bar on small/handheld widths, not desktop.
- You want a dead-simple, near-stateless component with no scroll-listener cost.
- You need a body-class hook so the rest of the layout can reserve space for the bar.

## How it works
- It is a `'use client'` component rendered fixed at `bottom-0` spanning full width,
  layered at `z-40` with a backdrop blur over a translucent glass background.
- Visibility is purely CSS responsive, not scroll-driven: `hidden ... sm:block md:hidden`
  shows it only in the small-to-medium band (roughly phones / small tablets) and hides
  it on desktop. There is no scroll threshold, no `IntersectionObserver`, no debounce.
- On mount it adds a `has-sticky-cta` class to `document.body` and removes it on unmount.
  This is a layout hook so a page can pad its bottom to clear the bar. (In the origin
  no CSS currently consumes the class, so it is a wired-but-dormant escape hatch.)
- It honors the iOS home-indicator safe area via
  `paddingBottom: calc(12px + env(safe-area-inset-bottom, 0px))` so the button is not
  occluded on notched devices.
- The CTA is a plain anchor to the App Store URL (`target=_blank`, `rel=noopener noreferrer`),
  with a configurable `buttonLabel` and `helperText`. No analytics fire from the component.

## Data model
Stateless. No persistence, no cookies, no flags. The only runtime side effect is a
transient `has-sticky-cta` class on `document.body` for the component's lifetime.

## Key decisions & gotchas
- **"Sticky on scroll" is a misnomer here.** It does not appear after a scroll threshold.
  It is always present within its responsive breakpoint range. If you actually want
  show-after-scroll behavior, you must add a scroll listener / `IntersectionObserver`
  yourself (gate on a sentinel near the hero, debounce with `requestAnimationFrame`).
- **SSR guard via the call site, not the component.** On the homepage it is imported with
  `next/dynamic(..., { ssr: false })`, so it never renders on the server. The
  `mental-health-month` landing imports it directly. The component itself touches
  `document` only inside `useEffect`, so a direct import would still be SSR-safe, but the
  dynamic `ssr:false` import avoids hydration churn for a below-the-fold element.
- **Desktop is deliberately excluded** (`md:hidden`). The assumption: desktop keeps the
  hero/nav CTA in reach, mobile does not. Drop `md:hidden` if you want it everywhere.
- **The body-class hook is currently inert.** No stylesheet reads `.has-sticky-cta`. It is
  left in as the seam for reserving layout space; wire a CSS rule if your bar overlaps
  content.
- **No analytics.** If you need conversion attribution, add the event on the anchor's
  `onClick`; nothing is instrumented today.
- **Theme coupling.** Colors come from CSS custom properties (`--theme-hairline`,
  `--theme-bg-glass`, `--theme-text-soft`, `--color-coral`) and custom Tailwind utilities
  (`rounded-pill`, `shadow-button`, `font-body`). These are Therma-specific and will not
  resolve in a fresh project.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/StickyCTA.tsx` | Fixed bottom CTA bar, mobile-only, safe-area aware, body-class hook | `../lib/links` (`APP_STORE_URL`), Tailwind config (`rounded-pill`, `shadow-button`, `font-body`), CSS vars (`--theme-hairline`, `--theme-bg-glass`, `--theme-text-soft`, `--color-coral`) |

## Adaptation notes
- Replace the `APP_STORE_URL` import with your own CTA href (or make it a prop).
- Define or remove the theme CSS variables and custom Tailwind utilities, or replace the
  inline `style` values and class names with literals so it renders in any project.
- Decide the breakpoint policy: keep `sm:block md:hidden` for mobile-only, or change it.
- If you want true scroll-triggered reveal, add the listener and a CSS transition for the
  enter/exit; the current component has neither.
- Mirror the call-site `ssr: false` dynamic import if you render it on a server component
  page and want to skip SSR for it.

## Provenance
- Origin file: `therma-site/components/StickyCTA.tsx` @ `52f65787`
- Call sites: `app/home-client.tsx`, `app/home/home-client.tsx` (both `dynamic(ssr:false)`),
  `app/mental-health-month/landing-client.tsx` (direct import)
- Related memory: `project_therma_chat_widget.md` (homepage conversion surfaces)
