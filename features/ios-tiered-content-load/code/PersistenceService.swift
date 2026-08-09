import Foundation

nonisolated final class PersistenceService: Sendable {
    static let shared = PersistenceService()

    private let defaults = UserDefaults.standard

    private enum Keys {
        static let savedEventIDs = "app_savedEventIDs"
        static let savedHotspotIDs = "app_savedHotspotIDs"
        static let savedVendorIDs = "app_savedVendorIDs"
        static let likedInsightIDs = "app_likedInsightIDs"
        static let likedDailyIDs = "app_likedDailyIDs"
        static let rsvpdEventIDs = "app_rsvpdEventIDs"
        static let selectedPreferences = "app_selectedPreferences"
        static let userProfile = "app_userProfile"
        static let hasCompletedOnboarding = "app_hasCompletedOnboarding"
        static let isGuestSession = "app_isGuestSession"
        static let selectedMood = "app_selectedMood"
        static let preferredCitySlug = "app_preferredCitySlug"
        static let cachedEvents = "app_cachedEvents"
        static let cachedHotspots = "app_cachedHotspots"
        static let cachedVendors = "app_cachedVendors"
        static let cachedDailyCards = "app_cachedDailyCards"
        static let cachedHolidays = "app_cachedHolidays"
        static let cachedInsights = "app_cachedInsights"
        static let cachedListings = "app_cachedListings"
    }

    func saveIDSet(_ ids: Set<UUID>, forKey key: String) {
        let strings = ids.map { $0.uuidString }
        defaults.set(strings, forKey: key)
    }

    func loadIDSet(forKey key: String) -> Set<UUID> {
        guard let strings = defaults.stringArray(forKey: key) else { return [] }
        return Set(strings.compactMap { UUID(uuidString: $0) })
    }

    func saveSavedEventIDs(_ ids: Set<UUID>) { saveIDSet(ids, forKey: Keys.savedEventIDs) }
    func loadSavedEventIDs() -> Set<UUID> { loadIDSet(forKey: Keys.savedEventIDs) }

    func saveSavedHotspotIDs(_ ids: Set<UUID>) { saveIDSet(ids, forKey: Keys.savedHotspotIDs) }
    func loadSavedHotspotIDs() -> Set<UUID> { loadIDSet(forKey: Keys.savedHotspotIDs) }

    func saveSavedVendorIDs(_ ids: Set<UUID>) { saveIDSet(ids, forKey: Keys.savedVendorIDs) }
    func loadSavedVendorIDs() -> Set<UUID> { loadIDSet(forKey: Keys.savedVendorIDs) }

    func saveLikedInsightIDs(_ ids: Set<UUID>) { saveIDSet(ids, forKey: Keys.likedInsightIDs) }
    func loadLikedInsightIDs() -> Set<UUID> { loadIDSet(forKey: Keys.likedInsightIDs) }

    func saveLikedDailyIDs(_ ids: Set<UUID>) { saveIDSet(ids, forKey: Keys.likedDailyIDs) }
    func loadLikedDailyIDs() -> Set<UUID> { loadIDSet(forKey: Keys.likedDailyIDs) }

    func saveRsvpdEventIDs(_ ids: Set<UUID>) { saveIDSet(ids, forKey: Keys.rsvpdEventIDs) }
    func loadRsvpdEventIDs() -> Set<UUID> { loadIDSet(forKey: Keys.rsvpdEventIDs) }

    func savePreferences(_ prefs: Set<String>) {
        defaults.set(Array(prefs), forKey: Keys.selectedPreferences)
    }

    func loadPreferences() -> Set<String>? {
        guard let arr = defaults.stringArray(forKey: Keys.selectedPreferences) else { return nil }
        return Set(arr)
    }

    func saveUserProfile(_ profile: UserProfile) {
        if let data = try? JSONEncoder().encode(profile) {
            defaults.set(data, forKey: Keys.userProfile)
        }
    }

    func loadUserProfile() -> UserProfile? {
        guard let data = defaults.data(forKey: Keys.userProfile) else { return nil }
        return try? JSONDecoder().decode(UserProfile.self, from: data)
    }

    func saveOnboardingComplete(_ value: Bool) {
        defaults.set(value, forKey: Keys.hasCompletedOnboarding)
    }

    func loadOnboardingComplete() -> Bool {
        defaults.bool(forKey: Keys.hasCompletedOnboarding)
    }

    func saveIsGuestSession(_ value: Bool) {
        defaults.set(value, forKey: Keys.isGuestSession)
    }

    func loadIsGuestSession() -> Bool {
        defaults.bool(forKey: Keys.isGuestSession)
    }

    /// Pinned city (manual location override). nil clears the pin, resuming auto-track.
    func savePreferredCitySlug(_ slug: String?) {
        if let slug {
            defaults.set(slug, forKey: Keys.preferredCitySlug)
        } else {
            defaults.removeObject(forKey: Keys.preferredCitySlug)
        }
    }

    func loadPreferredCitySlug() -> String? {
        defaults.string(forKey: Keys.preferredCitySlug)
    }

    /// Wipes all per-user state so the next launch lands in onboarding as a fresh account.
    /// Leaves cached content (events, hotspots, vendors, etc.) so the app still has data to show.
    func clearAllUserData() {
        let userKeys = [
            Keys.savedEventIDs,
            Keys.savedHotspotIDs,
            Keys.savedVendorIDs,
            Keys.likedInsightIDs,
            Keys.likedDailyIDs,
            Keys.rsvpdEventIDs,
            Keys.selectedPreferences,
            Keys.userProfile,
            Keys.hasCompletedOnboarding,
            Keys.isGuestSession,
            Keys.selectedMood,
            Keys.preferredCitySlug
        ]
        for key in userKeys {
            defaults.removeObject(forKey: key)
        }
    }

    // MARK: - Content cache (tier 2). Wire DTOs are cached, not domain models,
    // so the cache round-trips through the exact same mapping as a live fetch.

    func cacheEvents(_ data: [APIEventResponse]) {
        saveJSON(data, forKey: Keys.cachedEvents)
    }

    func loadCachedEvents() -> [APIEventResponse]? {
        loadJSON(forKey: Keys.cachedEvents)
    }

    func cacheHotspots(_ data: [APIHotspotResponse]) {
        saveJSON(data, forKey: Keys.cachedHotspots)
    }

    func loadCachedHotspots() -> [APIHotspotResponse]? {
        loadJSON(forKey: Keys.cachedHotspots)
    }

    func cacheVendors(_ data: [APIVendorResponse]) {
        saveJSON(data, forKey: Keys.cachedVendors)
    }

    func loadCachedVendors() -> [APIVendorResponse]? {
        loadJSON(forKey: Keys.cachedVendors)
    }

    func cacheDailyCards(_ data: [APIDailyCardResponse]) {
        saveJSON(data, forKey: Keys.cachedDailyCards)
    }

    func loadCachedDailyCards() -> [APIDailyCardResponse]? {
        loadJSON(forKey: Keys.cachedDailyCards)
    }

    func cacheHolidays(_ data: [APIHolidayResponse]) {
        saveJSON(data, forKey: Keys.cachedHolidays)
    }

    func loadCachedHolidays() -> [APIHolidayResponse]? {
        loadJSON(forKey: Keys.cachedHolidays)
    }

    func cacheInsights(_ data: [APIInsightResponse]) {
        saveJSON(data, forKey: Keys.cachedInsights)
    }

    func loadCachedInsights() -> [APIInsightResponse]? {
        loadJSON(forKey: Keys.cachedInsights)
    }

    func cacheListings(_ data: [APIListingResponse]) {
        saveJSON(data, forKey: Keys.cachedListings)
    }

    func loadCachedListings() -> [APIListingResponse]? {
        loadJSON(forKey: Keys.cachedListings)
    }

    private func saveJSON<T: Encodable>(_ value: T, forKey key: String) {
        if let data = try? JSONEncoder().encode(value) {
            defaults.set(data, forKey: key)
        }
    }

    private func loadJSON<T: Decodable>(forKey key: String) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}
