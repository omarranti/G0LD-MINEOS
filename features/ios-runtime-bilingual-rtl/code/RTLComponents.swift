import SwiftUI

// Excerpt: the two RTL-aware controls. PillShape shows how a custom-drawn
// asymmetric shape mirrors itself under RTL (SwiftUI mirrors layout for you,
// but hand-built Paths must read \.layoutDirection and flip on their own).

/// The signature asymmetric pill (square top-leading corner). Under RTL the
/// squared corner swaps sides so the shape stays visually "leading".
struct PillShape: InsettableShape {
    @Environment(\.layoutDirection) private var dir
    var insetAmount: CGFloat = 0
    func path(in rect: CGRect) -> Path {
        let rect = rect.insetBy(dx: insetAmount, dy: insetAmount)
        let r = rect.height / 2
        let small: CGFloat = 6
        let rtl = dir == .rightToLeft
        let radii = RectangleCornerRadii(
            topLeading: rtl ? r : small,
            bottomLeading: r,
            bottomTrailing: r,
            topTrailing: rtl ? small : r
        )
        return UnevenRoundedRectangle(cornerRadii: radii).path(in: rect)
    }
    func inset(by amount: CGFloat) -> some InsettableShape {
        var s = self; s.insetAmount += amount; return s
    }
}

/// One-tap language switch. Label always names the OTHER language in that
/// language's own script, so it is findable whichever language is active.
struct LangToggle: View {
    @EnvironmentObject var lang: LangState
    var light: Bool = false
    var body: some View {
        Button { withAnimation(.easeInOut(duration: 0.2)) { lang.toggle() } } label: {
            Text(lang.isArabic ? "EN" : "العربية")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(light ? .white : Color.primary)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .frame(minWidth: 44, minHeight: 40)
                .background(light ? Color.white.opacity(0.08) : .white)
                .overlay(Capsule().strokeBorder(light ? Color.white.opacity(0.35) : Color.secondary.opacity(0.3), lineWidth: 1))
                .clipShape(Capsule())
        }
        .accessibilityLabel(lang.isArabic ? "Switch to English" : "التبديل إلى العربية")
    }
}
