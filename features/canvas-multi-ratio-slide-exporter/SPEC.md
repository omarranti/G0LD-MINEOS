# Canvas Multi-Ratio Slide Exporter (safe-box + headless harvest)

> One in-browser canvas renderer that turns a single slide-deck definition into retina PNG assets for five social platforms at once, and a Playwright script that drives the same UI headlessly for batch production.

<!-- Structure over skin: the value is the ratio table, the safe-box math, and the UI-doubles-as-CLI pattern. The brand template drawn inside is disposable. -->

- **Slug:** `canvas-multi-ratio-slide-exporter`
- **Tags:** `social-assets, canvas, export, generative-art, seeded-rng, playwright, marketing, automation`
- **Source project:** wellness web app (marketing site + team console)
- **Stack:** Next.js App Router client page (Canvas 2D, zero render deps) + Playwright driver script
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live in the team console; driver script used for real campaign exports

## Problem it solves
Publishing one carousel to Instagram, TikTok, X, LinkedIn, and Pinterest means the same design in five aspect ratios (1:1, 4:5, 9:16, 16:9, 1.91:1). Doing that in a design tool is N slides x 5 ratios of manual resizing per revision, and every copy tweak restarts the loop. This makes the deck a data structure: edit `SlideConfig[]` once, press one button (or run one script), get `N x 5` retina PNGs with platform-token filenames.

## When to reach for this
- Any recurring social/content pipeline where the same creative ships to multiple platforms and revisions are frequent.
- You want pixel-identical brand templates enforced by code (fonts, spacing, chrome), not by whoever last opened the design file.
- You want batch export automated (cron, CI, agent-driven) but don't want to maintain a second server-side render path: the browser page IS the renderer, Playwright just drives it.
- Also useful as a reference for any "draw a fixed design into differently sized canvases" problem (OG images, story vs feed variants).

## How it works
1. **A slide is data.** `SlideConfig` holds headline/subtext/CTA text, per-slide font sizes and gaps, and toggles (arrow, logo, date stamp). Presets are just functions returning `SlideConfig[]`.
2. **Ratio table.** `EXPORT_RATIOS` maps a token (`1x1`, `4x5`, `9x16`, `16x9`, `1-91x1`) to `{label, w, h}`. The token lands in the filename so downstream tooling can route files by platform.
3. **Safe content box.** `renderSlide()` treats 1080x1080 as the master content area (`CANVAS_SIZE`). For any target canvas `W x H` it computes `ox=(W-S)/2, oy=(H-S)/2` and translates: background gradient and generative overlay fill the FULL canvas, edge chrome (date stamp top-left, logo bottom-right) anchors to the real canvas edges, and all text lays out centered inside the 1080 box. One layout pass serves every ratio.
4. **Retina.** Export uses `dpr = 2`: `canvas.width = W * dpr` then `ctx.scale(dpr, dpr)`, so all drawing code stays in logical pixels.
5. **Seeded generative backgrounds.** `mulberry32(seed)` feeds a seeded Perlin permutation table; 3-octave fBm samples a 60-column field; marching squares extracts contour isolines at 8 thresholds into SVG path strings stroked as `Path2D` (plus cheaper `waves` and `grid` modes). Same seed = same texture, so thumbnails, preview, and all five exports match, and "reroll" is just a new seed.
6. **Batch download via toBlob.** `exportAllRatios` loops slides x ratios sequentially, renders each into a throwaway canvas, and triggers an anchor-click download per blob with a 150ms settle delay so the browser doesn't drop files. Filenames: `brand_title_slide_N_ratioToken.png`.
7. **Same UI doubles as CLI.** `export-carousels.mjs` launches headless Chromium with `acceptDownloads`, opens the page, waits for fonts, selects a preset from the dropdown, overwrites the title input (clean filenames), clicks the "All ratios" button, and saves every `download` event to an output dir. No second render implementation to keep in sync.
8. **CTA-word linting.** The generate-from-text flow splits pasted copy into slides ("slide N" markers or blank lines) and classifies any line starting with a `CTA_WORDS` entry (download, try, join, link in bio, ...) as the CTA rather than headline/subtext, so pasted scripts land in the right slots.

## Data model
Rendering is stateless. The origin page also persists decks to a team-console asset API (`/api/team/assets`: `id, title, type: 'carousel', slides JSON, status, updated_at`) for save/load; that layer is dropped from the excerpt and easily replaced or deleted.

## Key decisions & gotchas
- **Center-inscribe, not scale.** The 1080 box is never scaled to fit the target ratio; it is centered. For canvases larger than 1080 in a dimension (4:5, 9:16, 16:9) the design gains breathing room filled by background + overlay. For 1.91:1 (1200x628) `oy` goes NEGATIVE, so the same math silently becomes a center-crop: tall content gets clipped. That is accepted by design (quote cards survive; 10-line slides do not). Check vertical extent before trusting the 1.91:1 output.
- **Edge chrome vs content split.** Date stamp and logo are positioned off the real canvas edges, outside the translate, so they stay in the corners at every ratio instead of floating mid-canvas. That split (full-canvas background + edge chrome + safe-box content) is the whole trick.
- **Fonts must be awaited.** Canvas silently falls back to serif if you draw before `document.fonts.load(...)` resolves. The page gates rendering on `fontsReady`; the headless driver additionally sleeps 4s after load. Skip this and exports differ from preview.
- **Sequential downloads with delays.** Firing 50 anchor-clicks synchronously makes browsers drop downloads. The loop awaits each `toBlob` and sleeps 150 to 200ms per file. The driver sizes its wait as ~500ms per expected file.
- **Seed in state, not `Math.random()` at draw time.** Every render (thumbnail, preview, five export sizes) must produce the same texture or the deck looks inconsistent across platforms.
- **`ctx.letterSpacing` string units.** Set as `` `${n}em` `` before `fillText`; save/restore around it so it doesn't leak into other text.
- **Bold inside a line.** `**bold**` markers are parsed into segments, measured individually, and drawn left-to-right from a centered start so mixed-weight lines still center correctly.
- **Deliberately not handled:** per-ratio layout reflow (no responsive text), server-side rendering (no node-canvas), and parallel downloads.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/carousel-page-excerpt.tsx` | Trimmed excerpt (596 of 1533 lines): types, template constants, `EXPORT_RATIOS`, seeded RNG + Perlin/fBm + marching squares overlays, canvas text layout, `renderSlide()` safe-box math, gradient progression, toBlob batch loops, CTA-word classifier | Font files under `/fonts/...` + Google Fonts link, brand `COLORS`/`FONT` constants, `/api/team/assets` (dropped from excerpt) |
| `code/export-carousels.mjs` | Full Playwright driver: headless Chromium opens the console page, selects presets, clicks "All ratios", harvests N x 5 download events to disk | `playwright` (chromium), `OUTPUT_DIR` path, `localhost:3030` URL, `PRESETS` list |

## Structure to keep, skin to drop
- **Keep (the idea):** the `EXPORT_RATIOS` token table and token-suffixed filenames; the fixed safe content box centered via `(W-S)/2` with full-canvas background and edge-anchored chrome; `dpr`-scaled export canvases; seeded RNG driving all generative texture; the sequential toBlob download loop with settle delays; font-readiness gating; the headless driver that reuses the UI as the only renderer; the CTA-word classification in text-to-slides.
- **Drop (regenerate natively):** the entire visual language: PP Pangaia / DM Sans, the blush gradient palette, the gold "T" logo mark, the arrow glyph, date-stamp styling, topo overlay as default, all brand presets and their copy, the dark editor chrome. Rebuild the template constants (`COLORS`, `FONT`, `LOGO`) for the destination brand.

## Adaptation notes
- Excerpt is reference-shaped: the export functions and `makeOpts` use component state (`slides`, `assetTitle`, `setExporting`); re-wrap them in your page or lift them into a module that takes those as arguments.
- Swap the `@font-face` sources and the `document.fonts.load` list to your brand fonts; keep the await.
- Driver script: set `OUTPUT_DIR`, the dev-server URL/port, and `PRESETS` (`slideCount` only sizes the wait). Needs `npm i -D playwright` and a running dev server. Selectors are loose (`select`, first text input, button text "All ratios"); rename carefully or tighten selectors.
- Decide per ratio whether center-crop is acceptable; if not, either cap content height for wide ratios or add a scale-to-fit branch for `H < CANVAS_SIZE`.
- Delete or rewire the save/load asset API; it is orthogonal to rendering.

## Provenance
- Origin files: `therma-site/app/team/marketing/carousel/page.tsx` (trimmed excerpt, kept code verbatim) and `therma-site/scripts/export-carousels.mjs` (full copy) @ 2026-08-08 (wellness web app, live).
- Related features: [[content-truth-gates]] (same origin repo's marketing pipeline)
- Related memory: organic reels / carousel batch production lane.
