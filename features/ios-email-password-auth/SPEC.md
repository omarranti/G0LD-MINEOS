# iOS Email Auth Service (request, verify, persist session)

> A tiny, transport-thin auth service that POSTs email credentials to the
> mobile BFF, takes back a { token, user } envelope, stores the bearer in the
> Keychain, primes the shared API client, and hands the caller a typed
> UserSession.

- **Slug:** `ios-email-password-auth`
- **Tags:** `auth`, `ios`, `email-password`
- **Source project:** Kosher Connect iOS
- **Stack:** Swift / SwiftUI (Foundation, async/await, Security/Keychain)
- **Reuse confidence:** adapt-the-shape (the persist-token-and-prime-client pattern is the reusable spine; endpoints, DTOs, and the Keychain/APIClient singletons are KC-specific and must be swapped)
- **Status in origin:** on branch (iOS app pre App Store ship)

## Naming note (read first)
The catalog slug says "magic-link," but the real code in `code/EmailAuthService.swift`
is **email + password** register and login, not a passwordless magic link. There is
no link request or token-verification step here. The file's own header even says
"Email + password auth." This SPEC documents what the code actually does. If you
want a true magic-link flow (request link, then verify a one-time token), this is the
right structural skeleton (POST, get back { token, user }, persist, prime client),
but the two calls would become "request link" and "verify token" against different
endpoints. KC's separate magic-link feature is specced web-side, not in this file.

## Problem it solves
A mobile client needs to turn a login form into an authenticated, persisted session
in one call site, without scattering token storage and header-setting logic across
the app. This service is the single choke point: every successful auth lands the
bearer token in exactly one place (Keychain) and primes exactly one place (the
shared API client), so the rest of the app only ever sees a `UserSession`.

## When to reach for this
- You have a backend that returns `{ token, user }` on auth and you want one helper
  that owns "store the token + set it on the HTTP client + return a domain session."
- You want register and login to share identical persistence so they can never drift.
- You are building an access-only mobile client (no in-app purchase), where auth
  just unlocks server-owned entitlement state rather than managing it locally.
- You want token storage in the Keychain (survives launches, not reinstalls) instead
  of UserDefaults.

## How it works
- `EmailAuthService` is a `@MainActor enum` (namespace, no instance state). Two static
  entry points: `register(email:password:name:)` and `login(email:password:)`.
- Each builds a small `Encodable` request struct and calls
  `APIClient.shared.post(path, body:, as: AppleAuthResponse.self)`. Both auth paths
  decode into the **same** `AppleAuthResponse` envelope used by Sign in with Apple
  (`{ token: String, user: MeDTO }`), so all three auth methods converge on one shape.
- The shared `persist(response:)` step is the whole point: it (1) writes the bearer to
  the Keychain under `KeychainStore.Key.bearerToken`, (2) `await`s
  `APIClient.shared.setBearerToken(...)` so every later request carries
  `Authorization: Bearer <token>`, and (3) returns `UserSession.fromDTO(response.user)`.
- `name` is normalized at the edge: an empty string is coerced to `nil` before it goes
  in the request body (`name?.isEmpty == false ? name : nil`).
- The session token lands in the **iOS Keychain**, service `app.kosherconnect.session`,
  account `bff.bearer.v1`, accessibility `kSecAttrAccessibleAfterFirstUnlock`. The
  in-memory copy lives on the `APIClient` actor.

## Data model
Not a database. Persistence is the iOS Keychain plus in-memory client state.

- **Keychain** (via `KeychainStore`): generic-password item, service
  `app.kosherconnect.session`, account key `bff.bearer.v1` (enum
  `KeychainStore.Key.bearerToken`). Saved with `kSecAttrAccessibleAfterFirstUnlock`.
  A `save` does a `SecItemDelete` then `SecItemAdd` (upsert). Persists across launches,
  cleared on reinstall.
- **In-memory**: `APIClient.shared.bearerToken` (private, set via the actor's
  `setBearerToken`), read into the `Authorization` header on each request.
- **Returned to caller**: `UserSession` value type (`userId`, `email?`, `name?`,
  `plan`, `trialEndsAt?`, `foundingMemberNumber?`, `isFoundingMember`), built from
  `MeDTO`. Entitlement is derived from `plan` (anything not "FREE" counts as paid),
  not stored locally.

## Key decisions & gotchas
- **Reuses the Apple auth envelope on purpose.** Email register, email login, and
  Apple sign-in all decode `AppleAuthResponse` and funnel through one `persist`. That
  is why behavior cannot diverge across auth methods. The name `AppleAuthResponse` is
  now a misnomer (it is the generic auth envelope), but renaming it would ripple.
- **No local entitlement logic.** The service never decides what the user can access.
  It stores a token and returns server-reported `plan`. This is the access-only
  ("companion app") posture: commerce and entitlement live on the server, the client
  only unlocks what the server already granted.
- **`@MainActor` on the service, but `setBearerToken` is `await`ed.** `APIClient` is
  its own actor, so priming the token hops actors. The `persist` helper is `async`
  for exactly this reason.
- **Errors are not caught here.** Anything thrown by `APIClient.post` (`APIError.http`
  for non-2xx, `.decoding`, `.transport`, `.badURL`) propagates straight to the caller.
  There is no retry, no token refresh, no 401 handling in this file. A wrong password
  surfaces as `APIError.http(401, body)` for the UI to translate.
- **Keychain writes are fire-and-forget.** `KeychainStore.save` ignores the
  `SecItemAdd` status. If the write silently fails, the in-memory token still works for
  the session but the user is logged out on next launch. Acceptable for v1; worth a
  status check if you harden it.
- **Empty name becomes nil, not "".** Keeps the backend from storing blank display
  names. Done at the request edge, not server-side.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/EmailAuthService.swift` | Build request, POST to `/auth/email/{register,login}`, persist token to Keychain, prime API client, return `UserSession`. Also defines the two `Encodable` request structs. | `APIClient` (shared singleton with async `post` + `setBearerToken`), `KeychainStore` (`save(_:for:)` + `.bearerToken` key), `AppleAuthResponse` + `MeDTO` (decode target), `UserSession` + `UserSession.fromDTO` |

Not copied but required to compile (KC-specific, easy analogs in any app):
- `APIClient`, actor/singleton exposing `post<T,B>(_:body:as:) async throws -> T` and `setBearerToken(_:)`; injects `Authorization: Bearer` and maps HTTP errors to `APIError`.
- `KeychainStore`, generic-password wrapper with a `Key` enum; `save` is delete-then-add.
- `AppleAuthResponse` = `{ token: String, user: MeDTO }`; `MeDTO` = the `/me` user shape.
- `UserSession`, domain value type with `fromDTO(_:)`.

## Adaptation notes
- **Endpoints:** point the two paths at your backend. Here they are
  `POST /api/mobile/v1/auth/email/register` and `POST /api/mobile/v1/auth/email/login`,
  both returning `{ token, user }`. For a real magic-link flow, replace with a
  "request link" POST (returns 202/no token) and a "verify" POST (returns the
  `{ token, user }` envelope), and only the verify step calls `persist`.
- **DTOs:** rename `AppleAuthResponse`/`MeDTO` to your own envelope, or keep the
  one-envelope-for-all-auth trick if you also have social sign-in.
- **Keychain:** swap `KeychainStore` for your store and pick your own service string
  and access key. Decide your accessibility class (KC uses
  `kSecAttrAccessibleAfterFirstUnlock`; tighten to `...ThisDeviceOnly` if you do not
  want iCloud Keychain sync).
- **Client priming:** if your HTTP client is not an actor, drop the `await` on
  `setBearerToken`.
- **Entitlement:** `UserSession.hasPaidEntitlement` treats any non-"FREE" plan as paid.
  Adjust to your plan vocabulary.
- **Brand:** no user-facing copy lives in this file, so no lexicon/Shabbos concerns
  to carry over.

## Provenance
- Origin file: `rork-kosher-connect/ios/KosherConnect/Utilities/EmailAuthService.swift` @ `8ac5474`
- Pairs with (same repo, same commit): `Utilities/KeychainStore.swift`, `Networking/APIClient.swift`, `Networking/DTOs.swift` (`AppleAuthResponse`, `MeDTO`), `Models/UserSession.swift`, `Utilities/AppleSignIn.swift` (the sibling that defined the shared envelope)
- Related memory: `project_kosher_connect_ios_app_review.md` (access-only / companion-app posture), `project_kosher_connect_ios_handoff.md`
