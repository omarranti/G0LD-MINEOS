import Foundation

/// Email + password auth against the KCW BFF. Mirrors the AppleSignIn
/// flow: POST credentials → receive { token, user } → store bearer in
/// Keychain → set on APIClient → return UserSession to the caller.
@MainActor
enum EmailAuthService {
    static func register(
        email: String,
        password: String,
        name: String?
    ) async throws -> UserSession {
        let body = EmailRegisterRequest(
            email: email,
            password: password,
            name: name?.isEmpty == false ? name : nil
        )
        let response = try await APIClient.shared.post(
            "/api/mobile/v1/auth/email/register",
            body: body,
            as: AppleAuthResponse.self
        )
        return try await persist(response: response)
    }

    static func login(
        email: String,
        password: String
    ) async throws -> UserSession {
        let body = EmailLoginRequest(email: email, password: password)
        let response = try await APIClient.shared.post(
            "/api/mobile/v1/auth/email/login",
            body: body,
            as: AppleAuthResponse.self
        )
        return try await persist(response: response)
    }

    private static func persist(response: AppleAuthResponse) async throws -> UserSession {
        KeychainStore.save(response.token, for: .bearerToken)
        await APIClient.shared.setBearerToken(response.token)
        return UserSession.fromDTO(response.user)
    }
}

struct EmailRegisterRequest: Encodable {
    let email: String
    let password: String
    let name: String?
}

struct EmailLoginRequest: Encodable {
    let email: String
    let password: String
}
