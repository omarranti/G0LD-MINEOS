# Build-Correctness Linters (caching, SEO, dead instrumentation)

> Three CI lint scripts that fail the build on bug classes the framework never warns about: DB-backed pages that silently freeze at deploy, SEO metadata that self-sabotages, and analytics events the code emits but the warehouse never receives.

<!-- Structure over skin: the value is the three detection mechanisms, not the specific event names or routes in the examples. -->

- **Slug:** `build-correctness-linters`
- **Tags:** `ci, lint, correctness, caching, seo, analytics, posthog, nextjs, static-analysis`
- **Source project:** directory / marketplace web app
- **Stack:** Next.js 15 App Router + Prisma + PostHog, scripts in tsx (Node stdlib only)
- **Reuse confidence:** drop-in
- **Status in origin:** live in prod (wired into `npm run build` and `npm run verify`)

## Problem it solves
Three failure modes share one shape: everything is green and something important is silently wrong.

1. **Frozen pages.** Next.js statically renders any page that declares no caching posture. Prisma reads (unlike `fetch`) are invisible to Next's dynamic detection, so a page can read live counts from the DB and freeze them at deploy with zero warnings. In origin, homepage hero counts sat stale until the next deploy.
2. **Self-sabotaging SEO.** A noindexed page listed in the sitemap, a 70-char title, a 40-char description. None of it errors; it just quietly costs rankings.
3. **Dead instrumentation.** Events exported from the analytics module, "wired", and never ingested once. In origin, four events sat at zero ingests for 120+ days unnoticed, and a separate incident had signups dead for 15 days while the absence-only check read as healthy.

## When to reach for this
- Any Next.js App Router app where server components read a database directly (the caching linter's exact bug class).
- Any site whose organic traffic matters enough that metadata mistakes should block a merge.
- Any product instrumented with PostHog (or similar) where "we track that" has ever turned out to be false. The dead-instrumentation script is the strongest of the three: it compares what the CODE declares against what the WAREHOUSE actually received.
- You want these as build gates, not as a dashboard someone has to remember to look at.

## How it works
- **lint-caching.ts**: builds a static import graph over `src/` (string-literal `import`/`export ... from`, resolving `@/` and relative paths), reverse-BFS from `@/lib/db` to find every module that transitively reaches Prisma, then requires each reaching `page.tsx`/`layout.tsx` to declare a posture: `revalidate`, `dynamic`, an ancestor force-dynamic layout, a request-time API (`searchParams`, `cookies()`, `headers()`, `auth()`, ...), a leading `"use client"`, or a mandatory-reason `// caching-lint-ignore: <reason>` comment. Traversal stops at `"use server"` modules because imported server actions run on invocation, not at render.
- **lint-seo.ts**: walks every `page.tsx`, extracts the static `export const metadata` block by brace-walking (regex cannot balance braces), and checks five rules: noindex-but-in-sitemap, noindex-but-in-IndexNow-list, title > 60 chars, description outside 120 to 160 chars, and em dashes in title/description (house style). `generateMetadata` pages are skipped by design; length rules only apply to indexed pages.
- **lint-dead-instrumentation.ts**: scrapes event names from source (`capture("...")` client calls AND `captureServer(id, "...")` server calls, surfacing dynamic template-literal names it cannot resolve), then runs ONE HogQL query against PostHog for 30-day totals plus the two trailing weeks. Two checks: **absence** (declared in code, never ingested) and **regression** (fired >= 5 times in the prior week, collapsed to <= floor(prior * 0.1) this week). Only a curated CRITICAL_PATH set fails the build; everything else is INFO.
- Exit codes across all three: 0 clean, 1 violations, 2 crash. Wire caching + SEO into the build; run instrumentation on a schedule (it needs API credentials and live data).

## Data model
Stateless. No DB writes. The instrumentation script reads PostHog's `events` table via the query API.

## Key decisions & gotchas
- **Absence and regression are different failures.** An absence-only check is blind to a regression for its whole window: an event that died on day 1 still "fired in the last 30 days" until day 30. The regression half exists because that exact hole hid a 15-day signup outage.
- **VOLUME_FLOOR = 5, COLLAPSE_RATIO = 0.1, tuned on a real incident.** Below 5/week, percentage drops are noise (2 to 0 is not a signal). The ratio is applied as `floor(prior * 0.1)`, which self-tightens at low volume: at prior=5 only a complete stop fires; at prior=139 a 91% collapse fires. Replaying the origin outage produced one true positive and zero false positives.
- **CRITICAL vs INFO vs CONDITIONAL vs EXPECTED_SILENT.** A permanently red check gets muted, so: only money-path events fail; events with an upstream precondition (`listing_saved` cannot fire before `signup_completed`) escalate to critical only once the precondition fired in the same window; error events are excluded entirely because zero is good news. The long "deliberately NOT critical" comment block is load-bearing documentation, keep the habit.
- **Missing credentials must fail in CI.** The script once sat green for weeks with `POSTHOG_API_KEY` unset, verifying nothing while looking identical to "all clear". Locally it skips; under `process.env.CI` it exits 1.
- **CI severity split:** regressions fail the build immediately (a change away from a working state); dead events notify via issue instead of holding the build red for weeks on a known standing condition. A stable sha256 `FINGERPRINT` of findings lets the workflow avoid re-commenting the same problem.
- **The init-race lesson baked into the comments:** two origin events were "wired" and still never fired, once because nothing imported them, once because they captured on mount before `posthog.init()` ran (see [[posthog-preinit-capture-buffer]]). This linter is what caught both.
- **Caching linter limits (honest):** string-literal static imports only; dynamic `import(variable)`, non-`@/` aliases, and function-level reachability are invisible (hence the ignore comment for module-level false positives, e.g. a page importing only constants from a module that also exports DB functions). Origin also documents a freshness-SLA table per surface (ISR hour for pSEO pages, 60s for browse, force-dynamic for per-user pages) and a rule of one shared `revalidatePath` helper per mutation class instead of scattering path strings; helpers were chosen over `revalidateTag` because tags would force every inline Prisma read through `fetch`/`unstable_cache`.
- **SEO linter deliberately skips** dynamic routes in the sitemap check (they are built via `.map` and cannot be string-matched) and `generateMetadata` blocks (runtime values, out of static reach).
- **Deliberately not handled:** ESLint-plugin packaging (these are standalone scripts on purpose, zero dependencies beyond tsx), multi-provider analytics, and JS-parsed ASTs (regex + brace-walking has been sufficient and keeps the scripts readable).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/lint-caching.ts` | Import-graph linter: pages transitively reaching the DB module must declare a caching posture | `src/lib/db.ts` path (`DB_MODULE`), `@/` alias convention |
| `code/lint-seo.ts` | Static-metadata linter: sitemap/noindex conflicts, title/description length, em dashes | `src/app/sitemap.ts`, `src/app/api/indexnow/route.ts` (delete the IndexNow rule if you have no such route) |
| `code/lint-dead-instrumentation.ts` | Code-vs-warehouse event health: absence + week-over-week regression, money-path severity | `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, PostHog US host URL, the CRITICAL_PATH / CONDITIONAL_CRITICAL / EXPECTED_SILENT sets |

## Structure to keep, skin to drop
- **Keep (the idea):** the reverse-BFS reachability analysis and the accepted-posture list; the brace-walking metadata extractor and noindex-in-sitemap cross-check; the absence + regression dual check, the single HogQL query shape, the volume floor with self-tightening collapse ratio, the four-tier severity model, the fail-loud-on-missing-credentials rule, and the findings fingerprint.
- **Drop (regenerate natively):** every event name in CRITICAL_PATH / CONDITIONAL_CRITICAL / EXPECTED_SILENT and the dated comment blocks explaining them (write your own as you learn); the SEO length thresholds if your SERP strategy differs; the em dash rule if it is not your house style; the specific example routes in comments.

## Adaptation notes
- Run via `tsx` (`npm run lint:caching` etc.); Node stdlib only, no packages to install.
- **lint-caching**: point `DB_MODULE` at your Prisma client module. If you use a path alias other than `@/`, extend `resolveSpecifier`. Wire into the build script so it cannot be skipped.
- **lint-seo**: adjust the two hardcoded reads (`src/app/sitemap.ts`, IndexNow route) to your layout; the sitemap matcher assumes URLs built as `${BASE}/path` template literals.
- **lint-dead-instrumentation**: set `POSTHOG_API_KEY` (personal key, scope `query:read`) and `POSTHOG_PROJECT_ID`; switch the host if you are on EU cloud. Empty CRITICAL_PATH on day one and promote events only after confirming real volume, per the pattern in the comments. If you use a server-capture helper with a different name than `captureServer`, update the regex or the money path's server-side events go invisible.
- Suggested wiring: caching + SEO in `npm run build` and a `verify` script; instrumentation as a scheduled GitHub Action that opens/updates an issue keyed on the FINGERPRINT line.

## Provenance
- Origin files: `scripts/lint-caching.ts`, `scripts/lint-seo.ts`, `scripts/lint-dead-instrumentation.ts` @ main, 2026-08-08 (directory / marketplace web app, live in prod). Gotchas distilled from the origin's `.agents/caching-freshness.md` rules doc. Scrubs: app-name abbreviation removed from script headers and comments; one route example de-branded to `/city/[city]`; internal PR/experiment numbers and a repo-internal doc pointer removed from comments and the violation message. Event names, thresholds, and all control flow are verbatim.
- Related features: [[posthog-preinit-capture-buffer]], [[posthog-server-capture]], [[pseo-inventory-gated-pages]]
- Related memory: observability verification corrections; SEO CTA never-fired incident.
