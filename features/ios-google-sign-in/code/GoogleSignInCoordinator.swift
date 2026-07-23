import Foundation
import GoogleSignIn
import SwiftUI
import UIKit

/// Sign in with Google, then exchange the ID token with your backend (BFF).
/// Mirrors an `AppleSignInCoordinator`'s shape so both providers read the same
/// way at the call site: call `signIn()`, get back an ID token, POST it to your
/// server, get a session.
///
/// Requires `GIDClientID` + the reversed-client-ID URL scheme in Info.plist
/// (from the Google Cloud Console iOS OAuth client), and the app to forward
/// incoming URLs to `GIDSignIn.sharedInstance.handle(url:)` (wire it in your
/// App's `.onOpenURL`).
@MainActor
final class GoogleSignInCoordinator {
    func signIn() async throws -> (idToken: String, givenName: String?, familyName: String?) {
        guard let presenter = Self.activeRootViewController() else {
            throw GoogleSignInCoordinatorError.noPresenter
        }

        // GIDSignIn is completion-handler based; bridge it to async/await so
        // the call site is a single `try await signIn()`.
        return try await withCheckedThrowingContinuation { cont in
            GIDSignIn.sharedInstance.signIn(withPresenting: presenter) { result, error in
                if let error {
                    cont.resume(throwing: error)
                    return
                }
                guard let idToken = result?.user.idToken?.tokenString else {
                    cont.resume(throwing: GoogleSignInCoordinatorError.missingToken)
                    return
                }
                cont.resume(returning: (
                    idToken,
                    result?.user.profile?.givenName,
                    result?.user.profile?.familyName
                ))
            }
        }
    }

    /// Find the active foreground window's root view controller to present from.
    private static func activeRootViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
        let active = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        return (active?.windows.first { $0.isKeyWindow } ?? active?.windows.first)?.rootViewController
    }
}

/// SwiftUI wrapper for Google's official branded button. `GIDSignInButton` is a
/// `UIControl`; the SDK ships no SwiftUI-native equivalent, so bridge it.
struct GoogleSignInButtonRepresentable: UIViewRepresentable {
    var colorScheme: ColorScheme
    var action: () -> Void

    func makeUIView(context: Context) -> GIDSignInButton {
        let button = GIDSignInButton()
        button.style = .wide
        button.addTarget(context.coordinator, action: #selector(Coordinator.tapped), for: .touchUpInside)
        return button
    }

    func updateUIView(_ uiView: GIDSignInButton, context: Context) {
        uiView.colorScheme = colorScheme == .dark ? .dark : .light
        context.coordinator.action = action
    }

    func makeCoordinator() -> Coordinator { Coordinator(action: action) }

    final class Coordinator: NSObject {
        var action: () -> Void
        init(action: @escaping () -> Void) { self.action = action }
        @objc func tapped() { action() }
    }
}

enum GoogleSignInCoordinatorError: LocalizedError {
    case noPresenter
    case missingToken

    var errorDescription: String? {
        switch self {
        case .noPresenter: "No active window to present Google sign-in from."
        case .missingToken: "Google did not return an ID token."
        }
    }
}
