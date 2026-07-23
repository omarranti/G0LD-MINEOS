# Sign in with Apple (ASAuthorization + BFF Exchange)

> An async/await wrapper around `ASAuthorizationController` that runs the native
> Sign in with Apple sheet, then hands the resulting identity token to a backend
> for verification and trades it for an app session token.

- **Slug:** `ios-apple-sign-in`
- **Tags:** `auth`, `ios`, `apple`, `sign-in`
- **Source project:** Kosher Connect iOS
- **Stack:** Swift / AuthenticationServices (UIKit window anchoring, async/await)
- **Reuse confidence:** adapt-the-shape (the controller + delegate + continuation plumbing is drop-in; the `APIClient` / `KeychainStore` / `UserSession` calls are app-specific and must be re-pointed)
- **Status in origin:** on branch (iOS app pre App Store ship)

## Problem it solves
Apple's `ASAuthorizationController` is a delegate-and-callback API from the
pre-async era. Calling it from modern Swift means bridging two delegate callbacks
(success / error) plus a presentation-anchor callback back into a single
`async throws` function, and then doing the real work: the identity token Apple
returns is not a session. It has to be verified and exchanged with your own
backend for a token your app actually uses. This wraps both halves into one
`signIn() async throws` call.

## When to reach for this
- You want "Sign in with Apple" as a first-class auth path and you call your own
  backend (BFF / token-exchange pattern), not Firebase/Auth0 SDKs.
- You want a clean `try await coordinator.signIn()` instead of scattering delegate
  methods and completion handlers across a view controller.
- You need the identity token verified server-side (the correct place), with the
  client only forwarding it.
- You are on Swift Concurrency with `@MainActor` UI and need the `nonisolated`
  delegate hops handled correctly.

## How it works
- `signIn()` wraps the whole flow in `withCheckedThrowingContinuation`, stashes the
  continuation, builds an `ASAuthorizationAppleIDProvider` request scoped to
  `[.email, .fullName]`, and calls `performRequests()`. The function suspends until
  a delegate callback resumes the stored continuation exactly once.
- On success the delegate pulls the `ASAuthorizationAppleIDCredential`, reads
  `credential.identityToken` (a JWT, as `Data`), decodes it to a UTF-8 string, and
  also captures `credential.user` (the stable per-app Apple user ID) plus
  `fullName.givenName` / `familyName` if present.
- It POSTs `{ identityToken, name? }` to `/api/mobile/v1/auth/apple`. The backend is
  where the token is actually trusted: it verifies the JWT against Apple's JWKS
  (`https://appleid.apple.com/auth/keys`), checks issuer `appleid.apple.com` and
  audience = the app bundle ID, then returns its own session token + user DTO.
- On the backend's response the client saves the session token and the Apple user
  ID to Keychain, sets the bearer token on the shared API client, and resumes the
  continuation with `(token, UserSession)`.
- Presentation anchoring: `presentationAnchor(for:)` walks
  `UIApplication.connectedScenes`, finds the foreground-active `UIWindowScene`, and
  returns its key window so the sheet attaches to the right window in multi-scene /
  multi-window setups.

## Data model
Mostly stateless. Two values are persisted to **Keychain** after exchange:
- `bearerToken`, the backend session token (used for all subsequent requests).
- `appleUserID`, `credential.user`, the stable Apple identifier for this app.

Wire shapes (request is what the client controls):
```swift
struct AppleAuthRequest: Encodable {
    let identityToken: String
    let name: AppleAuthName?          // sent only on first login (see gotchas)
    struct AppleAuthName: Encodable {
        let givenName: String?
        let familyName: String?
    }
}
struct AppleAuthResponse: Decodable {
    let token: String                 // app session token
    let user: MeDTO                   // mapped to UserSession via fromDTO
}
```

## Key decisions & gotchas
- **The client never trusts the identity token. The backend does.** The Swift side
  only decodes the JWT to a string and forwards it. All verification (Apple JWKS
  signature, issuer, audience = bundle ID) happens server-side with `jose`'s
  `jwtVerify`. Do not validate or trust the token on-device.
- **Name and email arrive on first login only, forever.** Apple populates
  `fullName` (and email) the first time a user authorizes the app, and returns
  `nil` for them on every subsequent sign-in. The request therefore sends `name`
  only when at least one name part is present, and your backend must persist it on
  first contact. If you drop it, you cannot get it back from Apple without the user
  revoking and re-authorizing in iOS Settings.
- **`credential.user` is the durable identity, not email.** Email can be a private
  relay and can change. `credential.user` is stable per app and is what's stored in
  Keychain (`appleUserID`).
- **Single-resume continuation discipline.** Every path nils the continuation after
  resuming via the two private `resume(...)` helpers, so the success delegate, the
  error delegate, and the missing-token guard can never double-resume the same
  continuation (which would crash).
- **`@MainActor` class with `nonisolated` delegate methods.** The three
  AuthenticationServices callbacks are `nonisolated` (the framework calls them off
  the actor); each hops back onto the main actor with `Task { @MainActor in ... }`
  before touching `continuation` or doing the network call.
- **Missing identity token is an explicit failure.** If `identityToken` is absent or
  not UTF-8 decodable, it throws `AppleSignInError.missingToken` rather than hanging
  the continuation.
- **Capability is a hard prerequisite.** The Xcode target must have the "Sign In
  with Apple" capability enabled or the controller fails at runtime with error code
  1000 (documented in the file's header comment).
- **Presentation anchor fallback is defensive only.** It ends with `?? UIWindow()`,
  a throwaway window for the "no window exists at sign-in" case that should not
  happen in practice. It keeps the return type non-optional rather than handling a
  real scenario.
- **User cancellation flows through as a thrown error.** A cancelled sheet arrives
  via `didCompleteWithError` and is rethrown as-is (an `ASAuthorizationError`), so
  callers should distinguish cancel from real failure at the call site.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/AppleSignIn.swift` | `ASAuthorizationController` async wrapper + delegate/continuation bridge + backend exchange + Keychain persistence | `APIClient.shared` (your networking layer), `KeychainStore` (your secure store), `UserSession` / `UserSession.fromDTO` (your session model), `AppleAuthRequest` / `AppleAuthResponse` DTOs, the `/api/mobile/v1/auth/apple` endpoint |

## Adaptation notes
- Re-point the network call: replace `APIClient.shared.post(...)` and the
  `AppleAuthRequest` / `AppleAuthResponse` shapes with your own client and DTOs, and
  change the `/api/mobile/v1/auth/apple` path.
- Replace `KeychainStore.save(...)` and the `.bearerToken` / `.appleUserID` keys with
  your secure storage; replace `UserSession.fromDTO(response.user)` with your model
  mapping.
- Stand up the backend half: verify the identity token against Apple's JWKS, check
  issuer and audience (your bundle ID), then mint and return your own session token.
  This wrapper is only the client side of the exchange.
- Enable the "Sign In with Apple" capability on the Xcode target (required, see
  gotchas).
- Keep the `name`-only-on-first-login handling intact and persist the name
  backend-side on first contact.

## Provenance
- Origin file: `rork-kosher-connect/ios/KosherConnect/Utilities/AppleSignIn.swift` @ `8ac5474`
- Related origin files: `ios/KosherConnect/Networking/DTOs.swift` (`AppleAuthRequest` / `AppleAuthResponse`), `ios/KosherConnect/Utilities/KeychainStore.swift` (`.appleUserID` key), web `src/app/api/mobile/v1/auth/apple/route.ts` (server-side JWKS verification)
- Related memory: `project_kosher_connect_ios_app_review.md`, `project_kosher_connect_ios_handoff.md`
