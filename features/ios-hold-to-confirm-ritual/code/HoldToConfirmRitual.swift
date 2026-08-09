import SwiftUI

// TRIMMED EXCERPT of the origin home screen: only the interaction machinery of
// the "confirm ritual" for the app's single primary daily action. The origin
// view also carried a greeting, challenge card, XP bar, toast, and mesh
// background; those are omitted. Wire `onConfirm` / state to your own model.
//
// The full ritual, in firing order:
//   1. hold-progress ring fills while the user presses (LongPressGesture)
//   2. releasing early cancels and springs the ring back (DragGesture end)
//   3. completing fires the action, a haptic, and a 16-particle burst
//   4. the streak number rolls up with .numericText content transitions
//   5. a follow-up sheet (mood picker in origin) is deferred 1.5s so the
//      celebration lands before the next ask

/// Minimal token surface the excerpt touches. Restyle natively in destination.
enum Theme {
    static let background = Color(red: 14/255, green: 26/255, blue: 18/255)
    static let surface = Color(red: 22/255, green: 34/255, blue: 25/255)
    static let accent = Color(red: 94/255, green: 232/255, blue: 122/255)
    static let warm = Color(red: 245/255, green: 201/255, blue: 122/255)
    static let textPrimary = Color(red: 242/255, green: 245/255, blue: 240/255)
    static let textSecondary = Color(red: 122/255, green: 158/255, blue: 130/255)
}

struct HoldToConfirmRitual: View {
    /// Whether today's action is already confirmed (owned by your model).
    var isConfirmed: Bool
    /// Current streak value to roll the counter up to.
    var streak: Int
    /// The emoji (origin: a plant that grows with streak length) at the center.
    var centerEmoji: String
    /// Fires exactly once when the hold completes.
    var onConfirm: () -> Void

    @State private var holdProgress: CGFloat = 0
    @State private var isHolding: Bool = false
    @State private var celebrationTrigger: Int = 0
    @State private var displayedStreak: Int = 0
    @State private var showFollowUpSheet: Bool = false

    var body: some View {
        ZStack {
            VStack(spacing: 28) {
                confirmCard
                streakCounter
            }
            particleOverlay
        }
        .onAppear { animateStreakCounter() }
        .sheet(isPresented: $showFollowUpSheet) {
            // Origin: a mood picker. Put your deferred follow-up ask here.
            Text("Follow-up")
                .presentationDetents([.height(280)])
        }
    }

    // MARK: the card + gestures

    private var confirmCard: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 28)
                .fill(Theme.surface)
                .frame(height: 260)
                .overlay {
                    RoundedRectangle(cornerRadius: 28)
                        .stroke(
                            isConfirmed
                                ? Theme.warm.opacity(0.3)
                                : Theme.accent.opacity(holdProgress > 0 ? 0.4 : 0.1),
                            lineWidth: 2
                        )
                }
                .shadow(color: isConfirmed ? Theme.warm.opacity(0.15) : Theme.accent.opacity(0.1), radius: 24, y: 8)

            VStack(spacing: 12) {
                ZStack {
                    if !isConfirmed {
                        Circle()
                            .trim(from: 0, to: holdProgress)
                            .stroke(Theme.accent, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                            .frame(width: 110, height: 110)
                            .rotationEffect(.degrees(-90))
                            .animation(.linear(duration: 0.05), value: holdProgress)
                    }

                    Text(centerEmoji)
                        .font(.system(size: 72))
                        .scaleEffect(isHolding ? 0.88 : 1.0)
                        .scaleEffect(isConfirmed ? 1.1 : 1.0)
                        .animation(.spring(response: 0.3, dampingFraction: 0.5), value: isHolding)
                        .animation(.spring(response: 0.5, dampingFraction: 0.6), value: isConfirmed)
                }

                if isConfirmed {
                    Text("Done for today")
                        .font(.system(.title3, design: .serif, weight: .bold))
                        .foregroundStyle(Theme.warm)
                        .transition(.scale.combined(with: .opacity))
                } else {
                    VStack(spacing: 4) {
                        Text("Hold to confirm")
                            .font(.system(.title3, design: .serif, weight: .bold))
                            .foregroundStyle(Theme.textPrimary)
                        Text("Press & hold for 1 second")
                            .font(.system(.caption, design: .default))
                            .foregroundStyle(Theme.textSecondary)
                    }
                }
            }
        }
        // Two SIMULTANEOUS gestures: the LongPress drives start/complete, the
        // zero-distance Drag is the only reliable way to observe "finger lifted
        // early" and cancel. Neither alone covers both ends.
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 1.0)
                .onChanged { _ in
                    guard !isConfirmed else { return }
                    isHolding = true
                    startHoldTimer()
                }
                .onEnded { _ in
                    guard !isConfirmed else { return }
                    completeConfirm()
                }
        )
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onEnded { _ in
                    if isConfirmed {
                        // Tapping the already-confirmed card replays the party.
                        celebrationTrigger += 1
                    } else if holdProgress < 1.0 {
                        cancelHold()
                    }
                }
        )
        .sensoryFeedback(.impact(weight: .medium), trigger: celebrationTrigger)
        .animation(.spring(response: 0.5, dampingFraction: 0.7), value: isConfirmed)
    }

    // MARK: streak counter (count-up number roll)

    private var streakCounter: some View {
        HStack(spacing: 8) {
            Text("🔥")
                .font(.system(size: 28))
            Text("\(displayedStreak)")
                .font(.system(size: 42, weight: .bold, design: .monospaced))
                .foregroundStyle(Theme.accent)
                .contentTransition(.numericText(value: Double(displayedStreak)))
            Text("Day Streak")
                .font(.system(.title3, design: .default, weight: .medium))
                .foregroundStyle(Theme.textSecondary)
        }
    }

    // MARK: celebration burst

    private var particleOverlay: some View {
        ZStack {
            ForEach(0..<16, id: \.self) { index in
                ParticleView(index: index, trigger: celebrationTrigger)
            }
        }
        .allowsHitTesting(false)
    }

    // MARK: hold machinery

    // GOTCHA: this drives the ring with 30 scheduled DispatchQueue.asyncAfter
    // closures guarded by `isHolding`. It works, but when adapting, rebuild on
    // TimelineView or a phase animator (see SPEC gotchas).
    private func startHoldTimer() {
        holdProgress = 0
        let steps = 30
        let interval = 1.0 / Double(steps)
        for i in 1...steps {
            DispatchQueue.main.asyncAfter(deadline: .now() + interval * Double(i)) {
                guard isHolding else { return }
                holdProgress = CGFloat(i) / CGFloat(steps)
            }
        }
    }

    private func completeConfirm() {
        isHolding = false
        holdProgress = 1.0
        onConfirm()
        celebrationTrigger += 1

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            holdProgress = 0
        }

        // Defer the follow-up ask so the celebration lands first.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            if isConfirmed {
                showFollowUpSheet = true
            }
        }

        animateStreakCounter()
    }

    private func cancelHold() {
        isHolding = false
        withAnimation(.spring(response: 0.3)) {
            holdProgress = 0
        }
    }

    // Rolls the displayed number up to the real streak, at most 20 visible
    // steps, inside 0.4s total, each step animated .snappy so .numericText
    // ticks digit by digit.
    private func animateStreakCounter() {
        let target = streak
        guard target != displayedStreak else { return }
        let steps = min(target, 20)
        guard steps > 0 else {
            displayedStreak = target
            return
        }
        let interval = 0.4 / Double(steps)
        for i in 1...steps {
            DispatchQueue.main.asyncAfter(deadline: .now() + interval * Double(i)) {
                withAnimation(.snappy) {
                    displayedStreak = target - steps + i
                }
            }
        }
    }
}

/// One emoji particle in the radial celebration burst. 16 instances, each owns
/// its slice of the circle by index; re-fires whenever `trigger` increments.
struct ParticleView: View {
    let index: Int
    let trigger: Int
    @State private var offset: CGSize = .zero
    @State private var opacity: Double = 0
    @State private var rotation: Double = 0

    // Swap for your domain's celebration set.
    private let emojis = ["🌿", "🍃", "✨", "🌱", "☘️", "🌾", "💚", "⭐"]

    var body: some View {
        Text(emojis[index % emojis.count])
            .font(.system(size: CGFloat.random(in: 14...28)))
            .offset(offset)
            .opacity(opacity)
            .rotationEffect(.degrees(rotation))
            .onChange(of: trigger) { _, _ in
                animate()
            }
    }

    private func animate() {
        offset = .zero
        opacity = 1
        rotation = 0

        let angle = Double(index) * (360.0 / 16.0) * .pi / 180
        let distance = CGFloat.random(in: 100...200)

        withAnimation(.spring(response: 0.7, dampingFraction: 0.4)) {
            offset = CGSize(
                width: cos(angle) * distance,
                height: sin(angle) * distance - 60
            )
            rotation = Double.random(in: -45...45)
        }

        withAnimation(.easeOut(duration: 1.0).delay(0.5)) {
            opacity = 0
        }
    }
}
