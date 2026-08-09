# iOS Widget State Mirror (App Group scalars + freshness stamp)

> The app writes flat display-ready scalars (not the domain model) to shared UserDefaults on every save; the widget validates a last-sync timestamp so a stale "done today" cannot survive midnight, and covers Home Screen plus Lock Screen families in one switch.

<!-- Structure over skin: the value is the flat-scalar contract and the freshness check, not the emoji or the colors. -->

- **Slug:** `ios-widget-state-mirror`
- **Tags:** `widget, widgetkit, ios, app-group, state-sync, lock-screen`
- **Source project:** habit iOS app
- **Stack:** Swift / SwiftUI, WidgetKit (`StaticConfiguration`, `TimelineProvider`), App Group `UserDefaults`
- **Reuse confidence:** drop-in (rename keys)
- **Status in origin:** live in app

## Problem it solves
A widget extension is a separate process with no access to the app's in-memory state. The obvious approaches both fail: sharing the full `Codable` domain model couples the widget to every model migration (an old widget binary decoding a new model shape silently falls back to placeholders), and trusting whatever was last written means day-relative facts like "done today" go stale, so the widget shows yesterday's checkmark all morning. This pattern makes the mirror dumb, flat, and self-invalidating.

## When to reach for this
- Any app + widget pair where the widget shows a summary of app state (streak, count, status flag) that the app computes.
- Your widget shows "completed today" or any other day-relative fact. You need the freshness stamp or it will lie after midnight.
- You are about to share your `Codable` models with the widget target. Use flat scalars instead.
- You want one widget source file to serve system sizes and Lock Screen accessories.

## How it works
1. **The app owns all computation.** On every save, the view model's `syncWidgetData()` writes the already-derived display values (streak int, done-today bool, status emoji string, pass count int) to `UserDefaults(suiteName: appGroupID)`. The widget never decodes a model or re-derives anything.
2. **A freshness stamp rides along.** Every sync also writes `widget_last_sync` as a Unix timestamp. It is the mirror's validity claim: "these values describe the day I was written."
3. **`reloadAllTimelines()` immediately after writing.** The mirror write and the reload are one unit; the widget re-reads the defaults within seconds of any app-side change.
4. **The widget gates day-relative values on the stamp.** `currentEntry()` computes `syncedToday = calendar.isDateInToday(lastSync)` and only honors `widget_checked_in_today` when true. Day-absolute values (streak, passes) are shown regardless; only the day-relative flag is gated.
5. **Timeline policy is next midnight.** `getTimeline` emits a single entry with `.after(startOfDay(tomorrow))`, so even if the app never opens again, the widget re-renders at midnight, the stamp check fails, and the checkmark resets to "not yet."
6. **One switch covers all families.** The view switches on `widgetFamily` for `.accessoryCircular`, `.accessoryRectangular`, `.systemMedium`, and a default that serves `.systemSmall`, so system and Lock Screen surfaces stay in lockstep from one data entry.

## Data model
No database. The contract is the shared `UserDefaults` key set (rename to your namespace, keep the shape):
```
widget_streak             Int      -- day-absolute, shown as-is
widget_checked_in_today   Bool     -- day-relative, only valid if synced today
widget_status_emoji       String   -- display-ready, app-derived
widget_freeze_passes      Int      -- day-absolute
widget_last_sync          Double   -- Unix timestamp, the freshness stamp
```
Plus the App Group ID string, which must be identical in the app target, the widget target, and both entitlements files.

## Key decisions & gotchas
- **Flat scalars over shared `Codable` models.** The widget binary and app binary update independently (a widget can run an old binary against new data after an app update). Primitive keys cannot fail to decode; at worst a missing key falls back to a zero value.
- **The freshness stamp is the core trick.** Without it, a user who checks in Monday evening sees "Done ✅" all Tuesday morning until they open the app. The stamp turns "value written" into "value written today," which is the actual claim the UI makes.
- **Gate only day-relative values.** Zeroing the streak when the stamp is stale would be wrong; the streak is still the streak. Only "today" facts expire.
- **Midnight timeline policy pairs with the stamp.** The stamp alone is not enough: WidgetKit will not re-render without a timeline event, so the `.after(midnight)` policy is what makes the stale checkmark actually disappear at 00:00.
- **Sync from inside the save path, not call sites.** The origin calls `syncWidgetData()` at the end of its single `saveAll()`, so no state change can forget to mirror. Do not sprinkle sync calls per feature.
- **Deliberately not handled:** widget deep links and interactive widget buttons (no `AppIntent`), iPad `.systemLarge`, live activities, and multi-widget bundles beyond the single streak widget.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/WidgetSync.swift` | App-side extension: `syncWidgetData()` writes the scalar mirror + stamp, then reloads timelines; `statusEmoji` as an example derived display value | `HabitViewModel` (host view model), App Group ID |
| `code/HabitWidget.swift` | Widget target: `TimelineProvider` with stamp validation and midnight policy, `WidgetBundle`, and one view switching over four families | App Group ID; all styling is placeholder skin |

App Group setup (configuration, not code, so no entitlement files are copied):
1. In both the app target and the widget extension target, add the App Groups capability (Signing & Capabilities).
2. Use the same group identifier in both, and register it on the App ID in the developer portal (Xcode's automatic signing does this for you).
3. Put that identifier in the `appGroupID` constants on both sides. A mismatch fails silently: `UserDefaults(suiteName:)` returns a working-looking instance whose data the other process never sees.

## Structure to keep, skin to drop
- **Keep (the idea):** the flat-scalar contract, app-side derivation of display values, the `widget_last_sync` stamp and the `syncedToday` gate on day-relative values, sync-inside-save plus immediate `reloadAllTimelines()`, the next-midnight timeline policy, one switch covering system and accessory families.
- **Drop (regenerate natively):** every visual choice in `HabitWidgetView` (colors, fonts, emoji, copy, layout per family), the widget display name and description, the specific mirrored fields (streak, passes, status emoji are the origin's; mirror whatever your product shows), and the key names themselves (rename to your namespace).

## Adaptation notes
- Set a real App Group ID in both `appGroupID` constants and both targets' capabilities; this is the number one silent failure.
- Rename the `widget_*` keys to your own prefix and keep app and widget in sync; a shared constants file compiled into both targets prevents drift.
- Call `syncWidgetData()` from your single persistence choke point. If you have several save paths, unify them first.
- If a mirrored fact is relative to something other than the calendar day (a week, a billing period), gate it with the same stamp pattern against that period and set the timeline policy to the period boundary.
- Lock Screen accessory families render in system tint; do not rely on your colors surviving there.
- Pair with [[ios-streak-freeze-pass-engine]]: its `saveAll()` is where the origin hangs this sync.

## Provenance
- Origin files: `ios/TouchGrass/ViewModels/GrassViewModel.swift` (the `syncWidgetData()` slice and streak-emoji derivation), `ios/TouchGrassWidget/TouchGrassWidget.swift` @ 2026-08-08 (habit iOS app, live). Genericized for this library: renamed `TouchGrassWidgetBundle`/`TouchGrassStreakWidget`/`GrassWidgetEntry`/`GrassWidgetProvider`/`GrassWidgetView` to `Habit*` equivalents, `plantEmoji`/`widget_plant_emoji` to `statusEmoji`/`widget_status_emoji`, `grassPasses`/`widget_grass_passes` to `freezePasses`/`widget_freeze_passes`; real App Group ID replaced with a placeholder; brand copy in widget strings neutralized; entitlements files described above instead of copied; the reusable control flow is intact.
- Related features: [[ios-streak-freeze-pass-engine]]
- Related memory: habit app project notes.
