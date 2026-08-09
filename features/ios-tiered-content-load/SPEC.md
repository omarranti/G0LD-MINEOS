# iOS Tiered Content Load (live, then disk cache, then bundled seed)

> A three-tier degrade for a content-driven iOS app: fan out to every content source concurrently, treat a successful-but-empty fetch as authoritative, fall back to disk cache and then bundled seed JSON only when nothing landed, and show "No Connection" only when every source threw AND nothing renderable survived.

<!-- Structure over skin: the value is the decision table (nil vs empty, when to fall back, when to error), not the seven content types. -->

- **Slug:** `ios-tiered-content-load`
- **Tags:** `ios, offline, caching, resilience, swift-concurrency, content`
- **Source project:** directory iOS app
- **Stack:** Swift 6 concurrency (async let, actors) + SwiftUI `@Observable` `@MainActor` model + UserDefaults JSON cache
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live on main (native Swift app, pre App Store ship)

## Problem it solves
A content app whose every screen depends on the network has three ugly launch states: cold first launch on a dead connection (blank app), backend outage (blank app that worked yesterday), and one flaky endpoint (a spinner or error screen because 1 of 7 sources hiccuped). The naive fixes are each wrong: caching at the view layer drifts, a single try-await chain lets one source's failure kill all of them, and an `!isEmpty` guard on assignment quietly shows the *previous* city's data after the user moves. This is the load flow that renders something truthful in all of those states.

## When to reach for this
- Your iOS app aggregates several independent content sources (events, places, editorial cards, listings) into one screen set and any of them can fail independently.
- You need the app to be demonstrably usable on first launch with no network (App Review does this), in airplane mode, and during a backend outage.
- You have location-scoped content, so "this city has zero events" is a real, valid state you must render as empty rather than as an error or as stale rows.
- You've been bitten by a fallback that silently masked a dead endpoint (see gotchas).

## How it works
1. **Concurrent fan-out, per-source isolation.** One `async let` per source, each wrapped in `fetchOrNil { try await ... }`. A throwing source resolves to `nil` instead of propagating, so seven fetches produce seven independent `Optional` results. `fetchOrNil` is `nonisolated` so the wrapper itself doesn't funnel through the main actor.
2. **nil means errored, [] means empty. They are different facts.** `nil` preserves whatever is on screen. `[]` from a successful call is authoritative data and gets assigned, which clears the previous city's rows after a move or re-pin.
3. **Two assignment policies by source kind.** Location-scoped sources (events, hotspots, vendors) assign unconditionally on success, empty included. Location-independent editorial sources (holidays, insights, daily cards, listings) keep an `!isEmpty` guard, because "the backend has zero daily cards" is never a real state, only a partial outage.
4. **Fallback fires only on total blackout.** If, after the fan-out, every collection is still empty, `loadFromCache()` runs: disk cache first (last successful payload per source), then bundled seed JSON fills whichever sources are *still* empty. It never runs when anything landed, because it replaces collections rather than selectively filling them, and would overwrite fresh data with stale cache.
5. **Cache writes are a side effect of fetching.** Each `DataService.fetch*` persists the raw wire DTOs on success before mapping to domain models. Tier 2 is therefore always "the world as of the last successful call," with zero cache-maintenance code paths.
6. **The error state is a conjunction.** `contentLoadError = allErrored && nothingRenderable`. Every source threw AND cache + seed produced nothing renderable. Anything less shows content, not an error screen.
7. **First load doesn't wait for GPS.** `startNetworkLoadIfNeeded()` kicks the location permission flow, then loads immediately with the default-city anchor; a later fix triggers a background re-pull with real coordinates (see [[ios-geo-anchor-city-snap]]).

## Data model
No database. Three storage layers:
```
UserDefaults (wire-DTO JSON per source, written on every successful fetch)
  app_cachedEvents      [APIEventResponse]      app_cachedHolidays   [APIHolidayResponse]
  app_cachedHotspots    [APIHotspotResponse]    app_cachedInsights   [APIInsightResponse]
  app_cachedVendors     [APIVendorResponse]     app_cachedListings   [APIListingResponse]
  app_cachedDailyCards  [APIDailyCardResponse]

App bundle (compiled-in)
  BundledDataService: hardcoded seed rows per source, anchored around the default city

In-memory (@Observable model)
  events / hotspots / vendors / holidays / insights / dailyCards / listings
  isLoadingContent   contentLoadError   isRefreshing
```
The cache stores **wire DTOs, not domain models**, so cached data round-trips through the exact same mapping (including `stableUUID(from:)`) as a live response.

## Key decisions & gotchas
- **Empty is authoritative (the decision everyone gets wrong, part 1).** The original code guarded every assignment with `!isEmpty`. Result: repin from LA to a city with no geocoded listings and the app kept showing LA's rows, reading as "out of sync with the web directory." The fix distinguishes errored (`nil`, keep screen) from empty (`[]`, assign and clear). Do not "simplify" this back.
- **Error only on total loss (part 2).** An error screen over a successful-but-empty response teaches users the app is broken in exactly the cities you most need to grow. `allErrored && nothingRenderable` is the only combination that earns "No Connection."
- **The fallback masks dead endpoints.** In the origin, a set of fetchers pointed at a retired API route that 404'd in production. The tiered fallback served bundled data so faithfully nobody noticed for weeks. If a source seems weirdly frozen, suspect the fetcher, and delete dead fetchers instead of letting them "gracefully degrade" forever.
- **`loadFromCache()` replaces, it does not merge.** That is why it is gated on ALL collections being empty. If you want per-source cache fill on partial failure, you must rewrite it to fill only the sources whose fetch returned `nil`; the current shape will clobber fresh data.
- **Stable IDs across tiers.** Server rows have string ids; domain models use UUID. The mapping uses a deterministic `stableUUID(from:)` so a live fetch, a cache hit, and a re-fetch all produce the same UUIDs, keeping saved/liked ID sets valid. Random UUIDs in the mapper silently orphan every saved item on next launch.
- **UserDefaults as the cache store is a deliberate ceiling.** Payloads here are a few hundred KB of JSON. Fine. If your content grows to thousands of rows or images, move tiers 2 to files or SQLite; the shape (wire DTOs, write-on-fetch, read-on-blackout) transfers unchanged.
- **Deliberately not handled:** cache TTL/staleness (last-success wins forever until replaced), partial per-source cache fill, background refresh scheduling, and delta sync.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/AppModel+ContentLoad.swift` | **Trimmed excerpt** of the root `@Observable @MainActor` model (origin file is ~1,000 lines dominated by unrelated auth/navigation/filter state): the state vars, `startNetworkLoadIfNeeded`, `loadAllContent` fan-out + assignment policy, `fetchOrNil`, `loadFromCache`, `refreshContent` | `EventsRepository`/`HotspotsRepository`/`VendorsRepository`/`HolidaysRepository`/`DailyRepository` (your API layer), `LocationService` (see [[ios-geo-anchor-city-snap]]), domain model types |
| `code/PersistenceService.swift` | `Sendable` UserDefaults wrapper: per-user state, the per-source wire-DTO JSON cache (tier 2), `clearAllUserData()` that wipes user state but preserves content cache | `UserProfile` + the `API*Response` DTO types |
| `code/BundledDataService.swift` | Tier 3 compiled-in seed rows per source. Placeholder rows here; the origin ships ~40 real curated rows | the `API*Response` DTO initializers |
| `code/DataService.swift` | Tier 1 fetchers for the editorial sources incl. cursor-paginated listings with a runaway cap; caches wire DTOs on success; one representative DTO-to-domain mapping extension (rest trimmed, they are mechanical) | `NetworkService` (see [[ios-api-client]]), `stableUUID(from:)` (see [[ios-deterministic-uuid-from-id]]) |

## Structure to keep, skin to drop
- **Keep (the idea):** the three tiers and their precedence; per-source `fetchOrNil` isolation; the nil-vs-empty distinction; empty-is-authoritative for location-scoped sources; the all-empty gate in front of `loadFromCache`; the `allErrored && nothingRenderable` error conjunction; caching wire DTOs at fetch time; deterministic ID mapping; load-first-then-refine with the default anchor.
- **Drop (regenerate natively):** the seven specific content types and their DTO shapes (you might have three sources, or ten); the placeholder seed rows (ship a real curated slice for YOUR default city); the UserDefaults key names; the split between repository-served and `DataService`-served sources (an artifact of the origin's two backend generations); loading/error screen visuals.

## Adaptation notes
- Rename `AppModel` and merge the excerpt into your actual root model; it is a slice, not a standalone class.
- Define one collection + one `async let` + one assignment line per content source. Decide per source: is empty a real state (assign unconditionally) or always an outage signal (keep the `!isEmpty` guard)?
- Point the fetchers at your API layer. Keep the "cache DTOs on success" side effect inside each fetcher.
- Curate real bundled seed rows around your default anchor city and keep them small; they are a first-launch-offline experience, not a dataset.
- Info.plist: nothing required by this pattern itself; location keys belong to [[ios-geo-anchor-city-snap]].
- If any collection exceeds a few hundred KB serialized, swap the UserDefaults cache for files on disk; keep the interface (`cacheX`/`loadCachedX`) identical.

## Provenance
- Origin files: `ios/KosherConnect/ViewModels/KosherConnectModel.swift` (load-flow slice, ~lines 129-335 + 534-567), `ios/KosherConnect/Services/PersistenceService.swift`, `ios/KosherConnect/Services/BundledDataService.swift`, `ios/KosherConnect/Services/DataService.swift` @ 2026-08-08 (directory iOS app, live on main). Genericized for this library: the app-named model type renamed to `AppModel`; UserDefaults key prefix neutralized to `app_`; bundled seed rows (real venues, events, editorial content) replaced with neutral placeholders; domain-specific DTO field labels in the copied placeholder/mapping code neutralized (`dietaryNotes`, `quoteText`, `certifier`/`certifierName`/`certified`); image CDN URLs replaced with placeholders; comments referencing internal spec paths and product names removed. The reusable control flow is intact.
- Related features: [[ios-geo-anchor-city-snap]], [[ios-api-client]], [[ios-deterministic-uuid-from-id]]
- Related memory: none.
