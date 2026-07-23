import AuthenticationServices
import Foundation
import UIKit

/// Sign in with Apple → BFF exchange.
///
/// Requires the Xcode target to have the "Sign In with Apple" capability
/// enabled (Signing & Capabilities → + Capability). Without it, the
/// authorization controller will fail at runtime with code 1000.
@MainActor
final class AppleSignInCoordinator: NSObject {
    private var continuation: CheckedContinuation<(token: String, user: UserSession), Error>?

    func signIn() async throws -> (token: String, user: UserSession) {
        try await withCheckedThrowingContinuation { cont in
            self.continuation = cont

            let provider = ASAuthorizationAppleIDProvider()
            let request = provider.createRequest()
            request.requestedScopes = [.email, .fullName]

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }
}

extension AppleSignInCoordinator: ASAuthorizationControllerDelegate {
    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let tokenData = credential.identityToken,
            let identityToken = String(data: tokenData, encoding: .utf8)
        else {
            Task { @MainActor in
                self.resume(throwing: AppleSignInError.missingToken)
            }
            return
        }

        let given = credential.fullName?.givenName
        let family = credential.fullName?.familyName
        let appleUserID = credential.user

        Task { @MainActor in
            do {
                let response = try await APIClient.shared.post(
                    "/api/mobile/v1/auth/apple",
                    body: AppleAuthRequest(
                        identityToken: identityToken,
                        name: (given != nil || family != nil)
                            ? .init(givenName: given, familyName: family)
                            : nil
                    ),
                    as: AppleAuthResponse.self
                )
                KeychainStore.save(response.token, for: .bearerToken)
                KeychainStore.save(appleUserID, for: .appleUserID)
                await APIClient.shared.setBearerToken(response.token)
                self.resume(returning: (response.token, UserSession.fromDTO(response.user)))
            } catch {
                self.resume(throwing: error)
            }
        }
    }

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        Task { @MainActor in
            self.resume(throwing: error)
        }
    }

    @MainActor
    private func resume(
        returning value: (token: String, user: UserSession)
    ) {
        continuation?.resume(returning: value)
        continuation = nil
    }

    @MainActor
    private func resume(throwing error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }
}

extension AppleSignInCoordinator: ASAuthorizationControllerPresentationContextProviding {
    nonisolated func presentationAnchor(
        for controller: ASAuthorizationController
    ) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            // Find the active foreground window. Falls back to a new
            // window only if none exists (shouldn't happen at sign-in time).
            let scenes = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
            let active = scenes.first { $0.activationState == .foregroundActive }
                ?? scenes.first
            return active?.windows.first { $0.isKeyWindow }
                ?? active?.windows.first
                ?? UIWindow()
        }
    }
}

enum AppleSignInError: LocalizedError {
    case missingToken

    var errorDescription: String? {
        switch self {
        case .missingToken: "Apple did not return an identity token."
        }
    }
}
