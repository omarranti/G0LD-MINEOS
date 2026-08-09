import CoreLocation
import Foundation

/// CoreLocation wrapper used by the content repositories to query the
/// backend with the user's real coordinates instead of the default-city
/// fallback.
///
/// Policy: WhenInUse only. We never ask for Always. The App Store
/// rejection rate on Always for non-driving apps is high and we don't
/// need background updates.
///
/// When permission is denied or not yet granted, repositories should
/// fall back to `LocationService.defaultAnchor` so first-launch users
/// still see meaningful data while the permission sheet sits in front
/// of them.
@MainActor
@Observable
final class LocationService: NSObject {
    static let shared = LocationService()

    /// Default anchor: the same default the backend uses when the caller
    /// omits coords. Pick the coordinate where your content is densest,
    /// which is usually also where your seed data sits.
    static let defaultAnchor = CLLocationCoordinate2D(
        latitude: 34.0567,
        longitude: -118.3841
    )

    private let manager = CLLocationManager()
    private var permissionContinuation: CheckedContinuation<CLAuthorizationStatus, Never>?

    private(set) var currentLocation: CLLocationCoordinate2D?
    private(set) var authorizationStatus: CLAuthorizationStatus = .notDetermined
    private(set) var lastFixDate: Date?

    /// Human-readable name of the current fix (neighborhood or city) for the
    /// home location chip when auto-tracking. nil until a reverse-geocode lands.
    private(set) var localityLabel: String?
    private let geocoder = CLGeocoder()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        authorizationStatus = manager.authorizationStatus
    }

    /// User-relevant center for backend queries. Returns the freshest fix
    /// if any, otherwise falls back to the default anchor.
    var currentOrDefault: CLLocationCoordinate2D {
        currentLocation ?? Self.defaultAnchor
    }

    /// Trigger permission flow and start updates. Idempotent, safe to
    /// call repeatedly. Returns the resulting authorization status.
    @discardableResult
    func requestAndStart() async -> CLAuthorizationStatus {
        switch authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
            return authorizationStatus
        case .denied, .restricted:
            return authorizationStatus
        case .notDetermined:
            return await withCheckedContinuation { cont in
                permissionContinuation = cont
                manager.requestWhenInUseAuthorization()
            }
        @unknown default:
            return authorizationStatus
        }
    }

    func stop() {
        manager.stopUpdatingLocation()
    }

    /// Reverse-geocode the current fix into a neighborhood/city label. Best
    /// effort: leaves `localityLabel` unchanged on failure (no blanking).
    func reverseGeocodeCurrent() async {
        guard let coord = currentLocation else { return }
        let loc = CLLocation(latitude: coord.latitude, longitude: coord.longitude)
        if let placemark = try? await geocoder.reverseGeocodeLocation(loc).first {
            localityLabel = placemark.subLocality ?? placemark.locality ?? placemark.administrativeArea
        }
    }
}

extension LocationService: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let newStatus = manager.authorizationStatus
        Task { @MainActor in
            self.authorizationStatus = newStatus
            switch newStatus {
            case .authorizedWhenInUse, .authorizedAlways:
                manager.startUpdatingLocation()
            default:
                break
            }
            if let cont = self.permissionContinuation {
                self.permissionContinuation = nil
                cont.resume(returning: newStatus)
            }
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        guard let coord = locations.last?.coordinate else { return }
        Task { @MainActor in
            self.currentLocation = coord
            self.lastFixDate = Date()
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didFailWithError error: Error
    ) {
        // Silent: caller falls through to defaultAnchor. Most common
        // failure here is the simulator with no Location set in the
        // scheme, which isn't user-facing.
    }
}
