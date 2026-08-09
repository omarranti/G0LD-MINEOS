import Foundation
import WidgetKit

// App-side half of the mirror: the slice of the main view model that writes
// flat, display-ready scalars to the shared App Group defaults on every save.
// In the origin this is a private method on the view model, called at the end
// of `saveAll()` so the widget can never observe a partially saved state.
extension HabitViewModel {
    static let appGroupID = "group.your.company.yourapp" // must match the widget target

    func syncWidgetData() {
        guard let shared = UserDefaults(suiteName: Self.appGroupID) else { return }
        // Flat scalars only. The widget never decodes the domain model, so
        // model migrations can never break an installed widget.
        shared.set(profile.streak, forKey: "widget_streak")
        shared.set(hasCheckedInToday, forKey: "widget_checked_in_today")
        shared.set(statusEmoji, forKey: "widget_status_emoji")
        shared.set(profile.freezePasses, forKey: "widget_freeze_passes")
        // Freshness stamp: lets the widget reject yesterday's "done" flag.
        shared.set(Date().timeIntervalSince1970, forKey: "widget_last_sync")
        WidgetCenter.shared.reloadAllTimelines()
    }

    // Origin derives a growth-stage emoji from the streak; any display-ready
    // string works here.
    var statusEmoji: String {
        switch profile.streak {
        case 0: return "🌱"
        case 1...7: return "🌿"
        case 8...30: return "🌳"
        default: return "🏔️"
        }
    }
}
