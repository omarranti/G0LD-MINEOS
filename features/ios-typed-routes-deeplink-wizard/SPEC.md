# iOS Typed Routes + Deep-Linkable Wizard

> One Route enum and one switch make every screen deep-linkable, and a 6-step wizard whose init computes its starting step from entry presets so detail pages can drop users into the middle of the flow.

<!-- Structure over skin: the value is the route registry contract and the wizard's step machine, not the clinic UI. -->

- **Slug:** `ios-typed-routes-deeplink-wizard`
- **Tags:** `navigation, deep-link, wizard, multi-step, booking, forms, focus-state, i18n`
- **Source project:** clinic iOS app (bilingual)
- **Stack:** SwiftUI NavigationStack (`navigationDestination(for:)`), iOS 16+
- **Reuse confidence:** drop-in (Route registry) / adapt-the-shape (wizard)
- **Status in origin:** working concept build (payment step simulated, see gotchas)

## Problem it solves
Two chronic SwiftUI navigation failures. First, apps that navigate with ad-hoc `NavigationLink { DestinationView() }` closures scatter construction logic everywhere, and no screen is reachable programmatically (push notification, universal link, cross-tab jump). Second, multi-step wizards usually hardcode "start at step 0", so a detail page ("Book with this clinician") either cannot preconfigure the flow or does it with fragile flags. This pattern centralizes all destinations behind a value type and lets the wizard compute its own entry point from presets.

## When to reach for this
- Any SwiftUI app with more than a handful of screens, especially multi-tab apps where several stacks must reach the same screens.
- You need deep links, notifications, or in-app cross-links to open arbitrary screens: with typed routes that becomes `path.append(Route...)`.
- You have a checkout / booking / onboarding wizard that must be enterable cold at step 0 AND mid-flow from a detail page with parts pre-answered.
- You want wizard back semantics that do the right thing both as a root tab and when pushed.

## How it works
1. **One enum, one switch.** `Route: Hashable` enumerates every pushable screen; associated values are lightweight identifiers (slugs, ids), never model objects, so routes can be constructed anywhere without loading data. `RouteDestinations` is a ViewModifier holding the single `navigationDestination(for: Route.self)` switch that maps each case to its view.
2. **Registry attached everywhere via `.withRoutes()`.** Each tab's `NavigationStack` root applies the same modifier, so any screen in any stack can push any other screen with `NavigationLink(value:)` or by appending to the path. Screens that can themselves push (like the wizard) also apply `.withRoutes()`.
3. **Entry presets pick the starting step.** `Route.book(service: String?, clinician: String?)` carries optional presets. The wizard's `init` resolves them: clinician preset validates the slug, backfills a compatible service (preset service if the clinician offers it, else the clinician's first service), and starts at step 2 (Time). Service-only preset starts at step 1 (Clinician). No presets starts at step 0. Invalid slugs fall through to a cold start instead of crashing.
4. **`wasPushed` back semantics.** The init also records whether the wizard was entered by push. The back button steps backward within the flow (`step - 1`) while inside steps 1 to 4, and calls `dismiss()` at the entry boundary or on the success screen, so a pushed user returns to the detail page they came from rather than unwinding through steps they never saw.
5. **Backward-only stepper.** Completed step circles are tappable to jump back; the current and future circles are `disabled`, so the stepper can never skip validation. Forward motion only happens through each step's own continue action, each gated on that step's completeness (`canConfirm`, date+time selected).
6. **Step-keyed transitions and focus.** The step body carries `.id(step)`, so changing the int swaps the subtree identity and a single `.transition(.opacity)` plus `withAnimation` in `goTo` animates every step change. A single `FieldID` enum + `@FocusState` covers all wizard inputs; `focused = nil` on navigation dismisses the keyboard.
7. **Derived, never duplicated.** Service and clinician are computed from slugs against the catalog; the clinician list filters by chosen service with a full-team fallback; the price comes from the shared pricing table so the wizard and the pricing screen cannot drift. Bilingual copy goes through a `lang.t(english, arabic)` helper with locale-aware date formatting.

## Data model
Stateless in-memory flow. Reads a static catalog (`SERVICES`, `TEAM`, `PRICING` keyed by service slug); the wizard holds its answers in `@State` and the origin persists nothing on completion (concept build). In a production adaptation the success transition is where a booking record gets written.

## Key decisions & gotchas
- **The payment step is NOT a payment integration.** The origin's step 4 is a simulated concept preview: it fakes processing with `DispatchQueue.asyncAfter(1.3s)`, contacts no PSP, charges nothing, stores no card data, and its own UI discloses this ("Concept preview, you won't be charged"). It is included as reference only for where a pay step sits in a wizard. Never reuse it as a payment pattern; replace the step body and button action with a real PSP SDK (and never hand-roll card fields in production, PCI scope).
- **Identifiers in routes, objects at destinations.** Passing slugs keeps `Route` Hashable-cheap and constructible from strings (the deep-link property). The cost: every destination re-resolves its model, so resolvers must tolerate stale or invalid ids, as the wizard init does.
- **Preset validation in init, not in body.** Computing the start step in `init` with `State(initialValue:)` runs exactly once per entry. Doing it in `onAppear` re-fires and fights user navigation.
- **Selection steps auto-advance** (choosing a service or clinician immediately calls `goTo`), while form steps require an explicit continue. Changing service also clears the clinician so a stale pairing cannot survive a backward jump.
- **Enum growth is the accepted trade.** One switch with ~35 cases is verbose but greppable, exhaustive at compile time, and the whole point: the compiler forces every new screen to be registered.
- **Deliberately not handled:** URL-string parsing into `Route` (the enum is the target for it, but the origin ships no URL scheme), state restoration of a half-finished wizard, and server-driven slot availability (times are a static array).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/Nav.swift` | The `Route` enum, the `RouteDestinations` switch, `.withRoutes()`, and tiny URL/tel helpers | every destination view named in the switch (replace with your screens) |
| `code/BookView.swift` | Trimmed excerpt of the 6-step wizard: preset-computing init, `wasPushed` back logic, backward-only stepper, `FieldID` + `@FocusState`, `.id(step)` transitions, simulated pay step (reference only), success + reset | `LangState`/`lang.t` (i18n), catalog lookups (`serviceBySlug`, `memberBySlug`, `SERVICES`, `TEAM`, `PRICING`), house components (`PillButton`, `Chip`, `Card`, `h2/h3` text styles), color tokens |

## Structure to keep, skin to drop
- **Keep (the idea):** the enum + single-switch registry with identifier-only payloads, `.withRoutes()` on every stack root, preset-to-starting-step resolution in init with validation fallbacks, `wasPushed` dismiss-vs-step-back semantics, backward-only stepper jumps, per-step forward gating, `.id(step)` transition keying, the one-FieldID FocusState, and derive-from-catalog (especially pricing from one shared table).
- **Drop (regenerate natively):** the clinic domain (services, clinicians, AED pricing, Friday closure, WhatsApp confirmation, emergency disclaimer), the entire simulated pay step, the navy/mint/cloud palette and house components, all English/Arabic copy, and the 4-slot static time grid. The bilingual `lang.t` mechanism is skin too unless the destination app is itself bilingual, in which case keep the pattern (inline pairs + locale-keyed DateFormatter) and swap the languages.

## Adaptation notes
- Route registry is drop-in: rename the cases to your screens, keep payloads as ids/slugs, apply `.withRoutes()` to every `NavigationStack` root, and push with `NavigationLink(value:)` or `path.append`.
- For URL deep links, add one parser that maps path components to `Route` values and append to the active tab's path; the enum shape already supports it.
- Wizard: swap the catalog lookups for your data source, rewrite each step body natively, and re-map the preset rules (which entry points skip which steps) to your domain. Keep the init-computes-step + `wasPushed` mechanics verbatim.
- Replace the pay step with a real PSP (Stripe PaymentSheet, Apple Pay via PassKit). The only thing to keep from step 4 is its position in the flow and the disabled-while-processing button state.
- If steps carry heavy views, consider `.transition` pairs per direction; the origin's single `.opacity` fade is direction-agnostic by choice.

## Provenance
- Origin files: `<app>/Nav.swift` and `<app>/BookView.swift` @ 2026-08-08 (clinic iOS app, bilingual English/Arabic, working concept build). Genericized for this library: one partner-brand route case removed from the enum; `BookView` reduced to a trimmed excerpt (step-body styling condensed to placeholders, header/stepper/success simplified) with the flow logic, init, and gating intact; the simulated payment step retained verbatim in logic but explicitly marked reference-only. All other identifiers are generic clinic-domain terms and were kept.
- Related features: [[ios-api-client]], [[save-intent-replay-across-auth]]
- Related memory: none
