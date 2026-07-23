# Website Launch Gate (blocking)

The site does not ship until every box passes. This is a gate, not a wishlist:
a failing item blocks launch. Audit what is MISSING, not just what is broken.

## Conversion
- [ ] One primary CTA per page, repeated at natural decision points.
- [ ] Above the fold answers "what is this, who is it for, why care" in ~5 seconds.
- [ ] Trust layer present: proof, testimonials or credentials, objection handling,
      FAQ where warranted.
- [ ] Every form field justifies its friction (drop the ones that don't).
- [ ] Closing CTA offers ONE action, not a menu.

## Performance (Core Web Vitals)
- [ ] Images optimized: modern formats (AVIF/WebP), explicit width/height, lazy
      loading below the fold.
- [ ] No layout shift (CLS): reserved space for images, embeds, and fonts.
- [ ] Fonts load without FOIT (font-display: swap, or preload/self-host).
- [ ] No render-blocking third-party scripts above the fold.

## Accessibility
- [ ] Keyboard navigable end to end; logical focus order.
- [ ] Visible focus states (`:focus-visible`).
- [ ] Contrast meets WCAG AA.
- [ ] `prefers-reduced-motion` respected; motion never blocks reading.
- [ ] Images have meaningful alt text; landmarks/headings are structured.

## SEO
- [ ] Unique `<title>` and meta description per page.
- [ ] Canonical URLs set; no accidental duplicates.
- [ ] `sitemap.xml` and `robots.txt` present and correct.
- [ ] Open Graph / Twitter card tags for shareable pages.
- [ ] JSON-LD validates (Google Rich Results Test).
- [ ] Internal links from the planned architecture are in place.

## Content
- [ ] Copy went through a variant/tournament pass on the highest-leverage
      surfaces (hero, primary CTAs), then a human-edit pass.
- [ ] Claims are verified; no unsupported superlatives.
- [ ] Voice is consistent with the brand.

## Cross-device
- [ ] Real-device mobile pass (not just devtools): every section checked at
      375px width.
- [ ] Tap targets >= 44px; no horizontal scroll; safe-area insets handled.

## Analytics (live BEFORE launch)
- [ ] Pageviews firing.
- [ ] CTA clicks tracked.
- [ ] Form starts and completions tracked.
- [ ] One north-star conversion event defined and firing.
