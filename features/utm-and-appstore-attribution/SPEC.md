# UTM Capture + App Store Attribution Carry-Through

> Capture UTM params on landing, persist them client-side, and rewrite the
> Download button to a campaign-tagged App Store URL so installs attribute back
> to the channel that sent the visitor.

- **Slug:** `utm-and-appstore-attribution`
- **Tags:** `attribution`, `growth`, `analytics`
- **Source project:** Therma
- **Stack:** Next.js 15 App Router (client-side localStorage, no backend)
- **Reuse confidence:** drop-in (utm-tracking is fully portable; app-store-attribution needs your own campaign map + App Store URL)
- **Status in origin:** live in prod

## Problem it solves
A visitor lands from a press mention or campaign link (`therma.one?utm_source=rina_raphael`),
then clicks Download and leaves for the App Store. By the time Apple records the
install, the original channel is gone. The web property knows the source, the App
Store does not, and the two never meet. This carries the source across that gap so
App Store Connect can attribute the download to the campaign that earned it.

## When to reach for this
- You drive traffic to a marketing site that hands off to a native app store.
- You run named campaigns (press pushes, creators, paid) and want per-source install attribution.
- You want canonical URLs to stay clean for SEO while still capturing UTMs for analytics.
- You need attribution to degrade gracefully: if a campaign link is not configured yet, nothing breaks, you just lose that attribution.

## How it works
- On landing, `initUtmTracking()` extracts known params from the current URL and writes them to localStorage under one key, with a timestamp.
- Stored params expire after 30 days. Reads past the window delete the entry and return null.
- The merge rule is last-touch within the window: stored params are the base, current-URL params overwrite them (`{ ...stored, ...current }`). A later visit with a new UTM wins.
- When the Download button renders, `getAttributedAppStoreUrl()` reads the stored `utm_source` and looks it up in a static `Record<string, string>` of campaign-tagged App Store URLs. A hit returns the campaign URL; a miss returns the canonical `APP_STORE_URL`.
- The campaign URLs carry Apple's attribution tokens: `pt` (provider token, constant per account) and `ct` (campaign token, one per source), generated in App Store Connect under Sources. Apple reads these on click and attributes the install.
- Everything is client-side. `getAttributedAppStoreUrl()` is server-safe: with no `window` it returns the canonical fallback, so it can be called from a server component without throwing.

## Data model
Stateless on the backend. One localStorage entry:

```
key:   therma_utm_params
value: { params: { utm_source, utm_medium, utm_campaign, utm_term,
                   utm_content, fbclid, gclid, ref, source },
         timestamp: <epoch ms> }
ttl:   30 days (enforced on read)
```

Captured keys are the five standard UTMs plus `fbclid`, `gclid`, `ref`, and `source`.
Despite the file comment mentioning "localStorage/cookies," the real implementation
only writes localStorage; there is no cookie path.

The campaign map is hardcoded source-of-truth in `app-store-attribution.ts`, keyed
by `utm_source` (lowercase + underscore), values are full App Store URLs with `pt` / `ct` / `mt=8`.

## Key decisions & gotchas
- **Last-touch, not first-touch.** The merge deliberately lets the current URL overwrite the stored value, so the most recent campaign link wins. If you want first-touch (credit the original source), flip the spread to `{ ...current, ...stored }` and only store when nothing is stored yet.
- **`ct` token format is freeform but must match the map key indirectly.** The lookup key is `utm_source`; the `ct` embedded in the URL is whatever you named the campaign in App Store Connect. In the real data they drift: source `wave4_rina` maps to `ct=wave4_rina`, but `wave4_arvid` maps to `ct=arvid` (bare first name). The map key is what matters for the lookup, the `ct` only matters to Apple's dashboard. Keep them parallel or you will confuse yourself later.
- **`pt` (provider token) is constant per Apple account** (`128576378` here). Only `ct` varies per campaign. Do not regenerate `pt` per source.
- **Unconfigured sources fall back silently.** A `utm_source` with no map entry returns the canonical URL. Attribution is lost but the download still works. This is the intended failure mode (the file says so): ship the button before the campaign links exist.
- **`explicitSource` arg wins over storage.** `getAttributedAppStoreUrl('wave4_rina')` skips localStorage entirely, useful for server-rendered pages that already know the source from their own params.
- **Clean URLs are a separate concern.** `cleanUrl()` strips all tracked params for canonical/share URLs. It is exported but the two attribution functions do not call it; pairing them (capture then clean the address bar) is left to the page.
- **30-day window is hardcoded** via `UTM_EXPIRY_DAYS`. Shorten it for paid channels with shorter consideration windows.
- **localStorage can be disabled.** Writes are wrapped in try/catch and warn; reads return null on any parse error. No crash, just no attribution.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/utm-tracking.ts` | Extract / store (30d TTL) / merge / clean UTM params in localStorage | none (drop-in, browser-only) |
| `code/app-store-attribution.ts` | Map stored `utm_source` to a campaign-tagged App Store URL, fall back to canonical | `./links` (`APP_STORE_URL`), `./utm-tracking` (`getStoredUtmParams`) |

## Adaptation notes
- `utm-tracking.ts` is genuinely drop-in. Rename `UTM_STORAGE_KEY` (currently `therma_utm_params`) to avoid collisions, and edit the captured-key list if you track different params.
- For `app-store-attribution.ts`: replace `APP_STORE_URL` (here `https://apps.apple.com/us/app/therma-emotional-wellness/id6760090996`) with your own, and replace the entire `APP_STORE_CAMPAIGN_URLS` map with your campaigns.
- Generate each campaign URL in App Store Connect: My Apps → your app → App Analytics → Sources → Create Campaign Link. Use your own `pt` provider token.
- Call `initUtmTracking()` from a `useEffect` on landing pages, and point your Download button at `getAttributedAppStoreUrl()`.
- For Google Play, the same shape works but swap the URL builder for Play's `referrer` param convention instead of Apple's `pt` / `ct`.

## Provenance
- Origin files: `therma-site/lib/utm-tracking.ts`, `therma-site/lib/app-store-attribution.ts` @ `52f65787`
- Pairs with: `lib/links.ts` (`APP_STORE_URL`), `<DownloadAppButton>` / `useAppStoreUrl()` consumer
- Related memory: `project_therma_wave_4.md` (the press push whose journalist UTMs seeded the campaign map)
