# 3D Scroll-Reveal Intro (Cinematic Landing)

> A sticky, scroll-driven landing intro where a wordmark assembles letter-by-letter
> out of 3D depth (CSS transforms, not WebGL) while letterbox bars retract and a
> halation bloom peaks, then the whole stage flies back and fades to hand off to
> the real page.

- **Slug:** `intro-3d-scroll-reveal`
- **Tags:** `animation`, `3d`, `intro`, `ui`
- **Source project:** Rendezvous (film-studio site)
- **Stack:** Next.js 15 App Router (client component) + Framer Motion + Tailwind
- **Reuse confidence:** adapt-the-shape (the scroll-stage mechanism is reusable; every visual, the brand color tokens, and the wordmark are Rendezvous-specific)
- **Status in origin:** prototype (local-only, initial commit, not deployed)

## Problem it solves
A landing page wants a high-production "title sequence" moment before the real
content, the kind of cinematic reveal a film studio expects, without pulling in a
3D engine, a canvas, or a video file. The whole thing is one client component
built from CSS 3D transforms driven by scroll position.

## When to reach for this
- You want a premium, "movie title card" intro on a marketing/landing page.
- You want the reveal tied to **scroll** (the user drives the timeline), not an
  autoplay timer, so it can't outrun a reader and degrades to a normal scroll.
- You explicitly do NOT want Three.js / react-three-fiber / WebGL / a video. The
  3D here is faked with `transform-style: preserve-3d` + `perspective` + `translateZ`.
- You need it to hand off cleanly to the page below (the stage fades and flies
  away near the end of its own scroll range).

## How it works
- The section is **tall** (`h-[260vh]`) with a `sticky top-0 h-screen` inner stage.
  As the user scrolls those ~2.6 viewports, the inner stage stays pinned and the
  animation plays out. That tall-section-plus-sticky-child is the entire trigger
  mechanism, no scroll listeners, no IntersectionObserver.
- `useScroll({ target, offset: ['start start', 'end start'] })` gives a 0→1
  `scrollYProgress`; it is run through `useSpring` (stiffness 120, damping 30,
  mass 0.4) so the motion feels weighted instead of 1:1 with the wheel.
- Every visual is a `useTransform` of that single spring value mapped to keyframed
  ranges: eyebrow fades in early, letters resolve in the middle, the logo + tagline
  appear late, then `stageOpacity`/`stageZ`/`stageScale` push the whole stage back
  (translateZ 0→600) and fade it out over the last 15% to reveal the page.
- Each **letter is its own component** that computes a staggered window from its
  index (`start = 0.08 + (i/total)*0.42`) and animates `translateZ` (-1400→0),
  `rotateX` (70→0), alternating `rotateY` (±32→0), opacity, and a `blur(20px)→0`
  filter. That is what makes letters "fall into place" out of depth one by one.
- Supporting cinematic layers are all CSS gradients tied to the same progress:
  a parallax haze (`y` 0→-30%), a vignette, a screen-blend halation bloom that
  peaks mid-reveal, and two `bg-density` **letterbox bars** that shrink from
  `18vh` to `0vh` as the letters land.
- A `ScrollHint` ("Scroll" + a bouncing tick) shows at progress 0 and fades by 0.15;
  static chrome (reel marker, "24.000 fps") is plain absolutely-positioned text.

## Data model
Stateless. No props, no storage, no flags, no network. The only input is the
window scroll position; the only output is rendered DOM. It also reads
`/logo.png` (Next `<Image>`) and the `RENDEZVOUS` string constant.

## Key decisions & gotchas
- **CSS 3D, not WebGL.** The "3D" is `preserve-3d` + `perspective: 1600` +
  per-letter `translateZ`/`rotateX`/`rotateY`. Cheap and dependency-light, but it
  is transform-and-filter heavy: animating `filter: blur()` on every letter plus
  big gradient repaints can cost on low-end mobile. If it janks, drop the per-letter
  blur first, it is the most expensive piece.
- **Scroll as the clock.** Tying the timeline to scroll (vs a timer) means the user
  can't be rushed and the intro naturally becomes "just scrolling" if they flick
  past. The cost is you spend ~2.6 viewports of scroll height before real content.
- **Spring smoothing is deliberate.** Raw `scrollYProgress` feels mechanical;
  `useSpring` adds inertia. It also means the visuals slightly lag the wheel, which
  is the intended cinematic feel, not a bug.
- **One-time vs replay.** This is NOT one-shot, it is fully scrubbable: scrolling
  back up replays it in reverse every time. There is no "seen it once" guard. If you
  want a play-once intro, you must add that yourself (and it changes the UX a lot).
- **Reduced motion is only partially honored.** The site's global CSS kills the
  idle `.gate-weave` shimmer under `prefers-reduced-motion: reduce`, but the
  scroll-driven 3D reveal itself is NOT guarded. A reduced-motion user still gets
  the full fly-in. For accessibility you should branch on
  `useReducedMotion()`/`matchMedia` and render a static title.
- **SSR / hydration.** It is a `'use client'` component rendered directly in the
  Server Component page (no `next/dynamic`, no `ssr:false`). Framer Motion handles
  the scroll hooks on the client; the first paint is the progress-0 state. If your
  framework chokes on window access during SSR, wrap it in a dynamic import with
  `ssr:false`.
- **Hard-coded handoff window.** The stage fully fades at progress 1.0 and the page
  below is expected to start there. If you change `h-[260vh]` you shift where the
  reveal finishes relative to the fold, retune the transform ranges together.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/intro-3d.tsx` | Whole intro: sticky scroll stage, per-letter 3D `Letter`, `ScrollHint`, gradient haze/vignette/halation/letterbox layers | `framer-motion` (`motion`, `useScroll`, `useTransform`, `useSpring`), `next/image`, Tailwind tokens `bg-density`/`text-bone`/`bg-halation`/`gate-weave`/`tracking-tightest`, asset `/logo.png` |

## Adaptation notes
- **Swap the brand geometry/assets:** change the `TITLE` constant from `RENDEZVOUS`,
  replace `/logo.png` and the "Film by" / "Est. 2026 · Los Angeles" / reel-marker /
  "24.000 fps" copy. None of that is parameterized, it is inlined.
- **Port the design tokens:** `bg-density`, `text-bone`, `bg-halation`, `gate-weave`,
  `tracking-tightest`, `font-serif`, and the `bone`/`halation`/`gold` colors are
  defined in the source repo's `globals.css`/Tailwind config. Either bring those
  CSS variables and utilities over or replace each class with your own.
- **Drop `next/image`** for a plain `<img>` (or your framework's image) if you are
  not on Next.
- **Tune the feel:** the spring constants, the `18vh` letterbox, the `260vh` section
  height, the per-letter window math, and `perspective: 1600` are all hand-tuned to
  one 9-letter wordmark. A longer/shorter word changes the stagger spacing.
- **Add a reduced-motion path** and (optionally) a play-once guard before shipping,
  neither exists here.

## Provenance
- Origin file: `rendezvous-site/src/components/intro-3d.tsx` @ `3cfd9d6`
- Consumed by: `rendezvous-site/src/app/page.tsx` (rendered first, above `<Hero>`)
- Related memory: `project_rendezvous_site.md` (Kodak film system + 3D scroll intro)
