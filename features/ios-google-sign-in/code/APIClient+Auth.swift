import Foundation

/// Auth endpoint surface for the mobile BFF. Each sign-in exchange returns a
/// unified `AuthResponseDTO` and persists the session (access + rotating
/// refresh token) before returning, so callers only ever deal with the
/// resulting user object.
extension APIClient {

    /// Sign in with Apple: exchange the identity token for a session.
    func exchangeApple(_ body: AppleAuthRequest) async throws -> AuthResponseDTO {
        try await authExchange("/api/mobile/v1/auth/apple", body: body)
    }

    /// Sign in with Google: exchange the ID token for a session.
    func exchangeGoogle(_ body: GoogleAuthRequest) async throws -> AuthResponseDTO {
        try await authExchange("/api/mobile/v1/auth/google", body: body)
    }

    /// Shared POST -> decode `AuthResponseDTO` -> persist session. `retryOn401`
    /// is off on purpose: auth calls must never recurse into the refresh path
    /// (a failed exchange is a real failure, not a token that needs refreshing).
    private func authExchange<B: Encodable>(_ path: String, body: B) async throws -> AuthResponseDTO {
        let dto: AuthResponseDTO = try await request(
            method: "POST",
            path: path,
            body: try JSONEncoder().encode(body),
            retryOn401: false
        )
        applySession(dto)
        return dto
    }
}
