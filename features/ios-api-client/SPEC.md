# iOS Async/Await API Client

> A small typed HTTPS client (one `actor`) that builds requests, injects the bearer
> token, decodes JSON with a shared strategy, and maps every failure into one error enum.

- **Slug:** `ios-api-client`
- **Tags:** `ios`, `networking`, `infra`
- **Source project:** Kosher Connect iOS
- **Stack:** Swift / URLSession async-await (Foundation only, no third-party deps)
- **Reuse confidence:** drop-in (single file, zero external deps; swap the default base URL and Info.plist key)
- **Status in origin:** on branch (native Swift app, pre App Store ship)

## Problem it solves
Every screen that hits the backend needs the same plumbing: build a URL with query
params, attach `Authorization: Bearer …`, send JSON, check the status code, decode
the response, and turn whatever went wrong into something the UI can show. Doing this
inline per call drifts and leaks auth handling. This centralizes it in one typed,
generic client so each repository is a two-line wrapper.

## When to reach for this
- You have a native Swift app talking to a JSON backend and want one client, not a library like Alamofire.
- You want typed `get`/`post` that decode straight into `Decodable` DTOs.
- You want the auth token attached in exactly one place, set once at login and cleared at logout.
- You want every failure to arrive as one error type the UI can switch over.

## How it works
- A single `actor APIClient` (shared singleton) serializes access to the mutable
  `bearerToken`, so token reads/writes are safe across concurrent calls without locks.
- Public surface is two generics: `get(_:query:as:)` and `post(_:body:as:)`. Both
  funnel into one private `request(method:path:query:body:)`.
- The base URL is resolved once in `init`: explicit override, else the `KC_API_BASE_URL`
  string from `Info.plist`, else a hardcoded prod URL fallback. Path is appended with
  `appendingPathComponent`; query is built via `URLComponents`.
- Request building sets `Accept: application/json` always, adds `Content-Type` + body
  only when there is a body, and adds `Authorization: Bearer <token>` only when a token
  is present.
- Decoding uses a fresh `JSONDecoder` per call with `.iso8601` date strategy. Encoding
  uses a fresh `JSONEncoder` with defaults.
- Errors collapse into `APIError`: `.badURL`, `.http(code, body)`, `.decoding`,
  `.transport`. Non-2xx responses throw `.http` carrying the raw response body string;
  transport throws wrap the underlying URLSession error; decode failures wrap the
  decoding error. `APIError` is `LocalizedError`, so `errorDescription` is UI-ready.

## Data model
Mostly stateless. The actor holds two pieces of state: the resolved `baseURL` (set once
at init) and a mutable `bearerToken: String?` set via `setBearerToken(_:)`. The token
itself is **not** owned here. It lives in the Keychain (`KeychainStore`, key `.bearerToken`)
and is pushed into the client at three moments: after Apple Sign In, after email
magic-link auth, and on app launch when restoring a session. It is set to `nil` on logout.

## Key decisions & gotchas
- **`actor`, not `class`.** The only reason is the mutable token. Making it an actor means
  every call site `await`s the client (even `setBearerToken` is `async`). That is the
  trade you accept for lock-free token safety.
- **Auth is push, not pull.** The client does not read the Keychain itself. Callers read
  the token and call `setBearerToken`. So if you forget to restore the token on launch,
  every authed request silently goes out unauthenticated. The client has no way to know.
- **No token refresh, no 401 handling.** A 401 comes back as a plain `.http(401, body)`
  like any other status. There is no interceptor that refreshes and retries. The JWT in
  this app is long-lived (90-day per the architecture), so refresh was out of scope.
- **No retry, no timeout override.** Uses `URLSession.shared` defaults. Transient network
  failures surface immediately as `.transport`. Add retry at the repository layer if needed.
- **`.http(0, "non-http response")`** is the sentinel for a response that is not an
  `HTTPURLResponse`. Code `0` is the tell.
- **Error body is the raw response string.** `.http` carries `String(data:encoding:.utf8)`
  of the body, so server error JSON is preserved verbatim but not parsed. Callers that
  want structured error fields must decode the body string themselves.
- **Fresh coder per call.** A new `JSONDecoder`/`JSONEncoder` is allocated on every
  request. Negligible here; hoist to stored properties if you ever make this hot.
- **Date strategy is global `.iso8601`.** Every DTO date field must be ISO-8601. A backend
  that sends epoch millis or a custom format will throw `.decoding` until you change this.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/APIClient.swift` | Actor client: request building, auth header, JSON encode/decode, error mapping | Foundation only. Reads `KC_API_BASE_URL` from Info.plist; token supplied externally (Keychain in origin). |

The file is fully self-contained: no imports beyond `Foundation`, no reference to
`KeychainStore`, DTOs, or app types. The Keychain coupling lives entirely in the callers,
not in this file.

## Adaptation notes
- Change the Info.plist key `KC_API_BASE_URL` and the hardcoded prod fallback
  `https://kosherconnect.app` to your own.
- Define your own `Decodable` DTOs and pass them as the `as:` type to `get`/`post`.
- Wire `setBearerToken` to wherever your token lives (Keychain, in-memory, etc.). Remember
  to call it on app launch to restore the session, not just at login.
- If your backend dates are not ISO-8601, change `decoder.dateDecodingStrategy`.
- If you need 401-refresh, retry, or per-request timeouts, add them. None exist here.

## Provenance
- Origin file: `rork-kosher-connect/ios/KosherConnect/Networking/APIClient.swift` @ `8ac5474`
- Pairs with: `Utilities/KeychainStore.swift` (token storage), `Utilities/AppleSignIn.swift` + `Utilities/EmailAuthService.swift` (token set), `Networking/ShabbosRepository.swift` + `Networking/HotspotsRepository.swift` + `Services/ClaimService.swift` (thin callers)
- Related memory: `project_kosher_connect_ios_handoff.md`
