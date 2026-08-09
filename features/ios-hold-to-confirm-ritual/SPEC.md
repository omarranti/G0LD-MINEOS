# iOS Hold-to-Confirm Ritual (progress ring + celebration)

> A complete "confirm ritual" for an app's single primary daily action: hold-to-fill progress ring, cancel on early release, haptic, particle burst, count-up number roll, and a deferred follow-up sheet.

<!-- Structure over skin: the value is the gesture choreography and the timing choices, not the green theme. -->

- **Slug:** `ios-hold-to-confirm-ritual`
- **Tags:** `gamification, interaction, gesture, haptics, animation, streak, habit, celebration`
- **Source project:** habit iOS app
- **Stack:** SwiftUI, iOS 17+ (`.sensoryFeedback`, `.contentTransition(.numericText)`)
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** working build (unreleased app)

## Problem it solves
When an app has exactly one action that matters per day (check in, log the habit, take the dose), a plain button makes that moment feel like nothing, and accidental taps fire it by mistake. This pattern makes the core action deliberate (a 1-second hold that can be aborted) and rewarding (haptic, radial particle burst, streak number rolling up), then sequences the follow-up ask so the celebration is not stepped on. It is the difference between a checkbox and a ritual, which is what makes daily-streak apps sticky.

## When to reach for this
- Any app with one primary daily action whose completion should feel earned and be hard to trigger accidentally.
- You want hold-to-confirm with a visible progress ring and correct cancel-on-early-release behavior (the part naive implementations get wrong).
- You want a self-contained celebration kit: haptics, particles, and an animated count-up, with a follow-up prompt that waits its turn.

## How it works
1. **Two simultaneous gestures, on purpose.** A `LongPressGesture(minimumDuration: 1.0)` starts the hold (`onChanged`) and fires completion (`onEnded`). A `DragGesture(minimumDistance: 0)` attached via `.simultaneousGesture` is the only reliable way to observe "finger lifted early": its `onEnded` cancels the hold when progress is under 1.0. Neither gesture alone covers both the completion and the abort.
2. **Ring driven by a scheduled loop.** `startHoldTimer()` pre-schedules 30 `DispatchQueue.main.asyncAfter` closures over 1 second; each advances `holdProgress` only while `isHolding` is still true, so cancellation starves the remaining ticks. The ring is a `Circle().trim(from: 0, to: holdProgress)` rotated -90 degrees with a fast `.linear(duration: 0.05)` animation per tick.
3. **Cancel springs back.** `cancelHold()` clears `isHolding` and animates progress to 0 with a spring, so an aborted hold visibly deflates instead of snapping.
4. **Celebration is trigger-counted.** `celebrationTrigger += 1` drives everything downstream: `.sensoryFeedback(.impact(weight: .medium), trigger:)` for the haptic, and 16 `ParticleView`s that each re-fire on trigger change. Particles fan out radially (index * 360/16 degrees), random distance 100 to 200, biased 60pt upward, spring out then fade. Tapping the already-confirmed card just increments the trigger again, so the party is replayable.
5. **Count-up number roll.** `animateStreakCounter()` steps a `displayedStreak` state var up to the real value (at most 20 visible steps inside 0.4s), each step wrapped in `withAnimation(.snappy)` so `.contentTransition(.numericText)` ticks the digits.
6. **Deferred follow-up.** The follow-up sheet (a mood picker in origin) opens 1.5s after completion, not immediately, so the celebration finishes before the next ask. The origin re-checks confirmed state before presenting.

## Data model
Stateless. The excerpt takes `isConfirmed`, `streak`, and an `onConfirm` closure; all persistence lives in the destination app's model.

## Key decisions & gotchas
- **The hold timer is the part to rebuild.** It is a pre-scheduled `DispatchQueue.asyncAfter` loop guarded by a bool. It works, but the closures are not cancelled on abort (just starved), timing drifts under main-thread pressure, and a rapid release-and-re-press can interleave two schedules. When adapting, rebuild the ring on `TimelineView` or a phase animator / `KeyframeAnimator` keyed off the gesture state, and keep everything else.
- **`minimumDistance: 0` is load-bearing.** With any larger value the drag gesture never fires for a stationary press, and early release goes unnoticed, leaving a stuck half-filled ring.
- **Guard every entry point on confirmed state.** Both gesture callbacks bail if already confirmed; otherwise the action double-fires.
- **Trigger-counter pattern over booleans.** An `Int` that only increments lets haptics and 16 independent particle views re-fire every time without the reset dance a `Bool` needs.
- **Count-up caps at 20 steps.** A 300-day streak rolls the last 20 numbers, not all 300; total duration stays fixed at 0.4s regardless of streak size.
- **Deliberately not handled:** reduce-motion accommodation (particles and roll always play), VoiceOver access to the hold gesture (origin had no alternate activation), and persistence of a mid-hold state across backgrounding.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/HoldToConfirmRitual.swift` | Trimmed excerpt: the confirm card with both gestures, hold timer, cancel, haptic, particle overlay + `ParticleView`, count-up counter, deferred follow-up sheet, and the minimal `Theme` token surface | `Theme` token values, `centerEmoji` / particle emoji set, follow-up sheet content, your model behind `isConfirmed` / `streak` / `onConfirm` |

## Structure to keep, skin to drop
- **Keep (the idea):** the simultaneous LongPress + zero-distance Drag pair, the isHolding-guarded progress loop (rebuilt on TimelineView), cancel-with-spring, the increment-only celebration trigger driving haptics and particles, the radial-by-index particle math, the capped count-up with `.numericText`, and the 1.5s deferred follow-up.
- **Drop (regenerate natively):** the dark green palette and all `Theme` values, serif typography, card corner radius and shadows, the plant/leaf emoji sets, the copy ("Hold to confirm", "Day Streak"), the 260pt card height, and the origin's surrounding home-screen furniture (greeting, challenge card, XP bar, mesh gradient background), which was trimmed out of this excerpt entirely.

## Adaptation notes
- iOS 17+ APIs in use: `.sensoryFeedback`, `.contentTransition(.numericText(value:))`, `.snappy`. On iOS 16 fall back to `UIImpactFeedbackGenerator` and a plain numeric transition.
- Wire `onConfirm` to your model's mutation and derive `isConfirmed` / `streak` from it; the excerpt holds no state of record.
- Rebuild `startHoldTimer` on `TimelineView`/phase animator as flagged above; keep the 1.0s duration matched to the `LongPressGesture` minimumDuration or the ring will finish out of sync with the gesture.
- Tune the hold duration to the stakes: 1s reads as deliberate for a daily action; go shorter for frequent actions.
- Replace the follow-up sheet placeholder with your real deferred ask, and keep the delay (1.2 to 1.5s) so it lands after the burst.

## Provenance
- Origin files: `ios/<app>/Views/HomeView.swift` (checkInCard, startHoldTimer, cancelHold, completeCheckIn, animateStreakCounter, particleOverlay, ParticleView) and `ios/<app>/Utilities/Theme.swift` (token subset) @ 2026-08-08 (habit iOS app, working build). Genericized for this library: extracted as a trimmed excerpt, not the whole view; `GrassTheme` renamed `Theme` and cut to the tokens the excerpt touches; the view-model coupling (`GrassViewModel.checkIn`, `hasCheckedInToday`, streak/plant properties) replaced with `isConfirmed` / `streak` / `centerEmoji` / `onConfirm` inputs; the origin's mood-picker sheet replaced with a placeholder; check-in copy neutralized. Gesture choreography, timings, particle math, and count-up logic are intact.
- Related features: [[ios-photo-proof-gate]], [[mood-ring-checkin-card]]
- Related memory: none
