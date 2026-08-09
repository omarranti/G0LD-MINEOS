import Foundation

nonisolated struct UserProfile: Codable, Sendable {
    var displayName: String
    var avatarEmoji: String
    var streak: Int
    var longestStreak: Int
    var totalCheckIns: Int
    var xp: Int
    var badges: [String]
    var dailyReminderEnabled: Bool
    var dailyReminderTime: Date
    var streakAlertsEnabled: Bool
    var freezePasses: Int
    var totalPassesEarned: Int

    /// Cap on banked passes. Part of the earn rule, tune per product.
    static let maxFreezePasses = 3

    var level: Int {
        xp / 200 + 1
    }

    var xpInCurrentLevel: Int {
        xp % 200
    }

    var xpForNextLevel: Int {
        200
    }

    init(
        displayName: String = "You",
        avatarEmoji: String = "🙂",
        streak: Int = 0,
        longestStreak: Int = 0,
        totalCheckIns: Int = 0,
        xp: Int = 0,
        badges: [String] = [],
        dailyReminderEnabled: Bool = true,
        dailyReminderTime: Date = Calendar.current.date(from: DateComponents(hour: 10, minute: 0)) ?? Date(),
        streakAlertsEnabled: Bool = true,
        freezePasses: Int = 1,
        totalPassesEarned: Int = 1
    ) {
        self.displayName = displayName
        self.avatarEmoji = avatarEmoji
        self.streak = streak
        self.longestStreak = longestStreak
        self.totalCheckIns = totalCheckIns
        self.xp = xp
        self.badges = badges
        self.dailyReminderEnabled = dailyReminderEnabled
        self.dailyReminderTime = dailyReminderTime
        self.streakAlertsEnabled = streakAlertsEnabled
        self.freezePasses = freezePasses
        self.totalPassesEarned = totalPassesEarned
    }

    // Custom decode so profiles persisted before the pass fields existed
    // still load (users who predate the feature start with 1 banked pass).
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        displayName = try container.decode(String.self, forKey: .displayName)
        avatarEmoji = try container.decode(String.self, forKey: .avatarEmoji)
        streak = try container.decode(Int.self, forKey: .streak)
        longestStreak = try container.decode(Int.self, forKey: .longestStreak)
        totalCheckIns = try container.decode(Int.self, forKey: .totalCheckIns)
        xp = try container.decode(Int.self, forKey: .xp)
        badges = try container.decode([String].self, forKey: .badges)
        dailyReminderEnabled = try container.decode(Bool.self, forKey: .dailyReminderEnabled)
        dailyReminderTime = try container.decode(Date.self, forKey: .dailyReminderTime)
        streakAlertsEnabled = try container.decode(Bool.self, forKey: .streakAlertsEnabled)
        freezePasses = try container.decodeIfPresent(Int.self, forKey: .freezePasses) ?? 1
        totalPassesEarned = try container.decodeIfPresent(Int.self, forKey: .totalPassesEarned) ?? 1
    }
}
