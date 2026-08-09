# Bulk Import with Fuzzy Cross-Source Dedup

> Ingest the same real-world entities (businesses, venues, listings) from N overlapping data sources without creating duplicates, and never auto-merge a match you are not sure about.

<!-- Structure over skin: the value is the match rule, the precedence model, and the human escape hatch, not the field names. -->

- **Slug:** `bulk-import-fuzzy-dedup`
- **Tags:** `data-import, dedup, fuzzy-matching, etl, directory, data-quality, provenance`
- **Source project:** directory / marketplace web app
- **Stack:** TypeScript scripts run via `npx tsx`, file-based JSON pipeline (no DB access), CSV out for an admin bulk importer
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live in prod (multiple import waves shipped through it)

## Problem it solves
A directory that aggregates listings from several authorities (certifying agencies, registries, scraped indexes) sees the same physical place N times with N spellings: "Joe's Deli" vs "Joes Deli LLC", "N. Miami Beach" vs "North Miami Beach", phone formatted three ways. Naive slug matching either duplicates places or, worse, silently merges two different businesses at the same strip mall. This pipeline merges what is provably the same, gap-fills from lower-priority sources, keeps a provenance trail per record, and routes every ambiguous match to a human instead of guessing.

## When to reach for this
- You are importing listings/entities from 2+ overlapping sources into one canonical table.
- Records have no shared stable ID across sources; identity must be inferred from name, phone, and address.
- A wrong auto-merge is expensive (two real businesses collapsed into one) so you want a "needs human" lane, not a similarity threshold that silently decides everything.
- You re-run imports against a live production dataset and need insert vs enrich-only split so re-imports never clobber prod rows.

## How it works
1. **Normalize keys, not display values.** `normalizeName` lowercases, strips accents and punctuation, and drops stopwords (entity-type words plus your vertical's qualifier words). `phoneKey` reduces to 10 digits or null. `addrKey` is street number + zip5, deliberately weak alone. Cities pass through an alias map (`build-city-aliases.ts`) so "Ft. Lauderdale" and "Fort Lauderdale" key identically; abbreviation prefixes (N./St./Mt.) expand first.
2. **Match rule (the core):** two records are the same place iff `normKey` (normalized name + city) equal, OR `phoneKey` equal, OR (`addrKey` equal AND name-token Jaccard >= 0.5). Nothing else merges.
3. **The gray zone goes to a human.** Same `addrKey` with Jaccard 0.3-0.5 is written to a needs-human-dedup section of the merge report and NOT merged. Both records survive; a person decides later.
4. **Source priority decides precedence.** Sources process in `SOURCE_PRIORITY` order. The first source to introduce a place owns its identity and authority fields; later sources only fill empty fields (`fillGaps`), OR-in boolean attributes, and append to `provenance[]`.
5. **Provenance per record.** Every merged record carries `provenance: [{source, sourceUrl, sourceId}, ...]`, one entry per contributing source, so any field can be traced back.
6. **Split against prod before emitting.** `merge.ts` loads a prod snapshot and matches by slug, normKey, or phoneKey. Matches become enrich rows (gap-fill only, rewritten to carry the PROD name/city so the importer finds them); everything else becomes inserts. `emit-csv.ts` writes both CSVs for the admin importer.
7. **Every run writes a report:** counts in/dropped/unique/insert/enrich, unmapped cities (a backlog for new hub pages), the needs-human list, and dropped rows.

## Data model
Stateless with respect to the app DB; the pipeline is files on disk:
```
data/acquisition/
  normalized/<source>.json        -- SourceRecord[] per source (scrapers write these)
  config/city-aliases.json        -- "<raw city>|<STATE>" -> { dbName, state }
  config/city-aliases.extra.json  -- hand-maintained overrides, always win
  cache/prod-snapshot.json        -- { rows: [{slug, name, city, state, phone, ...}] }
  merged/<batch>.json             -- inserts (MergedRecord[])
  merged/<batch>.enrich.json      -- gap-fill rows for existing prod listings
  import/<batch>.insert.csv       -- for the admin importer
  import/<batch>.enrich.csv
  reports/<batch>.merge.md        -- counts + needs-human-dedup + dropped
```
Key shapes: `SourceRecord` (name, type, address, city, state, phone, website, lat/lng, authority, attr flags, sourceUrl/sourceId) and `MergedRecord` (adds source, cityDbName, cityMapped, slug, provenance[]).

## Key decisions & gotchas
- **Never auto-merge the ambiguous band.** The 0.3-0.5 Jaccard band on a shared address key is exactly where "Joe's Pizza" and "Joe's Bakery" in the same plaza live. Auto-merging there corrupts real businesses; the report lane costs one human minute per case instead.
- **Phone is the strongest key, address the weakest.** A full 10-digit phone match merges unconditionally. Address key alone never merges; it only nominates candidates for the Jaccard check, because strip malls share street number + zip.
- **City normalization must run before keying.** Without the alias map, the same place scraped as "N Miami Beach" and "North Miami Beach" produces two normKeys and a duplicate. Unmapped cities do not block import; they fall back to title case and get logged as expansion backlog.
- **`slugify` must byte-for-byte mirror the destination importer's slugify.** The insert/enrich split matches prod by slug; a divergent slugifier silently reclassifies enrich rows as inserts and creates duplicates.
- **Enrich rows are rewritten to prod's name/city.** A phone-matched record whose scraped city normalized differently from prod would otherwise emit an enrich row the importer cannot match (it matches by slugify(name, city)). Found the hard way.
- **First-source-wins is deliberate.** Precedence is a ranked list, not per-field trust scores. Simple, auditable, and good enough when sources genuinely rank by trustworthiness.
- **Deliberately not handled:** cross-state duplicates, geocode-distance matching, fuzzy address comparison beyond street number + zip, and any automatic conflict resolution between disagreeing non-empty fields (first source simply wins).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/lib.ts` | Shared helpers: `normalizeName`, `nameTokens`, `jaccard`, `phoneKey`, `addrKey`, `slugify`, city alias normalization, JSON/CSV utils | none (node stdlib only); `NAME_STOPWORDS` and `US_STATES` are config |
| `code/merge.ts` | The merge engine: match rule, source-priority precedence, gap-fill, provenance, needs-human report, insert/enrich split against prod snapshot | `SOURCE_PRIORITY` list; prod snapshot shape |
| `code/emit-csv.ts` | Turn merged JSON into importer-ready CSVs; `--pending` flag flips status columns for low-trust discovery batches | `COLS` must match your importer's expected columns |
| `code/build-city-aliases.ts` | Seed the alias map from the site's city config (city names, alt db names, neighborhoods), with a hand-maintained extras file that always wins | `../../src/config/cities` (your geo config) |

## Structure to keep, skin to drop
- **Keep (the idea):** the three-way match rule (normKey OR phoneKey OR addrKey+Jaccard>=0.5), the ambiguous-band-to-human escape hatch, source-priority precedence with gap-fill, provenance per record, city alias normalization before keying, the slugify-mirror invariant, and the insert vs enrich split against a prod snapshot.
- **Drop (regenerate natively):** the field names (`authority`, `attrA/attrB` are placeholders for the origin's certification fields), the US-states filter if you are not US-only, the CSV column list, the specific status/verification enum values, and the city config import path. The origin's stopword list also carried vertical-specific qualifier words; rebuild it for your niche.

## Adaptation notes
- Rename `authority`/`authorityName` and the `attrA`/`attrB` booleans to your domain's fields (they flowed from the origin's certification data), and update `COLS` in `emit-csv.ts` to match your importer.
- Fill `SOURCE_PRIORITY` with your source file names, highest trust first. Unknown sources sort last automatically.
- Point `build-city-aliases.ts` at your city/geo config, or hand-write `config/city-aliases.json` if you have no pSEO city config. Expected per-city shape: `{ name, dbName, stateAbbr, dbNames?, neighborhoods? }`.
- Produce `cache/prod-snapshot.json` from your production table (slug, name, city, state, phone at minimum) before each merge run.
- If your entities are not US businesses, replace `phoneKey` (US 10-digit assumption), `isUsState`, and the zip5 half of `addrKey`.
- Tune the two Jaccard thresholds (0.5 merge, 0.3 report) against a labeled sample before trusting them in a new vertical.

## Provenance
- Origin files: `scripts/acquisition/lib.ts`, `scripts/acquisition/merge.ts`, `scripts/acquisition/emit-csv.ts`, `scripts/acquisition/build-city-aliases.ts` @ 2026-08-08 (directory / marketplace web app, live). Genericized for this library: brand and business-model specifics removed; certification-agency source names replaced with placeholder `source-a/b/c`, certification fields renamed to `authority`/`attrA`/`attrB`, vertical-specific stopwords dropped, and the geo-config import path neutralized. The match rule, precedence, provenance, and reporting flow are intact.
- Related features: [[pseo-inventory-gated-pages]] (the city hubs the alias map serves), [[neon-single-owner-crud]]
- Related memory: listings acquisition docket; hours-data decision (why no Google Places backfill).
