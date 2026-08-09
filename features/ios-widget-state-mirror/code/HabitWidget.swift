import WidgetKit
import SwiftUI

@main
struct HabitWidgetBundle: WidgetBundle {
    var body: some Widget {
        HabitStreakWidget()
    }
}

struct HabitWidgetEntry: TimelineEntry {
    let date: Date
    let streak: Int
    let checkedInToday: Bool
    let statusEmoji: String
    let freezePasses: Int
}

struct HabitWidgetProvider: TimelineProvider {
    private static let appGroupID = "group.your.company.yourapp" // must match the app target

    func placeholder(in context: Context) -> HabitWidgetEntry {
        HabitWidgetEntry(date: Date(), streak: 7, checkedInToday: false, statusEmoji: "🌿", freezePasses: 1)
    }

    func getSnapshot(in context: Context, completion: @escaping (HabitWidgetEntry) -> Void) {
        completion(currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HabitWidgetEntry>) -> Void) {
        let entry = currentEntry()
        // Refresh at next midnight so "checked in today" resets with the day
        let calendar = Calendar.current
        let midnight = calendar.startOfDay(for: calendar.date(byAdding: .day, value: 1, to: Date()) ?? Date())
        completion(Timeline(entries: [entry], policy: .after(midnight)))
    }

    private func currentEntry() -> HabitWidgetEntry {
        let defaults = UserDefaults(suiteName: Self.appGroupID)
        let calendar = Calendar.current
        // Trust the "done today" flag only if the app wrote it today. Without
        // this, yesterday's ✅ survives past midnight until the app next opens.
        let lastSync = defaults?.double(forKey: "widget_last_sync") ?? 0
        let syncedToday = lastSync > 0 && calendar.isDateInToday(Date(timeIntervalSince1970: lastSync))
        return HabitWidgetEntry(
            date: Date(),
            streak: defaults?.integer(forKey: "widget_streak") ?? 0,
            checkedInToday: syncedToday && (defaults?.bool(forKey: "widget_checked_in_today") ?? false),
            statusEmoji: defaults?.string(forKey: "widget_status_emoji") ?? "🌱",
            freezePasses: defaults?.integer(forKey: "widget_freeze_passes") ?? 0
        )
    }
}

struct HabitStreakWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HabitStreakWidget", provider: HabitWidgetProvider()) { entry in
            HabitWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    Color(red: 14/255, green: 26/255, blue: 18/255)
                }
        }
        .configurationDisplayName("Streak")
        .description("Your streak and today's status at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

// One switch covers Home Screen and Lock Screen accessory families. All
// styling below is origin skin; restyle for the destination product.
struct HabitWidgetView: View {
    let entry: HabitWidgetEntry
    @Environment(\.widgetFamily) private var family

    private let accent = Color(red: 94/255, green: 232/255, blue: 122/255)
    private let warm = Color(red: 245/255, green: 201/255, blue: 122/255)
    private let textSecondary = Color(red: 122/255, green: 158/255, blue: 130/255)

    var body: some View {
        switch family {
        case .accessoryCircular:
            VStack(spacing: 0) {
                Text("🔥")
                    .font(.system(size: 14))
                Text("\(entry.streak)")
                    .font(.system(.headline, design: .monospaced, weight: .bold))
            }

        case .accessoryRectangular:
            HStack(spacing: 8) {
                Text(entry.statusEmoji)
                    .font(.system(size: 24))
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(entry.streak) day streak")
                        .font(.system(.headline, weight: .bold))
                    Text(entry.checkedInToday ? "Done today ✅" : "Not yet today")
                        .font(.caption)
                }
                Spacer()
            }

        case .systemMedium:
            HStack(spacing: 16) {
                VStack(spacing: 4) {
                    Text(entry.statusEmoji)
                        .font(.system(size: 40))
                    Text(entry.checkedInToday ? "Done ✅" : "Not yet")
                        .font(.system(.caption2, weight: .semibold))
                        .foregroundStyle(entry.checkedInToday ? warm : textSecondary)
                }

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 4) {
                        Text("🔥")
                            .font(.title3)
                        Text("\(entry.streak)")
                            .font(.system(size: 34, weight: .bold, design: .monospaced))
                            .foregroundStyle(accent)
                    }
                    Text(entry.checkedInToday ? "Streak safe for today." : "Today is still open.")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.85))
                    HStack(spacing: 4) {
                        Text("🧊")
                            .font(.caption2)
                        Text("\(entry.freezePasses) pass\(entry.freezePasses == 1 ? "" : "es") banked")
                            .font(.system(.caption2, design: .monospaced))
                            .foregroundStyle(textSecondary)
                    }
                }
                Spacer()
            }

        default:
            VStack(spacing: 6) {
                Text(entry.statusEmoji)
                    .font(.system(size: 34))
                HStack(spacing: 3) {
                    Text("🔥")
                        .font(.caption)
                    Text("\(entry.streak)")
                        .font(.system(size: 26, weight: .bold, design: .monospaced))
                        .foregroundStyle(accent)
                }
                Text(entry.checkedInToday ? "Done ✅" : "Not yet today")
                    .font(.system(.caption2, weight: .semibold))
                    .foregroundStyle(entry.checkedInToday ? warm : .white.opacity(0.85))
            }
        }
    }
}
