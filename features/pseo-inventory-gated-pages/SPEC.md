# Programmatic SEO with an Inventory Gate

> Generate the full city x type cartesian of directory pages, but keep the empty ones out of the index until they have real content, so a big thin tail never drags your whole domain's helpful-content signal.

- **Slug:** `pseo-inventory-gated-pages`
- **Tags:** `seo, pseo, programmatic, nextjs, directory`
- **Source project:** web app (directory / marketplace)
- **Stack:** Next.js 15 App Router (ISR) + Prisma + Postgres
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live in prod

## Problem it solves
Programmatic SEO tempts you to ship thousands of `[city] x [type]` pages at once. Most start empty. Google's helpful-content system scores sitewide: a large tail of thin, empty template pages can suppress rankings for your *good* pages too. This ships the whole cartesian for coverage while making empty pages non-indexable until they earn it, so growth in page count never becomes a sitewide liability.

## When to reach for this
- You are building directory / location / category pages from data (`[city]/[type]`, `[service]/[city]`, `[integration]`, etc.).
- Inventory fills in unevenly over time. some combos are rich on day one, most are empty.
- You have been burned by (or want to avoid) a thin-content or helpful-content ranking hit from shipping pages faster than content.

## How it works
1. **Generate the full cartesian.** `generateStaticParams` returns every `city x type` combo. Coverage is the point; the gate, not this list, decides indexability.
2. **One shared where-clause.** `whereFor(city, type)` is used by both the page query and the count, so "what's on the page" and "is it indexable" can never disagree.
3. **The inventory gate.** `generateMetadata` counts active listings for the combo. `count === 0` -> `robots: { index: false, follow: true }`; otherwise `index: true`. Empty pages stay crawlable (link equity flows) but stay out of the index.
4. **ISR flips it automatically.** `export const revalidate = 3600`. The next rebuild after a listing lands turns the page indexable with zero manual work.
5. **Sitemap applies the SAME gate.** The sitemap only emits spokes for cities with active inventory, so it never advertises a `noindex` URL. Mixed signals ("crawl this" + "don't index this") are avoided because both consumers read the same active-inventory source.

## Data model
```
Listing   id   name   status ("ACTIVE"|...)   state   city   type   ...
```
Plus a config module (`@/config/pseo`) of the SEO dimensions: `CITIES` (slug, name, stateAbbr, dbNames[]), `TYPES` (slug, plural, dbValue). `dbNames[]` maps one URL slug to the several spellings a city has in the data.

## Key decisions & gotchas
- **`index:false, follow:true`, not `noindex,nofollow`.** Empty pages must still pass link equity and be discoverable. you are deferring indexing, not hiding the page. `follow` keeps internal links live.
- **Sitemap and meta-robots MUST agree.** The classic bug: sitemap lists every combo, half of them `noindex`. Google reads that as a low-quality signal. Gate both off the same inventory query.
- **Count with a `.catch(() => 0)`.** A DB hiccup during metadata generation should fail closed (treat as empty / noindex), never throw and 500 the page.
- **Slug-to-DB city mapping is real work.** "nyc" might be "New York", "New York City", "Manhattan" in the data. `dbNames[]` + `city: { in: [...] }` handles it; a naive `city === slug` silently returns zero listings and noindexes a page that actually has inventory.
- **Deliberately not included:** JSON-LD/schema, breadcrumb and cross-link modules, neighborhood/cuisine/intent sub-dimensions, and the analytics wiring. the origin layers all of these on top of this same gate.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/page.tsx` | The spoke: `generateStaticParams` (cartesian), `whereFor` (shared filter), `generateMetadata` (the count-driven robots gate), and the page render with an indexable-only-when-populated empty state. | `@/lib/db` (Prisma), `@/config/pseo` |
| `code/sitemap.ts` | Emits spokes only for cities with active inventory, mirroring the page's gate. | `@/lib/db`, `@/config/pseo` |

## Structure to keep, skin to drop
- **Keep (the idea):** the full-cartesian `generateStaticParams`, the shared where-clause, the `count === 0 -> noindex,follow` gate, ISR auto-promotion, and sitemap/meta-robots consistency off one inventory source.
- **Drop (regenerate natively):** the exact dimensions (`city`, `type`), the `Listing` schema and status enum, the copy in titles/descriptions, and all page rendering/layout.

## Adaptation notes
- Build the `@/config/pseo` module for your dimensions. Include the `dbNames[]` slug->data mapping if your entities have messy real-world names.
- Point `whereFor` at your table and status field. Keep the page query and the count using it so they can't drift.
- Set `revalidate` to how fast you want empty pages promoted after content lands (1h is a sane default).
- Set `BASE` in the sitemap and confirm the active-inventory query matches the page's gate exactly.

## Provenance
- Origin files: `src/app/(marketing)/[city]/[type]/page.tsx`, `src/app/sitemap.ts` @ `origin/main` (directory web app, live). Genericized: domain dimensions, brand, copy, and the richer cuisine/intent/neighborhood variants removed; the inventory gate and sitemap-consistency logic intact.
- Related features: [[news-scraper-to-static-feed]]
- Related memory: pSEO re-gate on inventory; the thin-page ranking-drop lesson.
