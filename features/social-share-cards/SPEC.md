# Social Share Links + UTM Tracking

> Build per-network share intent URLs (Twitter/X, Facebook, LinkedIn, Pinterest,
> WhatsApp, Telegram, email, Threads, Reddit) with UTM params baked in, plus
> copy-to-clipboard, a centered popup opener, and GA4/Pixel share events.

- **Slug:** `social-share-cards`
- **Tags:** `growth`, `sharing`, `social`
- **Source project:** Therma
- **Stack:** Next.js (browser-side TS, no server, no deps)
- **Reuse confidence:** drop-in (one self-contained file, zero imports; only brand strings and the UTM campaign default need a glance)
- **Status in origin:** live in prod (`therma.one`, `lib/social-share.ts`)

## Problem it solves
A "share this" row needs a correct intent URL per network, and every click should
be attributable later. Hand-writing each network's intent endpoint, getting the
param names right (`u` vs `url` vs `text`), and remembering to encode and tag with
UTM is fiddly and easy to get subtly wrong. This is the one place that knowledge
lives.

## When to reach for this
- You have a page (article, listing, product) with a share row or share menu.
- You want share clicks to show up as `utm_source=<network>` traffic, not "direct".
- You want one builder that both renders `<a href>` and powers a JS popup, without
  pulling in a share-button npm package.

## How it works
- Each network has a `get<Network>ShareUrl(options)` function that returns the
  intent URL. The shared `ShareOptions` is `{ url, title, description?, image?,
  hashtags?, via? }`.
- The *shared* URL (the link the user is spreading) is first run through
  `addUtmParams`, which sets `utm_source=<platform>`, `utm_medium=social`,
  `utm_campaign=<campaign|'share'>` via the `URL` API, then re-serializes. Network
  params are then assembled with `URLSearchParams` (auto-encodes).
- Param shapes differ per network and are encoded in each builder: Facebook uses
  `u`, LinkedIn/Reddit/Telegram use `url`, Twitter uses `url`+`text`(+`hashtags`,
  `via`), Pinterest uses `url`+`description`+`media`. WhatsApp/Threads/email build a
  single free-text blob (`title\n\nurl`) and `encodeURIComponent` it by hand because
  those endpoints take one text field, not key/value params.
- `getAllShareUrls` returns every network's URL in one object for rendering a full row.
- Three browser helpers ride along: `copyShareLink` (Clipboard API with a hidden-
  textarea + `execCommand('copy')` fallback, tagged `utm_campaign=copy_link`),
  `openSharePopup` (centered 600x400 window), and `trackShare` (fires GA4 `gtag`
  `share` and Facebook Pixel `fbq` `Share` if those globals exist).
- Despite the "cards" slug, there is no image generation here. `image` is passed
  through to Pinterest's `media` param and is otherwise an OG-image hint, not a
  rendered card.

## Data model
Stateless. No tables, no cookies, no flags. Pure functions over a `ShareOptions`
object plus three side-effecting browser helpers (clipboard, `window.open`,
analytics globals).

## Key decisions & gotchas
- **UTM goes on the shared link, not the intent URL.** `addUtmParams` tags the
  destination the recipient lands on, so attribution works. The intent endpoint
  itself (`twitter.com/intent/...`) is never UTM-tagged.
- **Encoding is split by mechanism.** Key/value networks rely on `URLSearchParams`
  for encoding; free-text networks (WhatsApp, Telegram-text, Threads, email)
  hand-call `encodeURIComponent` on a `\n\n`-joined blob. Mixing the two (e.g.
  passing an already-encoded string into `URLSearchParams`) double-encodes. Keep
  the split.
- **`addUtmParams` uses `new URL(url)`** so a relative or malformed `url` throws.
  Callers must pass an absolute URL.
- **Twitter builder still targets `twitter.com/intent/tweet`** (not `x.com`); both
  resolve today but it is the obvious string to update.
- **No native Web Share API.** This is link-based on purpose (works as plain
  `<a href>`, SSR-safe to render), so it skips `navigator.share`. Add that
  separately if you want the mobile OS sheet.
- **`trackShare` is best-effort and feature-detected.** No-ops when `gtag`/`fbq`
  are absent; the `event`/`content_type:'article'` shape is GA4-specific and worth
  re-checking against your own analytics taxonomy.
- **Clipboard fallback mutates the DOM** (appends/removes a hidden textarea) and
  uses the deprecated `execCommand`. Fine as a fallback, but it is the part most
  likely to warrant replacement over time.
- **No deep links.** WhatsApp/Telegram use `wa.me` / `t.me/share` web intents, which
  the OS upgrades to the app when installed. There are no `whatsapp://` style
  schemes, so behavior is consistent across web and mobile web.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/social-share.ts` | All 9 per-network URL builders + `addUtmParams` + `getAllShareUrls` + clipboard/popup/track helpers | none (drop-in); relies only on browser `URL`/`URLSearchParams`/`navigator`/`window` |

## Adaptation notes
- Copy the file as-is. It has zero imports.
- Change the default `utm_campaign` (`'share'`) and the `copy_link` marker to match
  your campaign naming.
- Decide your `content_type` in `trackShare` (hardcoded `'article'`) and confirm the
  GA4/Pixel event names fit your analytics setup, or strip `trackShare` if you use a
  different analytics layer.
- Update the Twitter endpoint to `x.com` if you prefer; add/remove networks by adding
  to the `SocialPlatform` union, the `ShareUrls` interface, and `getAllShareUrls`.
- If you actually need rendered share-card *images*, that lives elsewhere (OG image
  route / `@vercel/og`); this file only passes an existing image URL through.

## Provenance
- Origin file: `therma-site/lib/social-share.ts` @ `52f65787`
- Related memory: `project_therma_seo_audit_2026_06_16.md` (UTM / sharing surface)
