# Website Launch Gate

> A blocking pre-launch checklist covering conversion, performance, accessibility, SEO, content, cross-device, and analytics, so "is it ready to ship" is a pass/fail gate instead of a vibe.

- **Slug:** `website-launch-gate`
- **Tags:** `website, launch, qa, checklist, seo, accessibility, performance`
- **Source project:** website build methodology (reusable standard)
- **Stack:** framework-agnostic (applies to any site)
- **Reuse confidence:** reference-only
- **Status in origin:** in active use across shipped sites

## Problem it solves
Sites ship with the obvious stuff done and the easy-to-forget stuff missing: no reduced-motion, a form with six needless fields, JSON-LD that never validated, analytics wired up the day AFTER launch so the launch spike is lost forever. This turns "ready?" into a gate you cannot pass on feel.

## When to reach for this
- Right before launching or handing off any marketing site, landing page, or client build.
- As a definition-of-done you can hold a build against (yours or a contractor's).
- When you keep shipping and then discovering the same class of miss (analytics late, a11y skipped, sitemap wrong).

## How it works
1. **It blocks.** A failing item stops launch. The point is that it is not advisory.
2. **Seven areas, each concrete.** Conversion, performance (Core Web Vitals), accessibility, SEO, content, cross-device, analytics. Every item is checkable, not aspirational.
3. **Audit absence.** Several items ("trust layer present", "what is MISSING") push you to look for gaps, not just verify what exists.
4. **Analytics before launch, not after.** Called out explicitly because it is the most common irreversible miss: you only get one launch spike, and you cannot instrument it retroactively.

## Data model
None. A markdown checklist you copy into a PR description or a launch issue and tick off.

## Key decisions & gotchas
- **Analytics live BEFORE launch is non-negotiable.** Every other item you can fix post-launch; launch-day traffic you cannot re-capture.
- **Core Web Vitals fail silently.** Layout shift and FOIT do not throw errors; they just quietly cost conversions and rankings. that is why they are explicit boxes.
- **Real-device mobile, not devtools.** Emulated 375px hides touch-target, safe-area, and font-rendering issues that only a real phone surfaces.
- **The gate is the floor, not the ceiling.** Passing it means "safe to ship", not "optimized." Post-launch iteration (A/B on the highest-leverage surface) is a separate loop.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/CHECKLIST.md` | The full blocking gate, grouped by area. Paste into a launch PR/issue and tick. | none |

## Structure to keep, skin to drop
- **Keep (the idea):** the seven areas, the blocking-gate framing, analytics-before-launch, and the audit-absence items.
- **Drop (regenerate natively):** add or remove items for your stack (e.g. e-commerce checkout QA, i18n, consent/GDPR) and wire it to your actual CI or PR template.

## Adaptation notes
- Drop `CHECKLIST.md` into your repo (e.g. `.github/PULL_REQUEST_TEMPLATE/launch.md`) so it appears on every launch PR.
- Turn the SEO and performance boxes into automated checks where you can (Lighthouse CI, a link/JSON-LD validator) and leave judgment items manual.
- Pair with the analytics capture and pSEO patterns in this library for the "analytics live" and "SEO" rows.

## Provenance
- Origin: the website-build standard's launch-gate phase (reusable methodology). Genericized: internal skill/tool references removed; substance intact.
- Related features: [[web-design-token-system]], [[marketing-section-kit]], [[pseo-inventory-gated-pages]], [[posthog-server-capture]], [[consent-gated-analytics]]
- Related memory: website-standard skill (Phase 6 launch gate).
