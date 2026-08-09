# Content Truth Gates (stale-claim build gate + citation verifier)

> Two scripts that treat factual claims in marketing and pSEO copy as CI assertions: a prebuild gate that fails the build when outdated launch-phase phrases reappear, and an audit that checks every scientific citation against the real paper it points to.

<!-- Structure over skin: the value is "facts as assertions", not the specific phrases or the NCBI plumbing. -->

- **Slug:** `content-truth-gates`
- **Tags:** `ci, build-gate, content-integrity, facts, citations, pseo, seo, marketing`
- **Source project:** wellness web app (marketing site + team console)
- **Stack:** Node scripts; `.mjs` prebuild gate (node stdlib only) + TypeScript audit run via tsx (stdlib + `fetch`)
- **Reuse confidence:** adapt-the-shape (the gate) / reference-only (the NCBI citation verifier)
- **Status in origin:** gate live in prod (wired into `prebuild`); citation audit run on demand against ~hundreds of pSEO citations

## Problem it solves
Marketing copy rots in two specific ways that review never reliably catches:

1. **Stale launch-phase facts.** The app went from waitlist to live with locked pricing, but "join the waitlist" and "pricing TBD" kept resurfacing in the competitive money pages, usually via an old branch, a template copy-paste, or an LLM regenerating a page from stale context. Humans skim past it because it used to be true.
2. **Hallucinated citations.** pSEO content cites PubMed/PMC papers by label and URL. Some labels described papers that the URL does not point to (wrong paper, invalid ID, or an LLM-invented pairing). Nobody clicks through hundreds of links, so a mislabeled citation ships and sits there undermining the site's credibility claims.

Both become mechanical checks: a stale claim or mislabeled citation fails loudly instead of shipping.

## When to reach for this
- Any product that crossed a factual state change (waitlist to live, beta to GA, old pricing to new) where the dead phrases keep crawling back into copy.
- LLM-assisted content pipelines: generated or regenerated pages are exactly where yesterday's facts reappear, so the gate belongs in the build, not in a review checklist.
- pSEO or content marketing that cites external sources at a scale nobody will hand-verify.
- Companion to [[build-correctness-linters]]: same philosophy (green build means these bug classes are absent), applied to editorial truth instead of code correctness.

## How it works
**Gate (`check-competitive-facts.mjs`):**
1. A hardcoded list of the money pages (the three competitive content files) and one regex of forbidden stale phrases (`/waitlist|TBD/i`).
2. Line-by-line scan; every hit prints `file:line` plus the offending line.
3. On any hit, print a remediation message that states the CURRENT facts (pricing is live: free tier, $9.99/mo, $59.99/yr, founding annual $39.99) and `process.exit(1)`.
4. Wired as an npm pre-script: `"prebuild": "node scripts/check-competitive-facts.mjs"` (origin chains it after an asset-indexing step), so `npm run build` cannot skip it, locally or on Vercel/CI.

**Citation verifier (`verify-citations.ts`):**
1. Walks the five pSEO JSON clusters (`content/pseo/data/*.json`), collecting every `page.sources[]` entry with its cluster + slug.
2. Parses each URL into `{db, id}`: PMC article paths, legacy `www.ncbi.nlm.nih.gov/pmc/` paths, NCBI Bookshelf (`NBK...`), PubMed numeric IDs, everything else `other`.
3. Batch-queries NCBI E-utilities `esummary` (JSON mode) per db with comma-joined unique IDs, 100 per request, 400ms between requests (under the 3 req/sec no-key limit), 3 attempts with linear backoff.
4. Scores each citation by token overlap: fraction of the cited label's tokens found in the fetched real title, after lowercasing, stripping non-alphanumerics, dropping tokens under 3 chars and a stopword set.
5. Emits `scripts/audit/audit-report.md` sorted worst-first: Flagged (< 0.25, almost certainly wrong), Borderline (0.25 to 0.5), Manual check (Bookshelf / non-PMC / unfetchable, score -1), Clean (one-liners only).

## Data model
Stateless. The gate reads content source files; the verifier reads content JSON and writes one markdown report. No DB.

## Key decisions & gotchas
- **Deny-list, not truth-list.** The gate does not verify that current pricing appears; it asserts that known-dead phrases do NOT. That makes it dumb, fast, dependency-free, and immune to phrasing variety in the valid copy. When facts change again, you add the newly dead phrases.
- **The remediation message carries the current facts.** Whoever hits the failure (human or agent) gets told what is true now, in the error itself, so the fix does not require tribal knowledge. When pricing changes, update the message alongside the regex or the gate starts teaching the wrong facts.
- **Scoped to the money pages.** Scanning the whole repo would flag legitimate uses ("competitors still run waitlists"). The FILES list is the blast radius control; broaden it deliberately.
- **Prebuild, not a lint step someone runs.** npm's `pre` hook means the check rides every `next build` with zero workflow changes. The citation verifier is deliberately NOT in the build: it needs network and a third-party API, so it runs on demand or on a schedule. Same severity split as [[build-correctness-linters]] (deterministic checks gate, credentialed/networked checks report).
- **Asymmetric overlap score, on purpose.** Score = label tokens found in real title / label tokens. Labels are short paraphrases of long titles, so recall of the label against the title is the meaningful direction; symmetric similarity would punish every citation for the title being longer.
- **The stopword list includes citation-generic vocabulary** (study, review, meta, randomized, controlled, trial, journal...). Without it, every label scores nonzero against every paper and hallucinations hide in the noise. Threshold 0.25 was picked so flags are "almost certainly wrong", not style nits.
- **Unfetchable is a bucket, not a failure.** Bookshelf and non-PMC sources score -1 and sort to a manual-check section instead of crashing or false-flagging. `esummary` sometimes returns an `error` field in place of a title; it flows through as the "actual" text and scores low, which is the right outcome.
- **Dedupe IDs before fetching.** The same paper cited from many pages is fetched once; scoring stays per-citation.
- **Worst-first report.** The person reading the audit sees the likely hallucinations at the top and can stop reading at Clean. Sorting is the UX.
- **Deliberately not handled:** author/year/journal cross-checks (title overlap catches the real failure mode), DOI resolution, non-NCBI publishers (they go to manual), and making the verifier a hard gate (external API flakiness would hold builds hostage).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/check-competitive-facts.mjs` | Prebuild gate: scans listed content files for stale launch-phase phrases, prints file:line + current-facts remediation, exits 1 | `FILES` list, `STALE` regex, the pricing facts in the message |
| `code/verify-citations.ts` | On-demand audit: walks pSEO JSON, parses PMC/PubMed/NCBI URLs, batch esummary lookups, token-overlap scores label vs real title, worst-first markdown report | `CLUSTERS` + `content/pseo/data/` layout, `sources[]` shape (`label`, `url`), output path; NCBI-specific throughout |

## Structure to keep, skin to drop
- **Keep (the idea):** facts-as-CI-assertions; the deny-list of dead phrases scoped to named money pages; the remediation message that states current truth; npm `prebuild` wiring so the gate is unskippable; and from the verifier, the shape: collect claims with provenance, resolve each against the authoritative source in batches, score cheaply, report worst-first with an explicit manual-check bucket.
- **Drop (regenerate natively):** the specific phrases (`waitlist`, `TBD`) and pricing facts; the three competitive file paths; the pSEO cluster names and JSON shape; everything NCBI (URL parsing, esummary, rate limits, the biomedical stopwords). If your citations are not PubMed/PMC, the verifier is a template, not a drop-in; that is why it is reference-only.

## Adaptation notes
- Gate: replace `FILES` with your money pages, `STALE` with your dead phrases, and the remediation text with your current facts. Add to package.json: `"prebuild": "node scripts/check-competitive-facts.mjs"` (npm runs `prebuild` automatically before `build`; on Vercel this guards every deploy). Zero installs.
- Keep the gate additive over time: each factual state change appends its newly dead phrases rather than replacing the old ones, so regressions to ANY previous era get caught.
- Verifier: run with `npx tsx scripts/audit/verify-citations.ts`. Point `CLUSTERS`/paths at your content, adjust the `Source` shape, and if you stay on NCBI add an API key for higher rate limits at scale. For other sources, keep `parseUrl` returning `{db, id}` buckets and swap `esummaryBatch` for the relevant metadata API (Crossref for DOIs is the usual analog).
- The 0.25 threshold assumes short-label citations; if your labels quote full titles, raise it.

## Provenance
- Origin files: `therma-site/scripts/check-competitive-facts.mjs` and `therma-site/scripts/audit/verify-citations.ts` @ 2026-08-08 (wellness web app, gate live in prod via `prebuild`, verifier used for a full citation audit). Both copied verbatim.
- Related features: [[build-correctness-linters]] (companion CI-gate module: code correctness where this covers editorial truth), [[canvas-multi-ratio-slide-exporter]] (same origin repo)
- Related memory: verified stat claims doctrine (never ship debunked stats); citation audit lane.
