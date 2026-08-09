import Foundation

nonisolated struct Milestone: Identifiable, Sendable {
    let id: String
    let title: String
    let requirement: Int
    let emoji: String

    var isUnlocked: Bool = false

    // Requirement ladder from the origin app; titles are skin, rewrite them
    // in the destination product's voice.
    static let all: [Milestone] = [
        Milestone(id: "starter", title: "First Steps", requirement: 3, emoji: "🌱"),
        Milestone(id: "week", title: "One Week", requirement: 7, emoji: "☀️"),
        Milestone(id: "fortnight", title: "Two Weeks", requirement: 14, emoji: "🚶"),
        Milestone(id: "month", title: "One Month", requirement: 30, emoji: "🌲"),
        Milestone(id: "two_months", title: "Two Months", requirement: 60, emoji: "🧙"),
        Milestone(id: "century", title: "Century", requirement: 100, emoji: "👑"),
        Milestone(id: "double_century", title: "Double Century", requirement: 200, emoji: "⚡"),
        Milestone(id: "year", title: "Full Year", requirement: 365, emoji: "🌍"),
    ]
}
