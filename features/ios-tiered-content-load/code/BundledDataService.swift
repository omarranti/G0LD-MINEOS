import Foundation

/// Tier 3: last-resort seed content compiled into the binary. Reached only
/// when both the network AND the disk cache came up empty for a source
/// (a true first launch while offline, or a wiped install in airplane mode).
///
/// The origin ships ~40 real, hand-curated rows here (real venues, events,
/// editorial cards around the default anchor city) so a cold offline launch
/// renders every surface with believable content. The rows below are neutral
/// placeholders showing the shape; replace them with a small curated slice
/// of YOUR real content, anchored around your default city.
nonisolated final class BundledDataService: Sendable {
    static let shared = BundledDataService()

    func loadEvents() -> [APIEventResponse] {
        [
            APIEventResponse(
                id: "e1",
                title: "Neighborhood Community Dinner",
                imageURL: Self.image("photo-1547592180-85f173990554"),
                day: "Friday", time: "7:30 pm", distance: "0.8 miles", attendees: 8,
                location: "Sample Neighborhood, Default City",
                host: "Sample Host",
                description: "A warm neighborhood dinner with a welcoming mix of families and friends.",
                detailNotes: "Street parking is easiest one block over.",
                dressCode: "Casual",
                dietaryNotes: "All diets accommodated",
                bringNotes: "A side dish is welcome",
                galleryURLs: Self.gallery(["photo-1547592180-85f173990554"]),
                latitude: 34.0561, longitude: -118.3587
            ),
        ]
    }

    func loadHotspots() -> [APIHotspotResponse] {
        [
            APIHotspotResponse(
                id: "h1",
                title: "Sample Restaurant",
                imageURL: Self.image("photo-1554118811-1e0d58224f24"),
                address: "123 Main St, Default City",
                rating: 4.8, isOpen: true, isNew: false,
                category: "Restaurants", certification: "Certified",
                hours: "10 AM - 10 PM", phone: "(555) 555-0100",
                latitude: 34.0761, longitude: -118.3587,
                notes: "A friendly neighborhood staple.",
                priceLevel: "$$", distanceMiles: 0.5, tag: "Food",
                galleryURLs: Self.gallery(["photo-1554118811-1e0d58224f24"]),
                reviews: [
                    APIReviewResponse(id: "r1", authorName: "Sample R.", authorInitial: "S", rating: 5.0, text: "Warm and welcoming. Felt like home.", date: "2 weeks ago")
                ],
                website: "https://example.com"
            ),
        ]
    }

    func loadVendors() -> [APIVendorResponse] {
        [
            APIVendorResponse(
                id: "v1",
                name: "Sample Catering Co.",
                imageURL: Self.image("photo-1555244162-803834f70033"),
                rating: 4.9, serviceLine: "Catering & Chef Services", distance: "2.3 mi",
                packageLabel: "Starts at $850", category: "Dinners",
                sectionTitle: "Level up your table",
                services: ["Full menu", "Custom dietary plans"],
                packages: ["Starter", "Premium", "Grand"],
                reviews: ["Incredible quality and presentation!"],
                galleryURLs: Self.gallery(["photo-1555244162-803834f70033"]),
                userReviews: [
                    APIReviewResponse(id: "vr1", authorName: "Sample M.", authorInitial: "M", rating: 5.0, text: "Made our dinner feel like a celebration.", date: "1 week ago")
                ],
                phone: "(555) 555-0101", website: "https://example.com"
            ),
        ]
    }

    func loadDailyCards() -> [APIDailyCardResponse] {
        [
            APIDailyCardResponse(
                id: "d1",
                title: "Host a Dinner",
                subtitle: "Host a Dinner",
                body: "Set one extra place at the table this week. You never know who needs the invitation most.",
                quoteText: "\"Set one extra place at the table this week.\"",
                category: "For your people", likes: 75, socialCount: 6,
                texture: "parchment", icon: "cup.and.saucer.fill"
            ),
        ]
    }

    func loadHolidays() -> [APIHolidayResponse] {
        [
            APIHolidayResponse(
                id: "hol1",
                title: "Sample Holiday",
                imageURL: Self.image("photo-1466637574441-749b8f19452f"),
                dates: "June 11-13",
                explanation: "A holiday of learning and gathering with fresh energy.",
                relatedEvents: ["Community gathering downtown", "Neighborhood bake-off"],
                isMoonIcon: false
            ),
        ]
    }

    func loadInsights() -> [APIInsightResponse] {
        [
            APIInsightResponse(
                id: "i1",
                title: "Today's Insight",
                imageURL: Self.image("photo-1547592180-85f173990554"),
                preview: "There is a special kind of generosity in making room at the table before anyone asks.",
                body: "Today's nudge is simple: set one extra place in your heart and see who it welcomes.",
                likes: 24, avatars: ["A", "S", "M"], category: "Insight"
            ),
        ]
    }

    func loadListings() -> [APIListingResponse] {
        [
            APIListingResponse(
                id: "l1",
                name: "Sample Bakery and Cafe",
                type: "BAKERY",
                address: "17928 Sample Blvd", city: "Default City", state: "CA",
                certifier: "SAMPLE", certifierName: "Sample Certification Council",
                certified: true, status: "ACTIVE",
                phone: "555-555-1100", description: "",
                rating: 0, priceRange: "$$",
                website: nil
            ),
        ]
    }

    private static func image(_ slug: String) -> String {
        "https://images.example.com/\(slug)?w=800&q=80"
    }

    private static func gallery(_ slugs: [String]) -> [String] {
        slugs.map { image($0) }
    }
}
