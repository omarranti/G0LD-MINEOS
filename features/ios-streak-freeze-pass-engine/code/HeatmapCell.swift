import Foundation

nonisolated struct HeatmapCell: Identifiable, Sendable {
    let id: Int
    let date: Date
    let hasEntry: Bool
    let challengeCompleted: Bool
    let isFuture: Bool
}
