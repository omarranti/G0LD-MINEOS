import Foundation
import SwiftUI

/// State of the scheduled window for the anchor region.
///
/// - `unknown`: window not yet fetched, or upstream returned an error. Gated
///   affordances remain ENABLED in this state (fail-open) per the spec.
/// - `active`: now is outside the window (before it starts or after it ends).
///   Gated affordances enabled.
/// - `quiet`: now is between the window's start and end boundaries. Gated
///   affordances SUPPRESSED. Surface the end time so users know when the
///   window lifts.
enum WindowState: Equatable {
    case unknown
    case active(WindowDTO)
    case quiet(WindowDTO)

    /// True iff gated affordances must be suppressed.
    var suppressed: Bool {
        if case .quiet = self { return true }
        return false
    }

    var dto: WindowDTO? {
        switch self {
        case .unknown: nil
        case .active(let d), .quiet(let d): d
        }
    }
}

/// Single source of truth for the scheduled-window state on iOS. Holds the
/// latest fetched window, derives `state` from wall-clock comparison, and
/// schedules a single `Timer` at the next boundary so SwiftUI re-evaluates
/// without polling.
///
/// Owned by the app's root model. Refetch on launch, on foreground, and when
/// the anchor region changes.
@Observable
@MainActor
final class WindowClock {
    /// Anchor region slug used until the user picks one.
    static let defaultRegionSlug = "default-region"

    private(set) var state: WindowState = .unknown
    private(set) var lastFetchError: String? = nil

    private var regionSlug: String = WindowClock.defaultRegionSlug
    private var boundaryTimer: Timer?

    // No deinit. Owned by the root model for the app lifetime; the timer
    // is reaped by the system on app exit.

    /// Fetch the upcoming window for the current anchor region and recompute
    /// state. Safe to call repeatedly; idempotent on a successful response.
    func refresh() async {
        do {
            let dto = try await WindowRepository.shared.fetch(regionSlug: regionSlug)
            lastFetchError = nil
            apply(dto: dto)
        } catch {
            lastFetchError = error.localizedDescription
            // Keep prior state if we had one; otherwise stay `.unknown`.
        }
    }

    /// Change the anchor region. Call once at startup with the default.
    func setRegion(_ slug: String) async {
        guard slug != regionSlug else { return }
        regionSlug = slug
        await refresh()
    }

    /// Re-evaluate state against the current wall clock. Called by the boundary
    /// Timer and by foreground transitions.
    func tick() {
        guard let dto = state.dto else { return }
        apply(dto: dto)
    }

    private func apply(dto: WindowDTO) {
        let now = Date()
        let start = parseISO(dto.startISO)
        let end = parseISO(dto.endISO)

        guard let start, let end else {
            state = .unknown
            return
        }

        let next: WindowState
        if now < start {
            next = .active(dto)
        } else if now < end {
            next = .quiet(dto)
        } else {
            next = .active(dto)
        }

        if next != state {
            state = next
        }
        scheduleBoundaryTimer(start: start, end: end, now: now)
    }

    private func scheduleBoundaryTimer(start: Date, end: Date, now: Date) {
        boundaryTimer?.invalidate()
        let nextBoundary: Date? =
            if now < start { start }
            else if now < end { end }
            else { nil }
        guard let nextBoundary else { return }

        let interval = nextBoundary.timeIntervalSince(now)
        // Add 1s so we cross cleanly into the new state on fire.
        boundaryTimer = Timer.scheduledTimer(
            withTimeInterval: max(interval + 1, 1),
            repeats: false,
        ) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    private func parseISO(_ s: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = formatter.date(from: s) { return d }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: s)
    }
}
