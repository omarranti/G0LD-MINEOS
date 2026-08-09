# iOS Streak + Freeze-Pass Engine

> Duolingo-style streaks with "freeze pass" insurance: on launch the engine back-fills synthetic freeze entries for missed days, so streak recomputation stays one pure function instead of a special-cased counter, and the same entry set feeds a GitHub-style heatmap.

<!-- Structure over skin: the value is the repair-then-recompute order and the entry-set-as-source-of-truth idea, not the emoji or the XP numbers. -->

- **Slug:** `ios-streak-freeze-pass-engine`
- **Tags:** `gamification, streak, retention, ios, swiftui, calendar-math`
- **Source project:** habit iOS app
- **Stack:** Swift / SwiftUI (`@Observable`), Foundation `Calendar`, storage-agnostic (origin uses `UserDefaults` + `Codable`)
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live in app

## Problem it solves
Streaks are the retention mechanic, but a naive streak counter has two failure modes: one missed day wipes weeks of investment (users churn out of spite), and every forgiveness feature (freezes, repairs, grace days) turns the counter into a thicket of special cases. This engine gives users earned insurance against missed days while keeping the streak computation a single pure function over the entry list.

## When to reach for this
- Any daily-habit or daily-action app where a streak is the core retention loop and you want streak insurance (freezes, passes) without forking the streak logic.
- You are about to write `if missedYesterday && hasFreeze` branches inside a streak counter. Stop and use this shape instead.
- You need a contribution-graph heatmap and a streak from the same data and want them to never disagree.
- You want the earn economy (passes granted for consistency, capped bank) as a tunable dial, not hard-coded behavior.

## How it works
1. **The entry set is the single source of truth.** A day counts if any entry (real check-in or freeze) covers it. Streak, heatmap, and "checked in today" are all derived views over `entries`.
2. **Repair before recompute.** On every launch, `repairStreakIfNeeded()` runs first: if days were missed since the last covered day and the user has enough banked passes, it appends synthetic `HabitEntry(isFreeze: true)` rows for each missed day and decrements the bank. Only then is the streak recomputed.
3. **Repair is all-or-nothing.** If the user missed 3 days but has 2 passes, nothing is spent and the streak resets. Partial bridging would burn passes for no benefit.
4. **Streak recomputation is one pure function.** `currentStreakValue()` dedupes entry dates to start-of-day, requires the newest to be today or yesterday, then walks backward day by day. It never knows freezes exist.
5. **Earning is a modulo rule.** After each check-in, `awardStreakPassIfEarned()` grants one pass when `streak % passEarnInterval == 0` (origin: every 7 days), capped at `maxFreezePasses` (origin: 3). Both are parameters.
6. **The heatmap reads the same map.** `entriesForLastNDays(84)` builds a day-keyed dictionary where a real check-in wins over a freeze on the same day; `heatmapData()` lays it out as a 12-week grid aligned to the current week, flagging future cells so the view renders them empty.

## Data model
Local-only, `Codable` structs persisted by the app (origin: JSON blobs in `UserDefaults`). No server, no tables.
```
UserProfile   streak  longestStreak  totalCheckIns  xp  badges[]
              freezePasses  totalPassesEarned            -- the insurance bank
              (static maxFreezePasses = 3)
HabitEntry    id  date  challengeCompleted  moodScore?  xpEarned
              isFreeze                                   -- synthetic repair entry
HeatmapCell   id  date  hasEntry  challengeCompleted  isFuture   -- derived, not persisted
Milestone     id  title  requirement  emoji  isUnlocked          -- static ladder
```
The freeze mechanic lives entirely in `isFreeze` plus the two profile counters.

## Key decisions & gotchas
- **Back-fill instead of branch.** The tempting design is a streak counter that checks "was yesterday missed but forgiven." That special case metastasizes with every new forgiveness rule. Materializing freezes as entries means every consumer (streak, heatmap, week counts) gets forgiveness for free.
- **Order in `init` is load-bearing.** Repair must run before `refreshStreak()`, or the launch after a missed day shows streak 0 for one frame and then "repairs" a dead streak. The origin persists immediately after a repair (`streakSavedMessage != nil`) so a crash cannot re-spend passes.
- **Freeze entries never count as "checked in today."** Every today-lookup filters `!$0.isFreeze`. Otherwise a repaired day would block the real check-in (and its XP) for that day.
- **`startOfDay` everywhere, no raw date math.** All comparisons go through `Calendar` so DST transitions and timezone shifts do not create phantom missed days. Timezone changes mid-streak are otherwise deliberately not handled.
- **Guard `profile.streak > 0` before repairing.** No point spending passes to bridge onto a dead streak.
- **Migration-safe decoding.** `isFreeze`, `freezePasses`, and `totalPassesEarned` decode with `decodeIfPresent` and defaults, so entries and profiles persisted before the feature existed still load (existing users start with 1 banked pass as a gift).
- **Deliberately not handled:** buying passes (the bank is earn-only), retroactive repair deeper than the pass balance, and multi-timezone travel.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/HabitViewModel.swift` | Trimmed engine excerpt: init order, `checkIn`, `repairStreakIfNeeded`, `currentStreakValue`, `refreshStreak`, `awardStreakPassIfEarned`, `entriesForLastNDays`, `heatmapData` | `persist()` stub (origin: `UserDefaults` + widget mirror) |
| `code/HabitEntry.swift` | Check-in record with the `isFreeze` flag and migration-safe decoder | none |
| `code/UserProfile.swift` | Profile with `freezePasses` bank, `maxFreezePasses` cap, migration-safe decoder | none |
| `code/HeatmapCell.swift` | Derived cell struct the heatmap view renders | none |
| `code/Milestone.swift` | Static milestone ladder keyed off `totalCheckIns` | none |

## Structure to keep, skin to drop
- **Keep (the idea):** entries as the single source of truth, repair-before-recompute in `init`, all-or-nothing pass spending, the pure backward-walk streak function, `isFreeze` filtering on all today-lookups, the modulo earn rule with a capped bank, the real-beats-freeze rule in the day map, migration-safe `decodeIfPresent` decoding.
- **Drop (regenerate natively):** all copy (toast strings, `streakSavedMessage` wording, milestone titles), emoji, XP amounts and the level formula, the milestone requirement ladder values, and the heatmap's visual rendering. The origin also derives a growth-stage emoji from the streak and syncs widget state on save; both were cut here (widget sync is its own pattern).

## Adaptation notes
- Replace `persist()` with your storage (SwiftData, files, a backend). If state can change server-side, run the repair after every refresh, not just `init`.
- Tune the economy: `HabitViewModel.passEarnInterval` and `UserProfile.maxFreezePasses`. If passes become purchasable, the spend path needs no changes, only the earn path.
- `checkIn` here is trimmed to the engine-relevant slice; graft your own side effects (challenges, notifications re-arm, analytics) back onto it.
- The heatmap grid assumes weeks start on Sunday (`weekday - 1`); adjust if you honor `calendar.firstWeekday`.
- Pair with [[ios-streak-risk-notifications]] so the reminder window re-arms on the same check-in path.

## Provenance
- Origin files: `ios/TouchGrass/ViewModels/GrassViewModel.swift` (trimmed excerpt), `ios/TouchGrass/Models/UserProfile.swift`, `ios/TouchGrass/Models/GrassEntry.swift`, `ios/TouchGrass/Models/HeatmapCell.swift`, `ios/TouchGrass/Models/Milestone.swift` @ 2026-08-08 (habit iOS app, live). Genericized for this library: renamed `GrassViewModel` to `HabitViewModel`, `GrassEntry` to `HabitEntry`, `grassPasses`/`maxGrassPasses` to `freezePasses`/`maxFreezePasses`; brand copy (toasts, level titles, milestone titles, growth-stage emoji) removed or neutralized; photo-proof fields, challenges, friends, and persistence plumbing cut; the reusable control flow is intact.
- Related features: [[ios-streak-risk-notifications]], [[ios-widget-state-mirror]]
- Related memory: habit app project notes.
