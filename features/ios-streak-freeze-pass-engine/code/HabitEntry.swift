import Foundation

nonisolated struct HabitEntry: Codable, Identifiable, Sendable {
    let id: UUID
    let date: Date
    var challengeCompleted: Bool
    var moodScore: Int?
    var xpEarned: Int
    /// True for synthetic entries the repair pass back-fills when a freeze
    /// pass covers a missed day. Freeze entries count toward the streak but
    /// carry no XP and never count as "checked in today."
    var isFreeze: Bool

    init(id: UUID = UUID(), date: Date = Date(), challengeCompleted: Bool = false, moodScore: Int? = nil, xpEarned: Int = 20, isFreeze: Bool = false) {
        self.id = id
        self.date = date
        self.challengeCompleted = challengeCompleted
        self.moodScore = moodScore
        self.xpEarned = xpEarned
        self.isFreeze = isFreeze
    }

    // Custom decode so entries persisted before `isFreeze` existed still load.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        date = try container.decode(Date.self, forKey: .date)
        challengeCompleted = try container.decode(Bool.self, forKey: .challengeCompleted)
        moodScore = try container.decodeIfPresent(Int.self, forKey: .moodScore)
        xpEarned = try container.decode(Int.self, forKey: .xpEarned)
        isFreeze = try container.decodeIfPresent(Bool.self, forKey: .isFreeze) ?? false
    }
}
