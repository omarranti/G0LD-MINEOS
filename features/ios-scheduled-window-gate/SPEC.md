# iOS Scheduled Window Gate

> Gate UI affordances on a server-fetched wall-clock window that flips at the exact boundary minute with one self-rescheduling Timer and zero polling.

<!-- Structure over skin: the value is the state machine and the one-timer scheduling discipline, not the origin's use case. -->

- **Slug:** `ios-scheduled-window-gate`
- **Tags:** `ios, swiftui, scheduling, time-window, gating, timer, observable`
- **Source project:** directory iOS app
- **Stack:** Swift / SwiftUI, `@Observable` + `@MainActor`, ISO8601DateFormatter, Timer
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live in prod

## Problem it solves
The app must change behavior (hide or swap CTAs, alter cards, suppress actions) during a recurring time window whose exact boundaries only the server knows, because they depend on location and date. Naive approaches poll on an interval (battery, laggy flips, still misses the boundary by up to the interval) or compute boundaries client-side (duplicated logic that drifts from the server). This clock fetches the window once, derives state by wall-clock comparison, and arms exactly one non-repeating Timer for the next boundary, so the UI flips at the right minute and never spins a run loop in between.

## When to reach for this
- Any "the app behaves differently between time X and time Y" requirement where X and Y come from an API: quiet hours, store open/closed hours, promo start and end windows, regional blackout periods, maintenance windows, happy-hour pricing.
- You caught yourself writing `Timer.publish(every: 60)` and comparing dates in a view body.
- You need the flip to happen while the app is open, without a network round trip at the boundary.
- You need a deliberate answer for "what does the UI do when the schedule fetch fails."

## How it works
- A `WindowDTO` arrives from the server carrying `startISO` and `endISO` as full-offset ISO 8601 strings. The client does zero boundary math; it only compares `Date` instances. This keeps the schedule logic (sunset tables, holidays, regional rules) in one place, server-side.
- `WindowClock` (`@Observable @MainActor`) derives a three-way enum: `unknown` (nothing fetched or fetch failed), `active(dto)` (now is outside the window), `quiet(dto)` (now is inside it). The enum carries the DTO so views can render the window's times without a second lookup. `state.suppressed` is the single boolean views gate on.
- After every state application it invalidates any pending timer and schedules exactly one non-repeating `Timer` for the next boundary (start if we're before it, end if we're inside, none if it's passed), padded by 1 second so the fire lands cleanly on the far side of the boundary. The timer callback just calls `tick()`, which re-derives state from the already-held DTO. No polling, no repeating timers.
- ISO parsing tries `.withFractionalSeconds` first, then plain `.withInternetDateTime`. Servers are inconsistent about fractional seconds and `ISO8601DateFormatter` is strict, so single-format parsing silently yields `nil` dates and a permanently `unknown` clock.
- Fetch failures set `lastFetchError` and keep the prior state if one exists; a never-fetched clock stays `unknown`. `unknown` fails OPEN: gated affordances stay enabled. See the polarity decision below.
- The app entry hooks `scenePhase`: on foregrounding it calls `tick()` (immediate re-derive, because iOS froze the Timer while suspended and the boundary may have passed) then `refresh()` (re-fetch, because the held window itself may have elapsed).

## Data model
Stateless on device beyond the in-memory clock. The server contract:
```
WindowDTO
  regionSlug        which schedule this is for
  locationLabel     human label for the region
  startISO/endISO   full-offset ISO 8601 boundaries (the only fields the logic needs)
  start*/end*Local  pre-formatted display strings so the client never re-formats times
```

## Key decisions & gotchas
- **Fail-open polarity.** This origin shows the gated UI when state is `unknown` (fetch failed or not yet run). Rationale: the gate is a courtesy behavior, and breaking core functionality because a schedule endpoint hiccuped is the worse failure. FLIP THIS to fail-closed when the window enforces something binding: legal or compliance blackouts, embargoed content, regional restrictions. Fail-closed means `unknown` suppresses; you get it by adding `case .unknown: return true` in `suppressed` and accepting that an outage hides the feature.
- **One timer, re-armed on every apply, never repeating.** Repeating timers drift and burn cycles; polling flips late. Scheduling for the exact next boundary makes the transition land on the minute. The +1s pad matters: firing exactly at the boundary can re-derive on the wrong side of it.
- **Timers freeze in the background.** The scenePhase foreground hook is not optional. Without it, a user who backgrounds the app before the boundary and returns after it sees stale state until the next fetch.
- **Dual-format ISO parsing.** The silent failure mode is nasty: one format only, server omits (or adds) fractional seconds, `parseISO` returns nil, state falls to `unknown`, and because unknown fails open nothing visibly breaks. You just never gate. Keep both attempts.
- **`tick()` is cheap and idempotent**, so it is safe to call from the timer, from foregrounding, and from anywhere else that suspects the wall clock moved (e.g. significant time-change notifications, not handled in origin).
- **Deliberately not handled:** multiple simultaneous windows (the DTO is one upcoming window; after it passes, state is `active` until the next refresh fetches the next window), `NSSystemClockDidChange` observation, and offline caching of the schedule.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/WindowClock.swift` | `WindowState` enum (unknown/active/quiet + `suppressed`) and the `@Observable @MainActor` clock: refresh, tick, apply, single boundary timer, dual-format ISO parse | none |
| `code/WindowRepository.swift` | `WindowDTO` contract + thin fetch wrapper for the schedule endpoint | `APIClient.shared` (see [[ios-api-client]]), endpoint path |
| `code/AppForegroundHook.swift` | Excerpt: `scenePhase` wiring in the app entry + the root-model `handleForegrounded()` that ticks then refreshes | your app entry and root model names |

## Structure to keep, skin to drop
- **Keep (the idea):** the three-state enum with the DTO as associated value, `suppressed` as the one gating boolean, server-computed boundaries with client-side comparison only, the invalidate-then-arm single boundary timer with the +1s pad, dual-format ISO parsing, the explicit fail-open `unknown`, and the tick-then-refresh foreground hook.
- **Drop (regenerate natively):** the endpoint path and DTO field names (match your API), the region-slug anchoring concept if your window is global, the display-string fields if you format client-side, and every UI treatment of the states (what "suppressed" means visually is entirely the destination app's call).

## Adaptation notes
- Rename the vocabulary to your domain (quiet hours, store hours, blackout) and map your API response onto `WindowDTO`; only `startISO`/`endISO` are load-bearing.
- Swap `APIClient.shared` for your networking layer ([[ios-api-client]] is the matching pattern in this library).
- Wire ownership: the clock wants a single long-lived owner (root model or app-level `@State`) plus the scenePhase hook. Views read `model.clock.state.suppressed`.
- Decide the polarity (see gotchas) before shipping, not after the first outage.
- If your window recurs tightly (daily quiet hours), have `refresh()` return the NEXT window whenever the current one has passed, which the origin's server already does.
- Requires iOS 17+ for `@Observable`; on older targets swap to `ObservableObject` + `@Published` with the same logic.

## Provenance
- Origin files: `ios/KosherConnect/Utilities/ShabbosClock.swift`, `ios/KosherConnect/Networking/ShabbosRepository.swift`, `ios/KosherConnect/KosherConnectApp.swift` + `ViewModels/KosherConnectModel.swift` (foreground hook) @ 2026-08-08 (directory iOS app, live). Genericized for this library: the origin is a religious-observance mode (Shabbos mode: candle-lighting to Havdalah, commerce CTAs suppressed in-window); the library publishes the general mechanism. `ShabbosClock` renamed `WindowClock`, `ShabbatDTO` renamed `WindowDTO` with `candleLighting*`/`havdalah*` fields as `start*`/`end*` and observance-specific fields (parsha, holiday) dropped, `commerceSuppressed` renamed `suppressed`, city anchoring renamed region anchoring. The origin's four states (`unknown`/`preShabbos`/`inShabbos`/`postShabbos`) collapse to three here: `preShabbos` and `postShabbos` both map to `active` since they gate identically; the origin used the pre/post distinction only for card visibility in views. All control flow (wall-clock derivation, single boundary timer, dual-format parsing, fail-open unknown, foreground tick-then-refresh) is verbatim.
- Related features: [[calendar-quiet-windows]] (companion web module), [[ios-api-client]]
- Related memory: none
