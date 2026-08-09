import SwiftUI

// Excerpt: app-entry wiring. The single .environment(\.layoutDirection, ...)
// line is what makes the whole SwiftUI tree mirror for RTL at runtime.

@main
struct BilingualApp: App {
    @StateObject private var lang = LangState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(lang)
                .environment(\.layoutDirection, lang.isArabic ? .rightToLeft : .leftToRight)
        }
    }
}

/// App-wide language state. Drives EN/AR copy and RTL layout.
final class LangState: ObservableObject {
    @Published var isArabic: Bool = false
    func toggle() { isArabic.toggle() }
    /// pick the right string for the current language
    func t(_ en: String, _ ar: String) -> String { isArabic ? ar : en }
}

/// A localized string pair. Mirrors the web app's `LS` type so copy decks
/// port between platforms 1:1.
struct LS {
    let en: String
    let ar: String
    func callAsFunction(_ lang: LangState) -> String { lang.isArabic ? ar : en }
    func s(_ isArabic: Bool) -> String { isArabic ? ar : en }
    init(_ en: String, _ ar: String) { self.en = en; self.ar = ar }
}
