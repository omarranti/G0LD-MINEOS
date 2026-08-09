# LLM Transcript Corpus Ingest (map-reduce, SSE progress, weighted FTS)

> Turns hour-long unstructured transcripts into a queryable, taxonomy-tagged knowledge corpus: chunked map-reduce extraction that never blows the context window, live progress streamed from the ingest route, and weighted Postgres full-text search over the result.

<!-- Structure over skin: the value is the pipeline shape, not the wellness taxonomy. -->

- **Slug:** `llm-transcript-corpus-ingest`
- **Tags:** `llm, map-reduce, ingestion, sse, streaming, full-text-search, tsvector, knowledge-base, taxonomy`
- **Source project:** wellness web app (marketing site + team console)
- **Stack:** Next.js 15 App Router + Drizzle + Postgres + Anthropic Messages API (plus a `claude -p` CLI path for local runs)
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live in prod

## Problem it solves
The team watches long-form video (podcasts, talks, breakdowns) and wants the insights on tap for future work sessions, not trapped in someone's memory. Three things make the naive build fail: a 2-hour transcript overflows a single model call; a serverless route that works for 3+ minutes with no feedback looks dead, so admins kill it and re-submit (double-ingesting); and once you have 100+ summaries, grep is useless, you need ranked search where a title hit beats a buried body mention. This is the pipeline that survives all three: transcript in, structured taxonomy-tagged markdown + queryable row out, with a live progress log while it runs.

## When to reach for this
- Any "paste a big blob of source material, get a structured entry in a database" feature: transcripts, call notes, PDFs-as-text, research dumps.
- The source material can exceed the model's comfortable input size, so you need chunking that doesn't shred meaning.
- The extraction runs long enough (30s to 5min) that the UI needs real progress events, not a spinner.
- You want search over the result without standing up embeddings infra: Postgres tsvector is enough for keyword/concept recall over a small-to-medium corpus.
- You want the same extraction logic callable from both a CLI (local, `claude -p`) and a serverless route (HTTP API), which is why the runner is injected.

## How it works
1. **One shared library, two runners.** `lib.mjs` is plain ESM with zero framework imports. `runClaude` (spawn `claude -p`) and `runClaudeHttp` (direct Messages API call) satisfy the same `(prompt) => Promise<string>` contract; `extractWithMapReduce` takes the runner as an argument, so the CLI and the Next.js route share every line of pipeline logic.
2. **Token-budgeted chunking.** `estimateTokens` is chars/4 (deliberately rough, it only decides whether to chunk). `chunkTranscript` splits on `[mm:ss]` timestamp boundaries so quotes stay aligned to their timestamps, falling back to paragraph splits when there are none, and packs units greedily up to a target budget (default 8k tokens).
3. **Map-reduce with a cheap escape hatch.** If the whole transcript fits in ~2x the chunk budget, it goes one-shot with the full system prompt. Otherwise: map each chunk through a tiny prefix-tagged scratch-notes prompt (`insight:` / `quote:` / `claim:` / `prescription:` / `entity:` / `reference:`) with bounded concurrency (3 workers pulling from a shared cursor), then reduce all scratch notes through the real system prompt into the final markdown. The reduce input is small, so long videos finish fast.
4. **Prompt = product canon + taxonomy contract.** The per-corpus system prompt embeds the product's ICP/voice/channels (so extractions are pre-filtered for fit, including a "counter-signal: what NOT to copy" section) and a strict frontmatter contract: vertical/subvertical enums, business_area, stage, surface, tags, plus a machine-readable `## Structured extractions` yaml block (key_claims, prescriptions, entities, references).
5. **Deterministic post-processing.** `processOutput` is pure: strip code fences, sanitize em dashes, apply channel override, parse frontmatter with a tolerant line regex, pull the structured-extractions yaml out of the body (so it isn't rendered twice), and build a slug stem of `date-channel-title-videoId`. The video id comes from `extractVideoId`, which normalizes all YouTube URL forms (watch?v=, youtu.be, /shorts/, /embed/, /live/) so re-ingesting the same video under a different URL collides on the unique slug instead of duplicating.
6. **SSE out of the route.** The ingest route returns a `ReadableStream` as `text/event-stream`. Inside `start(controller)` it runs the whole pipeline, emitting `log` events (fed by the pipeline's `onLog` callback: "chunk 3/9: extracting", "reduce: synthesizing"), a `parsed` event with the frontmatter, and finally `result` or `error`. `runtime = 'nodejs'`, `maxDuration = 300`, `dynamic = 'force-dynamic'`.
7. **Idempotent persistence.** Row upsert is `onConflictDoUpdate` on the slug, so re-running an ingest replaces rather than duplicates. The CLI path also writes the markdown + raw transcript to disk and regenerates a human-readable `_index.md` per corpus.
8. **Three-tier search.** A generated `search_tsv` column weights title (A), channel/guest/tags/key_claims (B), prescriptions/entities (C), body (D). The route tries `websearch_to_tsquery` (natural phrases, quoted strings), then per-word prefix `to_tsquery('word:*')` for partial words, then ILIKE substring as a last resort, and tells the client which mode matched.

## Data model
```ts
// code/schema.ts (Drizzle slice)
knowledge_entries
  id            serial PK
  slug          text unique          -- date-channel-title-videoId; the idempotency key
  corpus        text                 -- which corpus/taxonomy bucket ('growth' | 'brain' in origin)
  channel, guest, title, url, duration, ingested_date   text
  vertical, subvertical              text   -- single-value taxonomy
  secondary_verticals, business_area, stage, surface, tags   text  -- comma-joined lists
  body          text                 -- markdown summary minus frontmatter
  frontmatter_raw  text
  key_claims, prescriptions, entities, references   jsonb  -- string[] structured extractions
  created_at    timestamp
```
Plus `code/migration-search-tsv.sql`: the `search_tsv` GENERATED ALWAYS tsvector column with A-D weights and its GIN index. Drizzle cannot express generated columns, so this lives as raw SQL and must be run after the table migration.

## Key decisions & gotchas
- **Injected runner over imported client.** The pipeline never imports an SDK; it takes `runner: (prompt) => Promise<string>`. That single decision is what lets the CLI (`claude -p`, no API key on env) and the serverless route (HTTP, `ANTHROPIC_API_KEY`) share the pipeline, and makes the whole thing testable with a fake runner.
- **Chunk on timestamp boundaries, not byte offsets.** Splitting mid-sentence loses quote/timestamp alignment, and the deep-link-to-video-moment feature depends on the model citing real `[mm:ss]` markers. The chunker keeps each timestamp attached to its following text.
- **Scratch notes, not partial summaries, in the map step.** Early versions that asked each chunk for a mini-summary produced a reduce step that averaged away specifics. The prefix-tagged flat bullet format keeps claims, quotes, and numbers atomic so the reducer selects rather than re-summarizes.
- **`estimateTokens` is deliberately crude.** chars/4 with a 2x one-shot threshold means a borderline transcript goes one-shot with headroom instead of paying map-reduce overhead. Exact tokenization buys nothing here.
- **SSE beats polling for this shape.** One POST carries the (large) transcript body AND returns the progress channel; no job table, no polling endpoint, no orphaned-job cleanup. The trade: if the connection drops, progress is lost (the ingest still completes server-side, and slug idempotency makes blind re-submits safe). `Cache-Control: no-cache, no-transform` matters; proxies that buffer will otherwise batch your events.
- **The route must be `runtime = 'nodejs'` with explicit `maxDuration`.** Edge runtime can't spawn/stream this workload pattern reliably and default function timeouts (10-15s) kill long ingests mid-stream. This is the number one rebuild-badly trap.
- **tsvector over embeddings, on purpose.** The origin briefly had pgvector and dropped it (see the migration's header comment): for a sub-1000-entry corpus queried by keyword/concept, weighted FTS gives stemming + ranking with zero external API calls and no embedding drift. Re-add embeddings only when paraphrase recall actually fails you.
- **Prefix-match fallback earns its keep.** `websearch_to_tsquery` misses partial words ("stress-" should hit "stressors"). The per-word `:*` tier catches those; the ILIKE tier catches punctuation-heavy queries and code identifiers. Returning `mode` in the response makes relevance debugging trivial.
- **Em-dash sanitizer runs post-hoc even though the prompt forbids them.** Models leak style rules under pressure; `sanitizeEmDashes` enforces the house rule mechanically on frontmatter, headings, and summary lines. Belt and suspenders. (Keep or delete per your own style rules.)
- **Deliberately not handled:** transcript fetching itself (a separate concern in origin), retry/resume of a half-failed map step (re-run the whole ingest; idempotent), multi-language stemming (`'english'` is hardcoded in the tsvector), and auth beyond an isAdmin gate.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/lib.mjs` | The whole pipeline: runners (CLI + HTTP), prompt builders (one-shot, chunk, reduce), `chunkTranscript`, `extractWithMapReduce`, `processOutput`, frontmatter + structured-extraction parsers, `regenerateIndex`, slug/videoId helpers, raw-SQL `persistEntry` for the CLI path | `ANTHROPIC_API_KEY`, `POSTGRES_URL`, `postgres` (npm), a `prompts/<corpus>-system.md` on disk |
| `code/ingest-stream-route.ts` | `POST` route: auth -> validate -> `ReadableStream` SSE (`log`/`parsed`/`result`/`error` events) wrapping `extractWithMapReduce` -> Drizzle upsert on slug | `@/lib/team-auth` (`getAuthenticatedUser`, `isAdmin`), `@/lib/db`, `@/lib/schema` |
| `code/search-route.ts` | `POST` search: weighted tsvector -> prefix tsquery -> ILIKE, three tiers, returns `mode` | `@/lib/team-auth`, `@/lib/db` |
| `code/knowledge-lib.ts` | Server-side read layer: load all entries into a typed shape (comma-joined text -> string[], jsonb -> string[]), plus `collectFacets` for filter UIs | `@/lib/db`, `@/lib/schema` |
| `code/schema.ts` | Drizzle slice: `knowledge_entries` | `drizzle-orm/pg-core` |
| `code/migration-search-tsv.sql` | Generated `search_tsv` column (A-D weights) + GIN index | none (raw SQL) |
| `code/prompts/growth-system.md` | Representative per-corpus system prompt: product-canon block + taxonomy frontmatter contract + structured-extractions yaml block | Fill the `{PRODUCT_NAME}` / product context placeholders |

## Structure to keep, skin to drop
- **Keep (the idea):** the injected-runner contract; timestamp-boundary chunking with greedy token packing; the map (scratch notes) / reduce (real prompt) split and its bounded-concurrency worker pool; pure `processOutput` shared by both entry points; slug = date-channel-title-videoId idempotency; SSE-from-ReadableStream with `onLog` threading; the A-D weighted generated tsvector plus the three-tier search fallback; the "system prompt = product canon + strict frontmatter contract + machine-readable yaml block" prompt architecture.
- **Drop (regenerate natively):** the specific taxonomy (verticals/subverticals/business_area/stage/surface enums are the origin product's worldview, write your own); the corpus names `growth`/`brain`; YouTube specificity (`extractVideoId`, `canonicalYoutubeUrl`) if your source isn't video, swap in whatever canonical-id function dedupes your source; the em-dash sanitizer if it's not your house rule; the lowercase-body style rules inside the prompt; the file-on-disk + `_index.md` CLI path if you're serverless-only.

## Adaptation notes
- Env: `ANTHROPIC_API_KEY` (HTTP path), `POSTGRES_URL` (CLI persist path), optional `KNOWLEDGE_MODEL` override. The route hard-fails with a clear message when the key is missing.
- Imports: origin used deep relative paths (`../../../../../lib/db`); this copy uses `@/lib/*` aliases. `lib.mjs` is imported by a TS route as `.mjs`, which Next.js allows; keep it ESM or convert to TS wholesale.
- Auth: swap `getAuthenticatedUser`/`isAdmin` for your session gate. This route spends real API money per call; do not ship it unauthenticated.
- DB: create `knowledge_entries` via your migration tool, then run `migration-search-tsv.sql` manually (generated columns are outside Drizzle's schema DSL). If you change which columns feed search, the generated column must be dropped and re-added.
- Prompts: write one `prompts/<corpus>-system.md` per corpus. Keep the three-part shape (product canon, extraction focus list, exact output template with placeholder substitution) and keep the structured-extractions yaml block if you want the jsonb columns populated.
- Client side: consume the SSE with `fetch` + `ReadableStream` reader (EventSource can't POST). Render `log` events into a progress feed; treat `error` as terminal.
- Vercel: `maxDuration = 300` requires a plan that allows it; drop the chunk budget or model size before dropping the timeout.

## Provenance
- Origin files: `therma-site/.knowledge/scripts/lib.mjs`, `therma-site/app/api/team/knowledge/ingest-stream/route.ts`, `therma-site/app/api/team/knowledge/search/route.ts`, `therma-site/app/team/knowledge/lib.ts`, `therma-site/lib/schema.ts` (knowledgeEntries slice), `therma-site/supabase/migrations/20260610010000_knowledge_tsvector_drop_embedding.sql`, `therma-site/.knowledge/prompts/growth-system.md` @ 2026-08-08 (wellness web app, live).
- Genericized for this library: the system prompt's product canon block (brand name, ICP persona, pricing, voice rules, live channels) replaced with `{PRODUCT_NAME}` placeholders and an "Actionable for the product" heading; brand mention in the schema comment neutralized; deep relative imports flattened to `@/lib/*`; `knowledge-lib.ts` dropped an origin-specific pSEO internal-link suggester (`suggestPseoLinks` and the `pseoLinks` field) that coupled entries to the marketing site's page inventory; the migration's pgvector DROP statements (origin-history cleanup) trimmed to just the tsvector ADD + index. Pipeline logic, prompts structure, and SQL are otherwise intact.
- Related features: [[smart-chat-over-data]], [[ai-insights-engine]], [[news-scraper-to-static-feed]]
- Related memory: corpus-ingest skill + growth-corpus arming (the origin workflow this powers).
