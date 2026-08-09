import Foundation

// Excerpt: locale-aware date formatting that follows the runtime language
// toggle instead of the device locale. `setLocalizedDateFormatFromTemplate`
// lets each locale order and script the components its own way (Arabic gets
// Arabic month names and ordering) from one template.

func dayLabel(_ date: Date, isArabic: Bool) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: isArabic ? "ar_AE" : "en_GB")
    f.setLocalizedDateFormatFromTemplate("EEE d MMM")
    return f.string(from: date)
}
