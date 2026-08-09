import CoreLocation

/// A curated market the user can browse. The `slug` is the stable key shared
/// with the backend and with persistence (the pin stores the slug, not the
/// struct), so labels and coordinates can change without invalidating pins.
/// If selecting a city re-anchors any per-city side system (a local clock,
/// a feed), that system should key off the same slug and fail closed for
/// slugs it doesn't know yet.
nonisolated struct SupportedCity: Identifiable, Hashable, Sendable {
    let slug: String
    let label: String
    let latitude: Double
    let longitude: Double

    var id: String { slug }
    var coordinate: CLLocationCoordinate2D { .init(latitude: latitude, longitude: longitude) }
}

extension SupportedCity {
    /// Curated list. Coordinates are each market's anchor (content center +
    /// nearest-snap target), not the municipal centroid: pick the block where
    /// your inventory clusters. Replace with your own markets; order matters
    /// only for the picker UI, `fallback` is by convention the first entry.
    static let all: [SupportedCity] = [
        .init(slug: "los-angeles", label: "Los Angeles", latitude: 34.0567, longitude: -118.3841),
        .init(slug: "new-york", label: "New York", latitude: 40.6782, longitude: -73.9442),
        .init(slug: "miami", label: "Miami", latitude: 25.7907, longitude: -80.1300),
        .init(slug: "chicago", label: "Chicago", latitude: 41.8781, longitude: -87.6298),
        .init(slug: "toronto", label: "Toronto", latitude: 43.6532, longitude: -79.3832),
    ]

    /// Matches the app's default anchor (LocationService.defaultAnchor).
    static let fallback = all[0]

    static func bySlug(_ slug: String) -> SupportedCity? {
        all.first { $0.slug == slug }
    }

    /// Closest supported market to a coordinate (great-circle distance). Used to
    /// snap an auto-tracked GPS fix onto a city the app actually serves.
    static func nearest(to coord: CLLocationCoordinate2D) -> SupportedCity {
        let target = CLLocation(latitude: coord.latitude, longitude: coord.longitude)
        return all.min {
            CLLocation(latitude: $0.latitude, longitude: $0.longitude).distance(from: target)
                < CLLocation(latitude: $1.latitude, longitude: $1.longitude).distance(from: target)
        } ?? .fallback
    }
}
