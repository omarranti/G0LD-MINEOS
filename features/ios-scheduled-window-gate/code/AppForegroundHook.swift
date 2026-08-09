import SwiftUI

// Excerpt: the app-entry wiring that keeps the clock honest across
// backgrounding. iOS freezes Timers while suspended, so a window boundary
// that passes in the background is only noticed here.

@main
struct WindowGateApp: App {
    @State private var model: AppModel = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(model)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                model.handleForegrounded()
            }
        }
    }
}

// Excerpt: from the root model that owns the clock.
extension AppModel {
    /// Called from the app entry on `scenePhase` foregrounding so the clock
    /// re-evaluates against the current wall time and re-pulls if the
    /// previously-fetched window already elapsed.
    func handleForegrounded() {
        clock.tick()
        Task { await clock.refresh() }
    }
}
