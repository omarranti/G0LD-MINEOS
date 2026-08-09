# iOS Runtime Bilingual + RTL

> Fully bilingual EN/AR SwiftUI app with an instant in-app language toggle (no restart, no .strings pipeline) and true RTL mirroring, including custom-drawn asymmetric shapes.

<!-- Structure over skin: the value is the LangState/LS mechanism and the RTL-awareness discipline, not the pill styling. -->

- **Slug:** `ios-runtime-bilingual-rtl`
- **Tags:** `ios, swiftui, i18n, localization, rtl, arabic, bilingual`
- **Source project:** clinic iOS app (bilingual)
- **Stack:** Swift / SwiftUI, `ObservableObject` + `@EnvironmentObject`, DateFormatter
- **Reuse confidence:** drop-in (LangState / LS / LangToggle), reference-only (call-site convention)
- **Status in origin:** live in prod

## Problem it solves
Apple's localization stack (`.strings` / String Catalogs) keys everything off the device locale, which means switching language requires the user to change system settings and relaunch. For a market where users genuinely flip between English and Arabic mid-session (bilingual households, clinicians and patients sharing one device, Gulf-region products), you want a one-tap toggle that instantly re-renders every screen in the other language AND mirrors the layout right-to-left. This pattern does both with three tiny types and one environment line, no localization tooling at all.

## When to reach for this
- Exactly two languages, one of them RTL (Arabic, Hebrew, Urdu, Farsi), and the toggle must be in-app and instant.
- The copy deck already lives as EN/AR string pairs (shared with a web app) and you want iOS to consume the same pairs 1:1 rather than maintain a parallel `.strings` catalog.
- You have custom-drawn `Shape`s or asymmetric designs and need them to mirror correctly under RTL, which SwiftUI does NOT do for hand-built `Path`s.
- Dates, not just labels, must follow the in-app language instead of the device locale.
- NOT the right pattern for 3+ languages, translator handoff workflows, or App Store locale metadata; that is what String Catalogs are for. See the trade-off in gotchas.

## How it works
- `LangState: ObservableObject` holds one `@Published var isArabic: Bool`. It is injected once at the app entry via `.environmentObject(lang)`. Because every view that renders copy reads it, toggling publishes and the entire tree re-renders in the other language instantly.
- The same app-entry line `.environment(\.layoutDirection, lang.isArabic ? .rightToLeft : .leftToRight)` flips the whole SwiftUI tree to RTL at runtime. HStacks, alignments, leading/trailing paddings, and SF Symbols with directional variants all mirror for free.
- Strings live at call sites as pairs: either `lang.t("Book", "احجز")` for one-offs, or the `LS` struct (`LS("Book", "احجز")`) for copy stored in models and constants. `LS.callAsFunction(lang)` makes usage read as `title(lang)`. `LS` mirrors the web app's type of the same name, so a shared copy deck ports across platforms mechanically.
- Custom shapes must self-mirror: SwiftUI mirrors layout but never redraws your `Path`. `PillShape` reads `@Environment(\.layoutDirection)` and swaps its corner radii (the squared corner stays top-leading in both directions). Any asymmetric custom drawing needs this treatment.
- `LangToggle` is a small button whose label always shows the OTHER language in that language's own script ("العربية" when English is active, "EN" when Arabic is), wrapped in a 0.2s ease animation and with a bilingual accessibility label. Origin places it in every screen header so switching is never more than one tap away.
- Dates route through a helper that builds a `DateFormatter` with an explicit per-language locale (`ar_AE` / `en_GB`) and `setLocalizedDateFormatFromTemplate`, so Arabic gets Arabic month names and component ordering from the same template string.

## Data model
Stateless. `isArabic` is in-memory only in origin (resets to English each launch); persist it with one `@AppStorage("isArabic")` if the choice should stick.

## Key decisions & gotchas
- **The trade-off, stated honestly:** every localized call site carries both languages inline. There is no `.strings` file, no translator export, no missing-key warning, and adding a third language means touching every call site. This is a deliberate trade for a 2-language product with a shared web copy deck: zero pipeline, zero desync between platforms, instant runtime switching. If you expect language #3 or an external translation vendor, use String Catalogs instead and accept the restart-or-relaunch UX.
- **`\.layoutDirection` does not mirror custom `Path`s.** The single most missed detail. Standard containers mirror; your hand-drawn shapes render identically in both directions unless they read the environment themselves, which looks subtly wrong (asymmetry pointing the "trailing" way). Grep your codebase for `Shape` conformances when adopting.
- **Toggle label names the target language, in its own script.** An Arabic-only speaker staring at an English UI can still find "العربية". Do not label the toggle with the current language.
- **44pt minimum hit target** on the toggle (`minWidth: 44, minHeight: 40`) and a bilingual `accessibilityLabel`, both easy to lose in restyling.
- **Explicit locale on every DateFormatter.** Any formatter left on the device default breaks the illusion the moment device locale and in-app language differ. The same applies to `NumberFormatter` if you show Arabic-Indic digits (origin keeps Western digits).
- **Deliberately not handled:** pluralization rules (Arabic has six plural forms; origin's copy avoids constructions that need them), per-string layout direction (mixed-direction strings rely on system bidi), and persisting the language choice.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/LangState.swift` | App-entry excerpt (`environmentObject` + `layoutDirection` wiring), `LangState`, and the `LS` string-pair struct with `callAsFunction` | your root view name |
| `code/RTLComponents.swift` | `PillShape` (custom `InsettableShape` that flips its asymmetric corner radii under RTL) and `LangToggle` (the switch control) | origin's `haptic()` helper and `PressableStyle` button style were removed; brand colors swapped to system colors, restyle to taste |
| `code/LocalizedDateLabel.swift` | `dayLabel(_:isArabic:)`: per-language locale + `setLocalizedDateFormatFromTemplate` date formatting | locale identifiers (`ar_AE`/`en_GB`) if your market differs |

## Structure to keep, skin to drop
- **Keep (the idea):** the single `LangState` environment object, the one-line runtime `\.layoutDirection` flip at the app entry, the `LS` pair type shared with web, the read-the-environment discipline for custom `Path`s, the other-language-in-its-own-script toggle label, and explicit locales on formatters.
- **Drop (regenerate natively):** the pill's specific geometry (square top-leading corner, radii values), all colors, fonts, paddings, and the animation curve on the toggle. The origin's haptic feedback and pressable button style were already stripped; re-add your own.

## Adaptation notes
- Drop-in: copy `LangState` + `LS`, add the two modifiers at your app entry, place `LangToggle` in your header component. That is the whole install.
- Reference-only: the call-site convention. Every user-facing string in the destination app must become `lang.t(en, ar)` or an `LS` pair; there is no compiler enforcement, so a missed string simply never translates. Sweep with a review pass (grep for `Text("` with raw literals).
- Swap language pair by renaming `isArabic` and the locale identifiers; the RTL machinery only matters if one language is RTL.
- Add `@AppStorage` persistence if the language choice should survive relaunch; consider defaulting from `Locale.preferredLanguages.first` on first run.
- If some copy comes from your API, mirror the `LS` shape server-side (`{ en, ar }` objects) so DTOs decode straight into `LS`.

## Provenance
- Origin files: `Hakkini/HakkiniApp.swift` (LangState, LS, layoutDirection wiring), `Hakkini/Components.swift` (PillShape, LangToggle), `Hakkini/BookView.swift` (locale-aware `dayLabel`) @ 2026-08-08 (clinic iOS app, bilingual, live). Genericized for this library: trimmed excerpts of the language/RTL machinery only, not whole app files; brand tint and named brand colors replaced with system colors; the origin's `haptic()` call and `PressableStyle` removed from `LangToggle`; app and root view renamed. The mechanism (state object, string pairs, runtime layoutDirection, RTL-aware custom shape, per-language DateFormatter) is intact.
- Related features: [[ios-api-client]]
- Related memory: origin project's web-to-iOS mirroring rule (web leads, iOS mirrors, including the shared `LS` type).
