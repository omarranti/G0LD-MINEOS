# Web Design Token System (Tailwind + CSS variables)

> The design-system layer to build before any page: a semantic type scale, named color/radius/shadow scales, a variable-driven light/dark theme, and shared component classes, so every project starts from the same primitives and only the skin changes.

- **Slug:** `web-design-token-system`
- **Tags:** `design-system, tokens, tailwind, css, dark-mode, accessibility`
- **Source project:** website template (reusable base)
- **Stack:** Tailwind CSS v3 + CSS variables (framework-agnostic)
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live in prod (used across multiple shipped sites)

## Problem it solves
Every new site re-litigates the same foundations: type scale, spacing, colors, radii, shadows, dark mode, focus states, reduced-motion. Skip it and you get magic numbers and inconsistent components; hardcode a palette and dark mode becomes a second stylesheet. This is the "build the system before the pages" layer (website-standard Phase 2) as two files you copy and reskin.

## When to reach for this
- Starting any marketing site, landing page, or app front end and you want a token foundation, not ad-hoc classes.
- You need light/dark mode without maintaining two sets of styles.
- You want an accessibility floor (visible focus, reduced-motion) baked in from line one.

## How it works
1. **Type scale carries its own line-height/weight/tracking.** `text-h1`, `text-eyebrow`, etc. bundle size + leading + weight + tracking, so headings are consistent without per-use tuning.
2. **Named scales, not magic numbers.** Color (`brand.*`, `semantic.*`), radius (`brand`/`pill`), and shadow (`card`/`button`/`glass`) are all scales. Components reference names.
3. **Dark mode is a variable flip.** `:root` and `[data-theme="dark"]` define the SAME variable names with different values. Set `data-theme="dark"` on `<html>` and everything re-themes. No component knows about dark mode.
4. **Component classes for the primitives.** `.section-eyebrow/.section-title/.section-subtitle`, `.btn-primary/.btn-ghost`, `.input-field`, `.scroll-reveal-base/.scroll-revealed`. Sections and pages compose these.
5. **Accessibility floor.** A global `prefers-reduced-motion` reset and a `:focus-visible` ring ship in the base layer, so you cannot forget them.

## Data model
Stateless. Two files: `tailwind.config.ts` (scales) and `globals.css` (the variable layer + component classes). Fonts loaded via `--font-display` / `--font-body` (here from Google Fonts; swap for `next/font` in production).

## Key decisions & gotchas
- **Same variable names in light and dark is the whole trick.** If dark mode introduced new names, every component would branch. Keep the names, change the values.
- **Animate transforms/opacity only.** The motion kit deliberately animates `transform`/`opacity` (compositor-friendly), never layout properties. This is also why the reduced-motion reset is a blanket rule.
- **Palette and fonts are SKIN.** The hexes here are one project's look. Regenerate them per brand; the value is the scale structure, dark-mode mechanism, and component classes, not the colors.
- **`next/font` in real builds.** The `@import url(...)` Google Fonts line is convenient but render-blocking; production sites should use `next/font` (or self-host) and keep the `--font-*` variables.
- **Not included:** spacing-scale overrides (Tailwind's default is kept), container queries, and the full set of decorative utilities (textures, gradients) from the origin. those are skin.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/tailwind.config.ts` | The scales: color, semantic type, radius, shadow, motion kit, brand easing. | Tailwind v3 |
| `code/globals.css` | CSS-variable light/dark layer, base a11y (reduced-motion, focus), and `.section-*`/`.btn-*`/`.input-field` component classes. | the config's tokens |

## Structure to keep, skin to drop
- **Keep (the idea):** the semantic type scale with baked leading/weight, named color/radius/shadow scales, the same-name light/dark variable mechanism, the component classes, and the a11y floor.
- **Drop (regenerate natively):** every hex value, the font families, and the decorative animation flavor. all per-project skin.

## Adaptation notes
- Drop both files in; point `content` at your source globs. Toggle dark mode by setting `data-theme` on `<html>` (see the `theme-toggle` pattern in most of these sites).
- Regenerate the palette and fonts for the brand; keep the scale names so components don't change.
- Swap the Google Fonts `@import` for `next/font` in production.
- Extend `semantic.*` for any status colors your product needs.

## Provenance
- Origin files: `tailwind.config.ts`, `src/styles/globals.css` @ `origin/main` (reusable website template, used across shipped sites). Genericized: decorative texture utilities trimmed; example palette kept as illustrative skin.
- Related features: [[marketing-section-kit]], [[scroll-reveal-on-view]], [[website-launch-gate]]
- Related memory: website-standard skill (Phase 2 design system); structure-over-skin.
