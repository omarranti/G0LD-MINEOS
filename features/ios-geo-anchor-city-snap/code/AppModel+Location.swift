import SwiftUI
import CoreLocation

/// Trimmed excerpt of the app's root @Observable model: the pin-vs-track
/// location policy slice. The origin file also owns auth, navigation, and
/// content state; all of that is cut here. Merge this slice into your own
/// root model.
@Observable
@MainActor
final class AppModel {
    private let persistence = PersistenceService.shared

    // MARK: - Location (home chip: auto-track or manual pin)

    /// Manually pinned city. Persisted; when set it overrides GPS until the user
    /// taps "Use my current location." nil = auto-track.
    var preferredCity: SupportedCity? = nil
    /// Reverse-geocoded label for the current GPS fix (auto-track display).
    private(set) var trackedLabel: String? = nil

    /// City whose content is active: the manual pin, else the nearest
    /// supported market to the current fix.
    var activeCity: SupportedCity {
        preferredCity ?? SupportedCity.nearest(to: LocationService.shared.currentOrDefault)
    }
    /// Coordinate the content repositories should query. Note the asymmetry
    /// with `activeCity`: a pin queries the pinned city's anchor, but
    /// auto-track queries the RAW fix (not the snapped city), so radius
    /// results are centered on the user, while city-keyed systems snap.
    var activeCenter: CLLocationCoordinate2D {
        preferredCity?.coordinate ?? LocationService.shared.currentOrDefault
    }
    /// Text for the home location chip: the pin's label, else the tracked
    /// locality, else the nearest market.
    var locationChipLabel: String {
        if let preferredCity { return preferredCity.label }
        return trackedLabel ?? SupportedCity.nearest(to: LocationService.shared.currentOrDefault).label
    }

    init() {
        // Rehydrate the pin by slug; unknown slugs (removed cities) resolve
        // to nil, which safely resumes auto-track.
        preferredCity = persistence.loadPreferredCitySlug().flatMap(SupportedCity.bySlug)
    }

    /// Call once from the root view's task. Kicks the permission flow, labels
    /// the fix if auto-tracking, then loads content for `activeCenter`. The
    /// content load does not wait for the user to answer the permission sheet
    /// in the denied path; `currentOrDefault` covers every outcome.
    func startLocationAndLoad() {
        Task {
            await LocationService.shared.requestAndStart()
            if preferredCity == nil {
                await LocationService.shared.reverseGeocodeCurrent()
                trackedLabel = LocationService.shared.localityLabel
            }
            await loadAllContent()
        }
    }

    /// Pin a city (manual override). Persists and refetches content for the
    /// new center. Manual pin wins until cleared.
    func selectCity(_ city: SupportedCity) {
        guard city.slug != preferredCity?.slug else { return }
        preferredCity = city
        persistence.savePreferredCitySlug(city.slug)
        Task {
            // Re-anchor any per-city side systems here (keyed by city.slug).
            await loadAllContent()
        }
    }

    /// Drop the manual pin and resume auto-tracking from the GPS fix.
    func useCurrentLocation() {
        preferredCity = nil
        persistence.savePreferredCitySlug(nil)
        Task {
            await LocationService.shared.requestAndStart()
            await LocationService.shared.reverseGeocodeCurrent()
            trackedLabel = LocationService.shared.localityLabel
            // Re-anchor per-city side systems to
            // SupportedCity.nearest(to: LocationService.shared.currentOrDefault).slug
            await loadAllContent()
        }
    }

    private func loadAllContent() async {
        // Refetch every content source for `activeCenter`. See the
        // ios-tiered-content-load pattern; the two are designed to compose.
        // Critical interaction: a successful-but-empty fetch after a repin
        // must CLEAR the previous city's rows, not keep them.
    }
}

// PersistenceService slice this excerpt depends on (UserDefaults-backed):
//
//     /// Pinned city (manual location override). nil clears the pin.
//     func savePreferredCitySlug(_ slug: String?) {
//         if let slug {
//             defaults.set(slug, forKey: "app_preferredCitySlug")
//         } else {
//             defaults.removeObject(forKey: "app_preferredCitySlug")
//         }
//     }
//
//     func loadPreferredCitySlug() -> String? {
//         defaults.string(forKey: "app_preferredCitySlug")
//     }
