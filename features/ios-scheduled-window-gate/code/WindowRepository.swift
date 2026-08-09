import Foundation

/// Upcoming scheduled window for the anchor region, as the server computes it.
/// ISO strings carry full offsets so the iOS clock just compares `Date`
/// instances; no client-side boundary math.
struct WindowDTO: Decodable, Equatable, Sendable {
    let regionSlug: String
    let locationLabel: String
    let startISO: String
    let startTimeLocal: String
    let startDateLocal: String
    let endISO: String
    let endTimeLocal: String
    let endDateLocal: String
}

/// Thin wrapper over `APIClient` for the window-schedule endpoint.
@MainActor
final class WindowRepository {
    static let shared = WindowRepository()

    /// Fetches the upcoming window for `regionSlug`.
    /// Throws on network / decode failure. The clock catches and downgrades
    /// to `.unknown` so gated affordances stay fail-open.
    func fetch(regionSlug: String) async throws -> WindowDTO {
        try await APIClient.shared.get(
            "/api/v1/window",
            query: ["regionSlug": regionSlug],
            as: WindowDTO.self,
        )
    }
}
