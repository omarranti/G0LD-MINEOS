import SwiftUI
import CoreLocation

/// Trimmed excerpt of the app's root @Observable model, focused on the
/// tiered content-load flow. The origin file also owns auth, navigation,
/// filters, and profile state; all of that is cut here. Merge this slice
/// into your own root model rather than shipping it as a second model.
@Observable
@MainActor
final class AppModel {

    var isLoadingContent: Bool = true
    var contentLoadError: Bool = false
    var isRefreshing: Bool = false

    // One renderable collection per content source. The first three are
    // location-scoped (fetched around a center coordinate); the rest are
    // location-independent editorial content.
    var events: [Event] = []
    var hotspots: [Hotspot] = []
    var vendors: [Vendor] = []
    var holidays: [Holiday] = []
    var insights: [InsightPost] = []
    var dailyCards: [DailyCard] = []
    var listings: [Listing] = []

    /// Coordinate the content repositories should query: the user's manual
    /// city pin if set, else the freshest GPS fix, else the default anchor.
    /// See the ios-geo-anchor-city-snap pattern for the full policy.
    var activeCenter: CLLocationCoordinate2D {
        LocationService.shared.currentOrDefault
    }

    private var hasStartedNetworkLoad: Bool = false

    func startNetworkLoadIfNeeded() {
        guard !hasStartedNetworkLoad else { return }
        hasStartedNetworkLoad = true
        Task {
            // Kick off the CoreLocation permission flow first. The first
            // loadAllContent runs immediately with the default-city fallback
            // so onboarded users see something. Once a real fix arrives, a
            // background refresh re-pulls with real coordinates.
            await LocationService.shared.requestAndStart()
            await loadAllContent()
        }
    }

    private func loadAllContent() async {
        let service = DataService.shared
        isLoadingContent = true
        contentLoadError = false

        // Manual pin if set, else real GPS, else the default anchor.
        // The backend treats them equivalently, same radius helper.
        let center = activeCenter

        // Each source is fetched independently. An outage in the primary
        // API shouldn't wipe the sources another host can still serve, and
        // a bundled fallback for an outage in ONE source shouldn't block
        // the others from updating.
        //
        // We distinguish *fetch errored* from *fetch returned empty*.
        // Empty is valid (e.g. no listings geocoded yet, no upcoming
        // events in your radius) and must NOT trigger the "No Connection"
        // error screen.
        async let liveEvents = fetchOrNil { try await EventsRepository.shared.fetchNearby(center: center) }
        async let liveHotspots = fetchOrNil {
            try await HotspotsRepository.shared.fetchNearby(center: center, radiusMiles: 10)
        }
        async let liveVendors = fetchOrNil {
            try await VendorsRepository.shared.fetchNearby(center: center, radiusMiles: 25)
        }
        async let liveHolidays = fetchOrNil { try await HolidaysRepository.shared.fetchUpcoming() }
        async let liveInsights = fetchOrNil { try await DailyRepository.shared.fetchInsights() }
        async let liveDaily = fetchOrNil { try await service.fetchDailyCards() }
        async let liveListings = fetchOrNil { try await service.fetchListings() }

        let (e, h, v, hol, ins, d, lst) = await (
            liveEvents, liveHotspots, liveVendors, liveHolidays, liveInsights,
            liveDaily, liveListings
        )

        // A successful fetch is authoritative for its source, even when it
        // returns []. Assigning the empty array clears the previous city's
        // rows when you move or repin to a location that legitimately has no
        // events / restaurants / vendors. Only a *nil* (errored) result
        // preserves what's on screen. The `!isEmpty` guard used to leave the
        // old city's data visible after a location change, which reads as the
        // app being out of sync with the web directory.
        if let e { events = e }
        if let h { hotspots = h }
        if let v { vendors = v }
        if let hol, !hol.isEmpty { holidays = hol }
        if let ins, !ins.isEmpty { insights = ins }
        if let d, !d.isEmpty { dailyCards = d }
        if let lst, !lst.isEmpty { listings = lst }

        // Fall through to cache + bundled ONLY when nothing landed;
        // otherwise loadFromCache() would overwrite freshly-fetched live
        // data with stale disk cache (it doesn't selectively fill, it
        // replaces).
        if events.isEmpty && hotspots.isEmpty && vendors.isEmpty
            && holidays.isEmpty && insights.isEmpty && dailyCards.isEmpty
            && listings.isEmpty {
            loadFromCache()
        }

        // "No Connection" should ONLY fire when every source threw and we
        // couldn't even fall back to anything renderable. An empty result
        // from a successful call is real data.
        let allErrored = e == nil && h == nil && v == nil && hol == nil
            && ins == nil && d == nil && lst == nil
        let nothingRenderable = events.isEmpty && hotspots.isEmpty
            && holidays.isEmpty && insights.isEmpty && dailyCards.isEmpty
            && listings.isEmpty
        contentLoadError = allErrored && nothingRenderable
        isLoadingContent = false
    }

    private nonisolated func fetchOrNil<T>(_ op: @Sendable () async throws -> T) async -> T? {
        do { return try await op() } catch { return nil }
    }

    private func loadFromCache() {
        let cache = PersistenceService.shared
        let bundled = BundledDataService.shared

        // Tier 2: disk cache (the last successful payload per source).
        if let cached = cache.loadCachedEvents() {
            events = cached.map { $0.toEvent() }
        }
        if let cached = cache.loadCachedHotspots() {
            hotspots = cached.map { $0.toHotspot() }
        }
        if let cached = cache.loadCachedVendors() {
            vendors = cached.map { $0.toVendor() }
        }
        if let cached = cache.loadCachedDailyCards() {
            dailyCards = cached.map { $0.toDailyCard() }
        }
        if let cached = cache.loadCachedHolidays() {
            holidays = cached.map { $0.toHoliday() }
        }
        if let cached = cache.loadCachedInsights() {
            insights = cached.map { $0.toInsightPost() }
        }
        if let cached = cache.loadCachedListings() {
            listings = cached.map { $0.toListing() }
        }

        // Tier 3: bundled seed, per source, only where the cache had nothing.
        if events.isEmpty { events = bundled.loadEvents().map { $0.toEvent() } }
        if hotspots.isEmpty { hotspots = bundled.loadHotspots().map { $0.toHotspot() } }
        if vendors.isEmpty { vendors = bundled.loadVendors().map { $0.toVendor() } }
        if dailyCards.isEmpty { dailyCards = bundled.loadDailyCards().map { $0.toDailyCard() } }
        if holidays.isEmpty { holidays = bundled.loadHolidays().map { $0.toHoliday() } }
        if insights.isEmpty { insights = bundled.loadInsights().map { $0.toInsightPost() } }
        if listings.isEmpty { listings = bundled.loadListings().map { $0.toListing() } }
    }

    func refreshContent() async {
        isRefreshing = true
        await loadAllContent()
        isRefreshing = false
    }
}
