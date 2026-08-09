# iOS Streak-Risk Notifications (server-free conditional reminders)

> Server-free conditional daily reminders: a rolling window of seven one-shot evening alerts with deterministic IDs, re-armed on every check-in and launch so a reminder never fires after the user already did the thing.

<!-- Structure over skin: the value is the re-arm-the-whole-window trick, not the 8pm hour or the copy. -->

- **Slug:** `ios-streak-risk-notifications`
- **Tags:** `notifications, retention, streak, ios, local-notifications`
- **Source project:** habit iOS app
- **Stack:** Swift, `UserNotifications` (local notifications only, no push, no server)
- **Reuse confidence:** drop-in
- **Status in origin:** live in app

## Problem it solves
"Remind users who haven't done the thing today" normally needs a server that knows who checked in and sends push. Without one, a naive repeating local notification fires every evening including days the user already checked in, which trains them to ignore it (or disable notifications entirely). This gets conditional behavior from purely local one-shot notifications.

## When to reach for this
- A daily-action app with no backend (or no push infrastructure) that needs "you haven't done it yet today" nudges.
- You have a repeating local reminder and users complain it fires after they already completed the action.
- Any pattern where notification state must be recomputed from local app state: the re-arm-on-every-touchpoint discipline here generalizes.

## How it works
1. **A rolling 7-day window of one-shot alerts.** Instead of one repeating trigger (which cannot be conditioned), schedule seven non-repeating `UNCalendarNotificationTrigger`s, one per evening at 8pm, identifiers `streak_risk_0` through `streak_risk_6`.
2. **Deterministic IDs make the window replaceable.** Every refresh first calls `removePendingNotificationRequests` with the full known ID list, then rebuilds. There is never a diff to compute; the window is always torn down and re-armed whole.
3. **Re-arm at every touchpoint.** `refreshStreakRiskAlerts(enabled:checkedInToday:)` is called from app launch and from the check-in action. Days 1 through 6 act as a dead-man's switch: if the user never opens the app again, alerts still fire for a week, then stop rather than nag forever.
4. **The conditional is only about tonight.** When `checkedInToday` is true, the `dayOffset == 0` alert is skipped and tomorrow onward is scheduled anyway. The moment the user checks in, tonight's pending alert is removed by the rebuild.
5. **Past fire-times are skipped.** The `fireDate > now` guard drops tonight's slot when it is already past 8pm, instead of firing immediately on schedule.
6. **Randomized copy pools.** Each scheduled alert draws a random body from a message pool at scheduling time, so consecutive evenings read differently.

## Data model
Stateless. The only persistent state is iOS's own pending-notification queue plus two booleans the caller passes in (`enabled` from the user's settings, `checkedInToday` derived from the entry list). Notification identifiers: `daily_reminder`, `streak_risk_0`...`streak_risk_6` (plus legacy `streak_risk`, removed on every refresh).

## Key decisions & gotchas
- **One-shots, not a repeating trigger.** A repeating trigger cannot be skipped for a single day; you would have to cancel and re-create it anyway. Seven one-shots make the "skip tonight only" case trivial.
- **Tear down the whole window every time.** No incremental updates, no reading pending requests back. Rebuilding from scratch is idempotent and immune to drift between app state and the notification queue.
- **Remove legacy IDs forever.** The origin shipped a single-alert version under the bare id `streak_risk` first; the refresh removes it on every call because stale scheduled notifications from old app versions otherwise survive updates indefinitely.
- **The window doubles as a lapse-nudge with a built-in stop.** A user who stops opening the app gets at most 7 nudges, then silence. That cap is the window length; extend it consciously, not accidentally.
- **Copy randomness is per-schedule, not per-fire.** The body is chosen when the alert is scheduled, so all seven alerts of one refresh could theoretically repeat a message. Fine at pool sizes of 4 to 7; do not promise "never repeats."
- **Deliberately not handled:** timezone changes after scheduling (fire dates are fixed at schedule time), quiet-hours or user-chosen alert times for the risk window (8pm is hard-coded), and re-arming from a background task (only launch and check-in re-arm).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/NotificationService.swift` | Singleton service: permission request, plain repeating daily reminder, and `refreshStreakRiskAlerts` (the rolling conditional window) | none (pure `UserNotifications`) |

Re-arm call sites to wire in the host app (described, not copied):
- **App launch:** the root view model calls `NotificationService.shared.refreshStreakRiskAlerts(enabled: profile.streakAlertsEnabled, checkedInToday: hasCheckedInToday)` from an `onAppLaunch()` hook.
- **Check-in:** the check-in action calls the same method with `checkedInToday: true` immediately after recording the entry.
- **Settings toggle:** call it again when the user flips the alerts preference (passing `enabled: false` clears the window).

## Structure to keep, skin to drop
- **Keep (the idea):** the 7-slot one-shot window, deterministic identifiers with full teardown-and-rebuild, re-arm on launch and on action-completion, the skip-tonight conditional, the `fireDate > now` guard, legacy-ID cleanup, randomized copy pools.
- **Drop (regenerate natively):** all message copy and titles (the pools here are neutral placeholders; write yours in the product's voice), the 8pm hour, the emoji, and the separate `daily_reminder` morning nudge if the product does not want an unconditional reminder.

## Adaptation notes
- Requires notification permission; call `requestPermission()` from onboarding before the first schedule attempt (scheduling without permission silently no-ops).
- Rename the `streak_risk_` identifier prefix to your own namespace and keep it stable forever; it is your only handle on already-scheduled alerts.
- Wire the two call sites (launch + action completion) and the settings toggle. Missing the action-completion call is the classic bug: the user checks in and still gets nagged at 8pm.
- If the "did it today" state can change outside the app (server sync, widget intent, watch app), add a re-arm wherever that state lands.
- Pair with [[ios-streak-freeze-pass-engine]]: its `checkIn()` and launch path are exactly the two re-arm call sites.

## Provenance
- Origin file: `ios/TouchGrass/Services/NotificationService.swift` @ 2026-08-08 (habit iOS app, live). Genericized for this library: brand copy in both message pools and the reminder title replaced with neutral placeholders; the reusable control flow is intact. Call sites live in the origin view model (`onAppLaunch()` and `checkIn()` in `ios/TouchGrass/ViewModels/GrassViewModel.swift`) and are described above rather than copied.
- Related features: [[ios-streak-freeze-pass-engine]]
- Related memory: habit app project notes.
