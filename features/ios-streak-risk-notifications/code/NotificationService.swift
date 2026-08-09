import Foundation
import UserNotifications

@MainActor
class NotificationService {
    static let shared = NotificationService()

    // Randomized copy pools so the reminders do not read like a cron job.
    // Rewrite both pools in the destination product's voice.
    private let reminderMessages = [
        "Your daily check-in is waiting.",
        "Two minutes now beats zero minutes later.",
        "Today's box is still empty.",
        "Small rep today, big streak tomorrow.",
        "The day is not over yet.",
    ]

    private let streakRiskMessages = [
        "You haven't checked in today. There's still time.",
        "Your streak is on the line. A small step counts.",
        "Quick, the day hasn't clocked out yet.",
        "One check-in keeps the streak alive. 🔥",
    ]

    func requestPermission() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
        } catch {
            return false
        }
    }

    /// A plain repeating daily reminder at a user-chosen time. Unconditional:
    /// it fires whether or not the user already checked in. The conditional
    /// evening window below is the interesting part.
    func scheduleDailyReminder(at time: Date, enabled: Bool) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["daily_reminder"])

        guard enabled else { return }

        let calendar = Calendar.current
        let components = calendar.dateComponents([.hour, .minute], from: time)

        let content = UNMutableNotificationContent()
        content.title = "Daily check-in"
        content.body = reminderMessages.randomElement() ?? "Time to check in!"
        content.sound = .default

        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
        let request = UNNotificationRequest(identifier: "daily_reminder", content: content, trigger: trigger)

        UNUserNotificationCenter.current().add(request)
    }

    /// Schedules one-shot 8pm streak-risk alerts for the next 7 evenings,
    /// skipping tonight if the user already checked in today. Re-called on
    /// every check-in and app launch so alerts never fire on a completed day.
    func refreshStreakRiskAlerts(enabled: Bool, checkedInToday: Bool) {
        let center = UNUserNotificationCenter.current()
        // Deterministic IDs make the whole window removable in one call.
        // The bare "streak_risk" id is a legacy identifier from an earlier
        // single-alert version; keep stale-id cleanup in mind when migrating.
        let identifiers = (0..<7).map { "streak_risk_\($0)" }
        center.removePendingNotificationRequests(withIdentifiers: identifiers + ["streak_risk"])

        guard enabled else { return }

        let calendar = Calendar.current
        let now = Date()

        for dayOffset in 0..<7 {
            // Tonight's alert is the conditional one: skip it if today is done.
            if dayOffset == 0 && checkedInToday { continue }

            guard let day = calendar.date(byAdding: .day, value: dayOffset, to: now) else { continue }
            var components = calendar.dateComponents([.year, .month, .day], from: day)
            components.hour = 20
            components.minute = 0
            guard let fireDate = calendar.date(from: components), fireDate > now else { continue }

            let content = UNMutableNotificationContent()
            content.title = "Don't lose your streak 🔥"
            content.body = streakRiskMessages.randomElement() ?? "You haven't checked in today. There's still time!"
            content.sound = .default

            let trigger = UNCalendarNotificationTrigger(
                dateMatching: calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fireDate),
                repeats: false
            )
            let request = UNNotificationRequest(identifier: "streak_risk_\(dayOffset)", content: content, trigger: trigger)
            center.add(request)
        }
    }
}
