# Marketing Section Kit (scroll-narrative skeletons)

> The proven section structures for a marketing homepage, in the order that tells a story, so a new site starts from a planned narrative (hook, problem, proof, offer, action) and you only regenerate the skin.

- **Slug:** `marketing-section-kit`
- **Tags:** `marketing, landing-page, sections, layout, conversion, structure`
- **Source project:** website template (reusable base)
- **Stack:** Next.js (App Router) + Tailwind + lucide-react
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live in prod (used across shipped sites)

## Problem it solves
Most landing pages are a pile of sections in whatever order they got built. The reusable asset is not any one section's look, it is the NARRATIVE ORDER and the section skeletons that recur on every site. This captures both so a new build starts from "hook -> problem -> proof -> offer -> action" (website-standard Phase 1) with each section already structured, and the only work left is skin and copy.

## When to reach for this
- Building any marketing homepage or landing page and you want a story arc, not a section dump.
- You want section skeletons (hero, problem, transformation, how-it-works, features, quote, pricing, CTA) that already speak the token system, so they drop into a themed project.
- You keep rebuilding the same sections and want the structure captured once.

## How it works
1. **The page IS the narrative.** `page.tsx` composes sections in a fixed emotional order. Hook (Hero) -> problem (ProblemSection) -> transformation -> how-it-works -> proof (Features) -> social proof (QuoteStrip) -> offer (PricingPreview) -> action (CtaSection). Each section earns its slot.
2. **Sections are token-driven.** Every color is a `var(--...)`, so a section inherits the project's theme (and dark mode) with no edits. See [[web-design-token-system]].
3. **List sections are data-driven.** A section like ProblemSection is a `const ARRAY` mapped to cards. To reskin content you edit the array, not the markup.
4. **Motion via ScrollReveal.** List items wrap in `ScrollReveal` with a staggered `delay`, and the hero uses the `fade-in-up` keyframe staggered by `animation-delay`. Both honor reduced-motion through the token layer.
5. **Consistent rhythm.** Sections share a vertical rhythm (`py-16 sm:py-24`), a centered `max-w` header (eyebrow -> title -> subtitle via `.section-*` classes), and alternate `--bg-primary` / `--bg-elevated` / `--bg-dark` grounds to separate beats.

## Data model
Stateless. Each section owns a local data array (pains, steps, features, tiers). Shared strings (nav, address, socials) come from a `@/config/site` module in the origin (a good pattern to keep: centralize site facts).

## Key decisions & gotchas
- **Order is the product.** Reordering sections changes the argument. Keep hook-first and one-action-last; move the middle beats to fit the story, but do not scatter them.
- **One action in the closing CTA.** The final CTA offers a single action, not a menu. choice paralysis kills conversion at the exact moment you want commitment.
- **The hero headline is high-stakes.** Per doctrine it should be tournamented (5-8 variants), not first-drafted. The skeleton leaves it as placeholder on purpose.
- **Skeletons, not designs.** Copy here is placeholder and layout is deliberately plain. the origin's fully-skinned versions (decorative blurs, product art, real copy) are the skin you regenerate.
- **Not included:** nav, footer, and the transformation/how-it-works/features/quote/pricing bodies are referenced in `page.tsx` but only three representative skeletons ship here (hero, a data-driven list section, closing CTA). they all follow the same three rules above.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/page.tsx` | The narrative: composes the sections in story order. | the section components |
| `code/hero.tsx` | Hook skeleton: eyebrow pill, emphasized headline, dual CTA, trust strip, staggered entrance. | `lucide-react`, token classes |
| `code/problem-section.tsx` | The data-array-to-card-grid pattern every list section uses, with staggered `ScrollReveal`. | `@/components/shared/scroll-reveal`, `lucide-react` |
| `code/cta-section.tsx` | Closing ask on a dark ground: one action, restated promise. | `lucide-react`, token classes |

## Structure to keep, skin to drop
- **Keep (the idea):** the narrative section order, the token-driven sections, the data-array-to-grid pattern, `ScrollReveal` staggering, the shared rhythm and `.section-*` header pattern, and one-action CTAs.
- **Drop (regenerate natively):** all copy, the decorative backgrounds/art, icon choices, and the specific number of items per section. Tournament the hero copy; do not paste it.

## Adaptation notes
- Install the [[web-design-token-system]] first. these sections assume its `var(--...)` tokens and `.section-*`/`.btn-*` classes.
- Build a `@/config/site` module for shared facts (nav, socials, contact) and read from it in nav/footer/CTA.
- Fill the referenced sections (transformation, how-it-works, features, quote, pricing) using the same data-array pattern as `problem-section.tsx`.
- Reorder the middle beats to fit your story; keep hook first and a single-action CTA last.

## Provenance
- Origin files: `src/app/(marketing)/page.tsx` + `src/components/marketing/*` @ `origin/main` (reusable website template). Genericized: all brand copy and decorative skin replaced with placeholders; three representative section skeletons shipped.
- Related features: [[web-design-token-system]], [[scroll-reveal-on-view]], [[scroll-sticky-cta]], [[website-launch-gate]]
- Related memory: website-standard skill (Phases 1-2); structure-over-skin.
