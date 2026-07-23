# News Scraper to Static JS Feed

> A Python scraper that pulls news from public RSS feeds plus one HTML page,
> auto-categorizes each item, and writes a single `window.__Meridian_NEWS = {...}` JS
> file that a no-backend static dashboard loads with a plain `<script>` tag.

- **Slug:** `news-scraper-to-static-feed`
- **Tags:** `scraping`, `data-pipeline`, `dashboard`
- **Source project:** KIID (Meridian Pulse intelligence dashboard)
- **Stack:** Python 3 (requests + feedparser + BeautifulSoup) writing a JS file that a static HTML/JS dashboard reads. No server, no database.
- **Reuse confidence:** reference-only (the architecture is the value; you will rewrite every source URL, the keyword buckets, and the HTML selectors for your own subject)
- **Status in origin:** working tool, run by hand

## Problem it solves
You want a small, single-topic intelligence feed (news about one company, person,
or market) on a dashboard you can open as a static file, with zero hosting, zero
backend, and zero database. The hard parts are pulling from several public
sources, deduping, light categorization, and getting the data in front of static
HTML without a fetch API or CORS. This solves all of that with one script and one
generated JS file.

## When to reach for this
- You need a read-only dashboard that runs over `file://` or any dumb static host
  (no API server, no DB, no build step).
- The data is public and mostly RSS-shaped (news tags, Google News search, a
  Substack feed), with maybe one HTML page you scrape best-effort.
- You want the data baked in at scrape time so the page just reads a global, no
  network call at view time.
- The categorization can be keyword-rules, not ML, and a human can override
  suggestions in the UI.

## How it works
The pipeline is scrape -> transform -> write static feed -> static page reads the global. No server sits between the scrape and the view.

- **Scrape.** A `FEEDS` list of `{source, url, filter_wme}` dicts is fetched one by
  one with `requests` (custom polite User-Agent), then parsed with `feedparser`.
  One source (`The Ankler`) sets `filter_wme: True` so only entries that actually
  mention the subject survive. After the feeds, one HTML page
  (`meridiantalent.com/news`) is scraped best-effort with BeautifulSoup: it walks every
  `<a>`, keeps links that look like news (`/news` or `/press` in href, text >= 25
  chars), and caps at 15 items.
- **Transform.** Each entry becomes a flat dict. Summary HTML is stripped to text,
  whitespace-collapsed, the WordPress "The post X appeared first on Y" tail is
  removed, and it is truncated to ~240 chars on a word boundary with an ellipsis.
  Dates come from `published_parsed`/`updated_parsed` (UTC) or default to now.
- **Categorize.** `classify()` lowercases title+summary and runs ordered
  `BUCKET_RULES` (risk -> opp -> gtk, first match wins; default `know`). The
  matched keyword is stored so the UI can show why. The category is a *suggestion*;
  the dashboard lets a human override it.
- **Exclude.** A whole-word, case-insensitive regex (`EXCLUDE_TERMS`) hard-drops
  anything tied to a sibling brand that must never leak into this feed (strict
  topic isolation). Applied to both feed entries and the HTML scrape.
- **Write static feed.** Items are deduped by a 12-char SHA1 of the URL, filtered
  by `--max-days`, sorted newest-first, wrapped in a payload object, and written as
  `window.__Meridian_NEWS = <json>;` to `dashboard/data/agency-news.js`.
- **Read.** `dashboard/index.html` loads it with `<script src="data/agency-news.js">`
  and every view reads `window.__Meridian_NEWS`. No fetch, so it works over `file://`
  with no CORS problem.

## Data model
Stateless on the producer side (no DB). The contract is the generated JS file,
which assigns one global object:

```js
// window.__Meridian_NEWS
{
  "generated_at": "2026-05-17T14:44:19.260829+00:00", // ISO8601 UTC, scrape time
  "count": 32,                                          // len(items)
  "errors": [ "Variety: HTTPError: 403", ... ],         // per-source failures, non-fatal
  "items": [
    {
      "id": "41eaa0e90589",        // sha1(url)[:12], the dedupe + UI key
      "title": "Meridian Signs ...",
      "url":   "https://...",
      "source": "Deadline",         // human-readable source label
      "date":  "2026-05-07T20:07:00+00:00", // ISO8601, used for sort + age filter
      "summary": "EXCLUSIVE: ...",  // cleaned, <= ~240 chars, may be ""
      "suggested": "know",          // risk | opp | gtk | know (keyword-rule guess)
      "matched":   ""               // the keyword that fired, "" if defaulted to know
    }
  ]
}
```

The `id` is content-stable (derived from the URL), so re-running the scraper
re-emits the same id for the same article. The consumer can layer user state
(category overrides, read/hidden) keyed on `id` in `localStorage`, the producer
never stores it.

## Key decisions & gotchas
- **No backend, on purpose.** Writing a JS global instead of JSON means the static
  page needs no `fetch`, no server, no CORS allowance. The cost: the data is a
  point-in-time snapshot baked into a file. It is only as fresh as the last manual
  run. There is no scheduler in the repo (no cron, no GitHub Action); you run
  `python scrape_agency_news.py` by hand and commit the regenerated file.
- **HTML scraping is the brittle part.** The RSS feeds are stable contracts; the
  `meridiantalent.com/news` scrape is explicitly "JS-rendered, so low hopes" and wrapped
  so it can fail without killing the run (returns `[]`, logs to stderr). Expect to
  rewrite those selectors whenever the target site changes. Treat any HTML source
  as best-effort, never load-bearing.
- **Errors are collected, not fatal.** A dead feed appends to `errors[]` and the
  run continues. The process exits non-zero only if there are zero fresh items AND
  there were errors, so a normal partial-failure still produces a usable file.
- **Dedupe is URL-hash based**, deduping within a single run via a `seen` set.
  Google News and a publisher tag feed often carry the same story under different
  URLs, so cross-source dupes by *content* are NOT caught, only exact-URL repeats.
- **Categorization is ordered keyword rules, risk first.** "signs with" + "lawsuit"
  should read as risk, so risk is checked before opp. First match wins and the
  matched keyword is surfaced so a human can sanity-check the guess. This is
  deliberately dumb (no ML) and meant to be overridden in the UI.
- **Topic isolation via a hard exclude regex.** A whole-word case-insensitive match
  drops sibling-brand items before bucketing, on both the feed and HTML paths.
  Whole-word matching avoids accidental substring hits.
- **Politeness.** Custom descriptive User-Agent, a `--delay` (default 1s) between
  every request, and a per-request `--timeout` (default 30s). Low-volume daily
  scrape, not a crawler.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/scrape_agency_news.py` | Whole pipeline: fetch feeds + best-effort HTML scrape, clean/categorize/exclude, dedupe, age-filter, sort, write `window.__Meridian_NEWS` JS file | `requests`, `feedparser`, `beautifulsoup4` (bs4); writes to `dashboard/data/agency-news.js` |

The consumer (`dashboard/index.html`, not copied here) is a static page that does
`<script src="data/agency-news.js"></script>` and reads `window.__Meridian_NEWS` in every
view. The output file (`dashboard/data/agency-news.js`, ~328 lines in origin) is not
copied; its shape is the Data model above.

## Adaptation notes
What a future session must change to retarget this:
- **Sources.** Replace the `FEEDS` list (each `{source, url, filter_wme}`) and
  `Meridian_PRESS_URL` with your own RSS feeds and HTML page. Set `filter_wme: True` on
  any broad feed where you only want entries mentioning your subject, and rename
  `is_wme_related` + its match terms.
- **Selectors.** Rewrite the `<a>` selection logic in `scrape_press_page()` for
  your HTML target (the href/text heuristics are specific to one site).
- **Buckets.** Rewrite `BUCKET_RULES` (the category names and keywords) for your
  domain, and re-order them so the highest-priority bucket is checked first.
- **Exclusions.** Replace `EXCLUDE_TERMS` (or empty it) for your topic isolation.
- **Output contract.** Change the global name `window.__Meridian_NEWS`, the `--out`
  default path, and update the consumer's `<script src>` + reads to match.
- **Deps.** `pip install requests feedparser beautifulsoup4`.
- **Freshness.** If you want this automated, add the scheduler yourself (cron,
  GitHub Action, launchd) to run the script and commit/push the regenerated JS.

## Provenance
- Origin file: `loft/scrape_agency_news.py` @ `29a0c3f`
- Pairs with (not copied): `loft/dashboard/data/agency-news.js` (generated output),
  `loft/dashboard/index.html` (static consumer)
- Related memory: `project_loft.md` (KIID: Meridian Pulse intelligence dashboard with Discovery tool)
