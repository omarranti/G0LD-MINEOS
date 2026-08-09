# iOS Geo Anchor + City Snap (pin vs track)

> A sane map/list center before, without, and against location permission: an async CoreLocation wrapper that always resolves to *some* coordinate, a curated city list with great-circle nearest-snap, and a policy where a manually pinned city overrides GPS until the user clears it.

<!-- Structure over skin: the value is the resolution chain (pin > fix > default anchor) and the permission bridging, not the city list. -->

- **Slug:** `ios-geo-anchor-city-snap`
- **Tags:** `ios, location, corelocation, geo, permissions, swift-concurrency`
- **Source project:** directory iOS app
- **Stack:** Swift 6 + SwiftUI `@Observable` `@MainActor` + CoreLocation (WhenInUse only) + CLGeocoder
- **Reuse confidence:** drop-in for `LocationService` + `SupportedCity`; adapt-the-shape for the pin-vs-track policy slice
- **Status in origin:** live on main (native Swift app, pre App Store ship)

## Problem it solves
Location-scoped apps face a cold-start paradox: the very first screen needs a center coordinate, but the permission sheet hasn't been answered yet, may be denied forever, and the simulator often has no fix at all. Meanwhile CoreLocation's API is delegate-callback soup that fights structured concurrency, and a raw GPS coordinate is the wrong key for anything city-scoped (content markets, per-city feeds, backend slugs). This pattern makes every consumer ask one question, "what coordinate should I query right now?", and always gets an answer: manual pin, else freshest fix, else a hand-picked default anchor. On top, a curated-city snap turns any coordinate into a market the app actually serves.

## When to reach for this
- Your app serves a handful of curated markets, not the whole planet, and content should anchor to the nearest one (directory apps, delivery, community apps).
- You need the app fully usable with location denied or unanswered: the default anchor renders real content while the permission sheet is still up.
- You want the Yelp/Uber-Eats chip pattern: auto-track by default, tap to pin a city, pin survives relaunch, "Use my current location" clears it.
- You are bridging CLLocationManager's delegate callbacks into async/await and want the known-safe continuation shape.

## How it works
1. **Three-step resolution, one property.** `activeCenter = preferredCity?.coordinate ?? currentLocation ?? defaultAnchor`. Consumers never branch on authorization status; they read one value that is always valid.
2. **Permission as an async call.** `requestAndStart()` switches on status: already authorized starts updates and returns; denied/restricted returns immediately (no nagging); `.notDetermined` parks a `CheckedContinuation` and calls `requestWhenInUseAuthorization()`. The delegate's authorization callback resumes it exactly once (the stored continuation is nil'd before resume, so repeat callbacks are no-ops). Idempotent, safe to call on every foreground.
3. **Delegate thread-hopping.** `CLLocationManagerDelegate` methods are `nonisolated` (CoreLocation calls them off-main); each hops via `Task { @MainActor in ... }` before touching `@Observable` state. `didFailWithError` is deliberately silent; the resolution chain absorbs it.
4. **Best-effort reverse geocode.** `reverseGeocodeCurrent()` labels the fix (subLocality preferred, then locality, then admin area) for the chip. On failure it leaves the previous label instead of blanking, so the chip never flickers to nothing.
5. **City snap.** `SupportedCity.nearest(to:)` picks the min great-circle `CLLocation.distance` over the curated list. A user in an unserved city snaps to the closest market rather than seeing an empty app.
6. **Pin beats GPS.** `selectCity` persists the slug and refetches; `useCurrentLocation()` clears the pin, re-requests, re-geocodes, refetches. The pin is stored as a slug so the curated list can evolve; unknown slugs rehydrate to nil (auto-track), never crash.
7. **Snap for identity, raw fix for radius.** Deliberate asymmetry: `activeCity` (city-keyed systems, labels) snaps to the curated list, but `activeCenter` in auto-track mode is the RAW fix, so radius queries center on the user, not on the market anchor a few miles away.

## Data model
```
UserDefaults
  app_preferredCitySlug   String?      -- the manual pin; absent = auto-track

Compiled-in
  SupportedCity.all       [slug, label, lat, lng]   -- curated markets; anchors, not centroids
  LocationService.defaultAnchor   CLLocationCoordinate2D  -- matches SupportedCity.fallback

In-memory (@Observable)
  currentLocation   authorizationStatus   lastFixDate   localityLabel   trackedLabel   preferredCity
```
Persist the **slug**, never the struct or coordinates: labels and anchors can change server-side or in an app update without invalidating existing pins.

## Key decisions & gotchas
- **WhenInUse only, ever.** Always-authorization triggers extra App Review scrutiny and a scarier prompt, and a content app gains nothing from background location. `requestWhenInUseAuthorization` plus `startUpdatingLocation` on grant is the whole surface.
- **The continuation must be resume-once.** `locationManagerDidChangeAuthorization` also fires on delegate assignment and on later Settings changes, not only in answer to your request. The `if let cont` + nil-before-resume dance is load-bearing; resuming a `CheckedContinuation` twice is a crash.
- **Never await the permission answer before rendering.** The origin loads content immediately with `currentOrDefault` while the sheet is up, then background-refreshes when a fix lands. Blocking first paint on the sheet is the most common way this pattern gets rebuilt wrong.
- **Denied is a return, not an error.** The app quietly runs on `defaultAnchor` / nearest-market. No alert, no re-prompt loop; the picker sheet is the recovery path (and the pin makes denied-permission users first-class).
- **Anchors are inventory centers, not municipal centroids.** Each city's coordinate should sit where your listings cluster; the default anchor should be your densest market so first-launch and denied users see your best content.
- **Snap changed content must clear stale rows.** After a repin, a successful-but-empty fetch for the new city must overwrite the old city's rows. That rule lives in the load flow (see [[ios-tiered-content-load]]), but this pattern is what makes it fire; test the pair together.
- **Reverse geocoding is rate-limited and flaky.** One geocode per fresh fix on demand, never in the `didUpdateLocations` stream, and failure keeps the last label.
- **Deliberately not handled:** significant-change monitoring, geofencing, moving-user re-snap (snap is evaluated per load, not continuously), and multi-region backends (one curated list, one backend).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/LocationService.swift` | `@MainActor @Observable` CLLocationManager wrapper: continuation-bridged permission flow, fix tracking, `currentOrDefault`, best-effort reverse geocode | none (Foundation + CoreLocation); set `defaultAnchor` to your market |
| `code/SupportedCity.swift` | Curated market struct + list, `bySlug`, `fallback`, great-circle `nearest(to:)` | none; replace the list entries |
| `code/AppModel+Location.swift` | **Trimmed excerpt** of the root model (origin file is ~1,000 lines dominated by unrelated app logic): `preferredCity` / `trackedLabel` state, `activeCity` / `activeCenter` / `locationChipLabel`, `selectCity`, `useCurrentLocation`, startup wiring; the two `PersistenceService` functions it needs are inlined as a comment | your root model, your content-load entry point (`loadAllContent()` stub) |
| `code/LocationPickerSheet.swift` | The picker sheet: "Use my current location" row + curated list with active checkmark, medium/large detents | `AppModel` environment; restyle tint/typography natively |

## Structure to keep, skin to drop
- **Keep (the idea):** the pin > fix > default resolution chain; slug-persisted pin with nil-safe rehydration; the resume-once continuation bridge; nonisolated-delegate-hops-to-MainActor; denied-is-a-return; snap-for-identity vs raw-fix-for-radius; best-effort geocode that never blanks; refetch-on-pin-change.
- **Drop (regenerate natively):** the specific city list and anchor coordinates; the chip and sheet visuals (colors, fonts, footer copy, detents); the "community" wording; `desiredAccuracy` if your use case needs better than hundred-meter.

## Adaptation notes
- Info.plist: add `NSLocationWhenInUseUsageDescription` with honest copy, or every request silently no-ops.
- Set `LocationService.defaultAnchor` and `SupportedCity.all` to your markets; keep `fallback` and the anchor pointing at the same city.
- Merge `AppModel+Location.swift` into your root model and point `loadAllContent()` at your real load flow ([[ios-tiered-content-load]] composes directly: its `activeCenter` is this pattern's output).
- If selecting a city must re-anchor a per-city side system (a local clock, a per-city feed), key it off `city.slug` in `selectCity` / `useCurrentLocation` and fail closed for unknown slugs.
- Simulator: set a Location in the scheme or `didFailWithError` fires and you'll always be on the default anchor; that path is intentionally silent.
- Restyle `LocationPickerSheet` with your design tokens; the copied file uses system `Color.accentColor` / `.primary` placeholders.

## Provenance
- Origin files: `ios/KosherConnect/Utilities/LocationService.swift`, `ios/KosherConnect/Models/SupportedCity.swift`, `ios/KosherConnect/Views/LocationPickerSheet.swift`, plus the location-policy slice of `ios/KosherConnect/ViewModels/KosherConnectModel.swift` (~lines 151-259) and the pin persistence pair from `ios/KosherConnect/Services/PersistenceService.swift` @ 2026-08-08 (directory iOS app, live on main). Genericized for this library: the app-named model type renamed to `AppModel`; the curated market list (10 community-specific cities) replaced with 5 generic metros; brand color tokens replaced with system `Color.accentColor` / `.primary`; a per-city religious-calendar clock the origin re-anchors on city change abstracted to "per-city side systems" comments; UserDefaults key prefix neutralized to `app_`; comments referencing internal spec paths removed. The reusable control flow is intact.
- Related features: [[ios-tiered-content-load]]
- Related memory: none.
