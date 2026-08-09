import SwiftUI
import CoreLocation

nonisolated final class DataService: Sendable {
    static let shared = DataService()

    private let network = NetworkService.shared
    private let cache = PersistenceService.shared

    // Location-scoped sources (events, hotspots, vendors) are served live by
    // dedicated repositories (EventsRepository / HotspotsRepository /
    // VendorsRepository) against the mobile API. The methods below cover the
    // remaining sources. Historical note from the origin: an earlier set of
    // fetch methods pointed at a retired endpoint that 404'd in production,
    // so they *always* fell back to bundled data and nobody noticed for
    // weeks; the tiered fallback is exactly good enough to hide a dead
    // endpoint. Delete dead fetchers, don't keep them around.

    func fetchDailyCards() async throws -> [DailyCard] {
        let remote = try await network.fetch("dailyCards", as: [APIDailyCardResponse].self)
        cache.cacheDailyCards(remote)
        return remote.map { $0.toDailyCard() }
    }

    func fetchHolidays() async throws -> [Holiday] {
        let remote = try await network.fetch("holidays", as: [APIHolidayResponse].self)
        cache.cacheHolidays(remote)
        return remote.map { $0.toHoliday() }
    }

    func fetchInsights() async throws -> [InsightPost] {
        let remote = try await network.fetch("insights", as: [APIInsightResponse].self)
        cache.cacheInsights(remote)
        return remote.map { $0.toInsightPost() }
    }

    func fetchListings() async throws -> [Listing] {
        // Cursor-paginated. The 40-page cap (2,000 listings) is a runaway
        // guard, not an expected limit.
        var all: [APIListingResponse] = []
        var cursor: String? = nil
        for _ in 0..<40 {
            let path = cursor.map { "listings?limit=50&cursor=\($0)" } ?? "listings?limit=50"
            let page = try await network.fetchV1(path, as: ListingsPageWire.self)
            all.append(contentsOf: page.items.map { $0.toCached() })
            guard let next = page.nextCursor, !next.isEmpty else { break }
            cursor = next
        }
        cache.cacheListings(all)
        return all.map { $0.toListing() }
    }
}

// MARK: - Wire DTO -> domain model mapping
//
// The origin carries one extension per DTO (APIEventResponse.toEvent(),
// APIHotspotResponse.toHotspot(), APIVendorResponse.toVendor(), ...). Each is
// a mechanical field copy; they are trimmed here to one representative
// example. The load-bearing detail is `stableUUID(from:)`: server rows carry
// string ids, domain models use UUID, and the mapping must be deterministic
// so a re-fetch (or a cache round-trip) produces the SAME UUIDs, otherwise
// saved/liked ID sets silently stop matching. See ios-deterministic-uuid-from-id.

extension APIDailyCardResponse {
    func toDailyCard() -> DailyCard {
        let seg: DailySegment = category == "For you" ? .you : .people
        let tex: CardTexture = switch texture {
        case "cream": .cream
        case "woven": .woven
        default: .parchment
        }

        return DailyCard(
            id: stableUUID(from: id),
            title: title,
            subtitle: subtitle,
            body: body,
            quoteText: quoteText,
            category: seg,
            likes: likes,
            socialCount: socialCount,
            texture: tex,
            icon: icon
        )
    }
}
