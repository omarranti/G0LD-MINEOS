import SwiftUI

// Trimmed excerpt of the origin view model, focused on the streak + freeze-pass
// engine and the heatmap feed. Persistence, photo proof, challenges, friends,
// and toast plumbing from the origin are cut; `persist()` is a stub to replace
// with your storage layer.
@Observable
@MainActor
class HabitViewModel {
    var profile: UserProfile
    var entries: [HabitEntry]
    var hasCheckedInToday: Bool = false
    /// Set when launch-time repair consumed freeze passes, so the UI can tell
    /// the user their streak survived.
    var streakSavedMessage: String? = nil

    // The earn rule is a parameter: one pass per `passEarnInterval`-day streak,
    // holding at most `UserProfile.maxFreezePasses`.
    static let passEarnInterval = 7

    init(profile: UserProfile = UserProfile(), entries: [HabitEntry] = []) {
        // Origin loads both from UserDefaults here; swap in your storage.
        self.profile = profile
        self.entries = entries

        // Order matters: repair back-fills freeze entries for missed days
        // BEFORE the streak is recomputed, so the recomputation stays one
        // pure function over the entry set.
        repairStreakIfNeeded()
        refreshTodayStatus()
        refreshStreak()
        if streakSavedMessage != nil {
            persist()
        }
    }

    private func refreshTodayStatus() {
        let calendar = Calendar.current
        let todayEntry = entries.first { calendar.isDateInToday($0.date) && !$0.isFreeze }
        hasCheckedInToday = todayEntry != nil
    }

    func checkIn(moodScore: Int? = nil) {
        guard !hasCheckedInToday else { return }

        let entry = HabitEntry(date: Date(), moodScore: moodScore, xpEarned: 20)
        entries.append(entry)
        profile.totalCheckIns += 1
        profile.xp += 20
        hasCheckedInToday = true

        refreshStreak()
        awardStreakPassIfEarned()
        persist()
    }

    // MARK: - Streak + freeze passes

    /// If the user missed day(s) since their last covered day, consume freeze
    /// passes (one per missed day) to bridge the gap instead of resetting.
    /// Bridging is all-or-nothing: if there are not enough passes to cover
    /// every missed day, none are spent and the streak resets naturally.
    private func repairStreakIfNeeded() {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let coveredDays = Set(entries.map { calendar.startOfDay(for: $0.date) })

        guard let lastCovered = coveredDays.max(), lastCovered < today else { return }
        guard let dayAfterLast = calendar.date(byAdding: .day, value: 1, to: lastCovered) else { return }

        let missedDays = calendar.dateComponents([.day], from: lastCovered, to: today).day.map { $0 - 1 } ?? 0
        guard missedDays >= 1 else { return }
        guard profile.streak > 0 else { return }
        guard profile.freezePasses >= missedDays else { return }

        var frozen: [HabitEntry] = []
        var day = dayAfterLast
        for _ in 0..<missedDays {
            frozen.append(HabitEntry(date: day, xpEarned: 0, isFreeze: true))
            day = calendar.date(byAdding: .day, value: 1, to: day) ?? day
        }

        entries.append(contentsOf: frozen)
        profile.freezePasses -= missedDays
        streakSavedMessage = missedDays == 1
            ? "Freeze pass used. Your streak survived yesterday."
            : "\(missedDays) freeze passes used. Your streak survived."
        persist()
    }

    /// One pure function over the entry set. Freeze entries count as covered
    /// days, so no special-casing is needed here.
    private func currentStreakValue() -> Int {
        let calendar = Calendar.current
        let uniqueDates = Array(Set(entries.map { calendar.startOfDay(for: $0.date) })).sorted(by: >)
        guard !uniqueDates.isEmpty else { return 0 }

        let today = calendar.startOfDay(for: Date())
        let yesterday = calendar.date(byAdding: .day, value: -1, to: today)!
        guard uniqueDates[0] == today || uniqueDates[0] == yesterday else { return 0 }

        var streak = 0
        var checkDate = uniqueDates[0]
        for date in uniqueDates {
            if date == checkDate {
                streak += 1
                checkDate = calendar.date(byAdding: .day, value: -1, to: checkDate)!
            } else if date < checkDate {
                break
            }
        }
        return streak
    }

    private func refreshStreak() {
        let streak = currentStreakValue()
        profile.streak = streak
        if streak > profile.longestStreak {
            profile.longestStreak = streak
        }
    }

    private func awardStreakPassIfEarned() {
        guard profile.streak > 0, profile.streak % Self.passEarnInterval == 0 else { return }
        guard profile.freezePasses < UserProfile.maxFreezePasses else { return }
        profile.freezePasses += 1
        profile.totalPassesEarned += 1
    }

    // MARK: - Heatmap feed

    /// Day-keyed map of the last N days. A real check-in wins over a freeze
    /// placeholder on the same day.
    func entriesForLastNDays(_ n: Int) -> [Date: HabitEntry] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        guard let cutoff = calendar.date(byAdding: .day, value: -(n - 1), to: today) else { return [:] }
        var result: [Date: HabitEntry] = [:]
        for entry in entries {
            let day = calendar.startOfDay(for: entry.date)
            guard day >= cutoff else { continue }
            if let existing = result[day], !existing.isFreeze { continue }
            result[day] = entry
        }
        return result
    }

    /// GitHub-style 12-week grid, aligned to weeks ending on the current week.
    /// Cells run column-major (12 columns of 7 weekdays); trailing cells past
    /// today are flagged `isFuture` so the view can render them empty.
    func heatmapData() -> [HeatmapCell] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let todayWeekday = calendar.component(.weekday, from: today)
        let daysFromSunday = todayWeekday - 1

        guard let endOfWeek = calendar.date(byAdding: .day, value: 6 - daysFromSunday, to: today) else {
            return []
        }
        guard let startDate = calendar.date(byAdding: .day, value: -(12 * 7 - 1), to: endOfWeek) else {
            return []
        }

        let entryMap = entriesForLastNDays(12 * 7)
        var cells: [HeatmapCell] = []

        for i in 0..<(12 * 7) {
            guard let date = calendar.date(byAdding: .day, value: i, to: startDate) else { continue }
            let dayStart = calendar.startOfDay(for: date)
            let entry = entryMap[dayStart]
            let isFuture = dayStart > today
            cells.append(HeatmapCell(
                id: i,
                date: date,
                hasEntry: entry != nil,
                challengeCompleted: entry?.challengeCompleted ?? false,
                isFuture: isFuture
            ))
        }
        return cells
    }

    // MARK: - Persistence stub

    private func persist() {
        // Origin encodes profile + entries to UserDefaults and mirrors widget
        // state (see the ios-widget-state-mirror pattern). Swap in your storage.
    }
}
