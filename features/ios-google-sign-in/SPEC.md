# iOS Sign in with Google (BFF token exchange)

> Native Google sign-in on iOS that hands the ID token to your own backend for a session, wrapped in async/await and shaped to mirror Sign in with Apple so both providers read identically at the call site.

> **⚠️ reference-only, captured from an UNMERGED WIP branch.** The origin was a
> local work-in-progress snapshot ("parallel-session snapshot"), not shipped and
> not on `main`. Read it for the shape and the decisions; do not treat it as
> battle-tested. Re-capture from `main` once the branch lands.

- **Slug:** `ios-google-sign-in`
- **Tags:** `auth, ios, google, oauth, swiftui, bff`
- **Source project:** iOS app (SwiftUI)
- **Stack:** Swift / SwiftUI + GoogleSignIn SDK + a custom API client
- **Reuse confidence:** reference-only
- **Status in origin:** on branch (WIP, unmerged)

## Problem it solves
The GoogleSignIn SDK is completion-handler based, hands you a `UIControl` button with no SwiftUI equivalent, and stops at "here's an ID token." You still have to present from the right window, bridge to async/await, render a compliant button in SwiftUI, and exchange the token with your backend for your own session. This wires all four together and makes Google line up with an existing Apple sign-in.

## When to reach for this
- You have a SwiftUI app with your own backend session (not Firebase Auth) and want "Continue with Google."
- You already have Sign in with Apple and want Google to mirror it so the auth UI and call sites stay uniform.
- You want the client to be a thin token-getter: the backend (BFF) verifies the Google ID token and owns the session.

## How it works
1. **Coordinator returns an ID token.** `GoogleSignInCoordinator.signIn()` finds the active window's root VC, calls `GIDSignIn.signIn(withPresenting:)`, and bridges the completion handler to async/await with `withCheckedThrowingContinuation`. It returns `(idToken, givenName, familyName)`.
2. **SwiftUI button bridge.** `GIDSignInButton` is a `UIControl`, so `GoogleSignInButtonRepresentable` wraps it in a `UIViewRepresentable`, forwards taps, and tracks light/dark to stay brand-compliant.
3. **BFF exchange.** The client POSTs the ID token to `/auth/google`; the backend verifies it with Google, finds-or-creates the user, and returns a unified auth response. The client persists the session and never sees Google again.
4. **One auth shape for all providers.** Apple and Google both funnel through the same `authExchange()` helper, so adding a provider is one endpoint method, not a new flow.

## Data model
Client-side/stateless beyond the session it persists. Config lives in `Info.plist`:
- `GIDClientID` = the iOS OAuth client id from Google Cloud Console.
- A URL scheme = the reversed client id (for the OAuth callback).
- App forwards `onOpenURL` to `GIDSignIn.sharedInstance.handle(url:)`.
Backend: verifies the ID token's `aud`/`iss`/signature against Google's certs, then upserts the user.

## Key decisions & gotchas
- **Backend verifies the token, not the app.** The app only obtains the ID token; trusting anything client-verified would be spoofable. Verification (audience, issuer, signature, expiry) is the server's job.
- **`retryOn401: false` on auth calls.** The shared API client refreshes on 401, but an auth exchange must never recurse into the refresh path. a failed exchange is a real failure, not a stale token. This is the easy infinite-loop to ship by accident.
- **Present from the *active foreground* window.** Multi-scene / multi-window apps crash or present on the wrong window if you grab `windows.first` blindly. Filter to `.foregroundActive`, then key window.
- **Use Google's own button.** Google's brand guidelines require their button styling; hence the `UIViewRepresentable` around `GIDSignInButton` rather than a hand-rolled SwiftUI button.
- **WIP gaps (origin was unmerged):** error surfacing to the UI, cancel handling, and account-linking (same email via Apple and Google) were not finished. Treat those as TODO, not as covered.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/GoogleSignInCoordinator.swift` | Async `signIn()` -> ID token; the SwiftUI button wrapper; error enum. | `GoogleSignIn` SDK, `Info.plist` `GIDClientID` + URL scheme |
| `code/APIClient+Auth.swift` | The BFF exchange: `exchangeGoogle`/`exchangeApple` through one `authExchange()` that persists the session. | your `APIClient` (`request`, `applySession`), `AuthResponseDTO`, `GoogleAuthRequest` |

## Structure to keep, skin to drop
- **Keep (the idea):** the completion-to-async bridge, the foreground-window presenter lookup, the BFF token exchange, the `retryOn401:false` rule, and Apple+Google sharing one `authExchange()`.
- **Drop (regenerate natively):** the DTO names, the endpoint paths, and your API client's transport. Restyle nothing here (Google's button is deliberately theirs).

## Adaptation notes
- Add the GoogleSignIn SDK (SwiftPM). Create an iOS OAuth client in Google Cloud Console; put `GIDClientID` and the reversed-client-id URL scheme in `Info.plist`.
- Forward `onOpenURL` to `GIDSignIn.sharedInstance.handle(url:)` in your App entry point.
- Implement the backend `/auth/google` to verify the ID token against Google's certs before trusting `email`/`sub`.
- Swap `APIClient`, `AuthResponseDTO`, and `GoogleAuthRequest` for your own; keep `retryOn401: false`.

## Provenance
- Origin files: `ios/.../Utilities/GoogleSignInCoordinator.swift`, `ios/.../Networking/APIClient+Auth.swift` @ an unmerged WIP branch. Genericized: app name, internal spec references removed. No client id or secret was in the source (config lives in Info.plist).
- Related features: [[ios-apple-sign-in]], [[ios-api-client]], [[ios-keychain-token-store]], [[ios-email-password-auth]]
- Related memory: KC iOS Google Sign-in on `feat/ios-google-sign-in`.
