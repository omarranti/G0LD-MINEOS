# iOS Keychain Token Store

> A tiny, typed Swift wrapper over the iOS Keychain for persisting secrets (a BFF
> bearer token and an Apple user ID) as generic-password items under one service.

- **Slug:** `ios-keychain-token-store`
- **Tags:** `ios`, `security`, `storage`, `auth`
- **Source project:** Kosher Connect iOS
- **Stack:** Swift (Foundation + Security framework, no third-party deps)
- **Reuse confidence:** drop-in (rename the service + the `Key` cases and it works in any iOS app)
- **Status in origin:** on branch (iOS app pre-App-Store)

## Problem it solves
An app that authenticates a user needs somewhere safe to keep the resulting token
and identifier across launches. `UserDefaults` is the wrong place (plaintext,
backed up, readable). The Keychain is the right place but its C-style `SecItem`
API is verbose and easy to get subtly wrong. This wraps it in three call sites
(`save` / `read` / `delete`) plus a `clearAll` for logout, with a typed key enum
so you can't fat-finger an account string.

## When to reach for this
- You're storing a bearer token, refresh token, Apple/OAuth user ID, or any small
  secret string on iOS and want it off `UserDefaults`.
- You want a typed, misuse-resistant Keychain surface (enum keys, not raw strings)
  without pulling in a dependency like KeychainAccess.
- You need a single `clearAll()` to wipe credentials on sign-out.

## How it works
- Everything is a `kSecClassGenericPassword` item scoped by a fixed `service`
  string (`"app.kosherconnect.session"`) and keyed by `kSecAttrAccount` (the
  `Key.rawValue`). Service + account together identify one item.
- `save(_:for:)` is **delete-then-add**, not update: it runs `SecItemDelete` first
  to clear any existing item, then `SecItemAdd` with the new data. This sidesteps
  the `errSecDuplicateItem` you'd hit if you blindly added, and avoids the separate
  `SecItemUpdate` code path entirely.
- The value is stored UTF-8 encoded (`Data(value.utf8)`); `read` decodes it back to
  a `String` and returns `nil` on any failure.
- `read(_:)` queries with `kSecReturnData: true` and `kSecMatchLimit: kSecMatchLimitOne`,
  then guards on `errSecSuccess` plus a successful `Data` cast and UTF-8 decode.
- Accessibility is `kSecAttrAccessibleAfterFirstUnlock`: the item is readable after
  the user unlocks the device once post-boot (so background launches can read the
  token), but not before first unlock.
- `clearAll()` just calls `delete` for each known key. It does NOT do a wildcard
  service-wide delete, so it only clears keys the enum knows about.

## Data model
Each entry is one Keychain generic-password item:

| Keychain attribute | Value |
|--------------------|-------|
| `kSecClass` | `kSecClassGenericPassword` |
| `kSecAttrService` | `"app.kosherconnect.session"` (constant) |
| `kSecAttrAccount` | `Key.rawValue` (`"bff.bearer.v1"` or `"apple.userID.v1"`) |
| `kSecValueData` | UTF-8 bytes of the string value |
| `kSecAttrAccessible` | `kSecAttrAccessibleAfterFirstUnlock` (set on add only) |

Two keys today: `.bearerToken` and `.appleUserID`. Items persist across app
launches but not across reinstalls (uninstalling clears the app's Keychain items).

## Key decisions & gotchas
- **Delete-then-add instead of update.** Simpler and idempotent: a `save` always
  results in exactly the new value, no duplicate-item error, no update branch. The
  cost is two SecItem calls per write, which is irrelevant at this volume.
- **Accessibility is `AfterFirstUnlock`, not biometric and not the default.** This
  is the deliberate trade: the token survives device reboots once the user has
  unlocked once, so the app can authenticate on background launch. It is NOT
  `WhenUnlocked` (would block background reads) and NOT `…ThisDeviceOnly` (so it can
  ride an encrypted iCloud Keychain backup). No biometric / `SecAccessControl` gate
  is applied. If you need Face/Touch ID to read the token, that's an addition, not a
  config flag here.
- **All errors are swallowed.** `save` and `delete` ignore the `OSStatus` returned
  by `SecItemAdd` / `SecItemDelete`; `read` collapses every failure (not-found,
  decode failure, wrong type) into a single `nil`. Convenient and crash-free, but you
  cannot distinguish "no token stored" from "Keychain read failed", callers only
  see `nil`. Fine for an auth-token cache; reconsider if you need to surface storage
  errors to the user.
- **No thread-safety layer.** The `SecItem*` calls are themselves safe to call from
  any thread, but there's no serialization, so a concurrent `save` and `read` of the
  same key can race (you might read the old or new value). In practice these are
  driven from the auth flow on the main actor, so it hasn't mattered.
- **Default access group.** No `kSecAttrAccessGroup` is set, so items live in the
  app's default access group. Sharing with an app extension or another app would
  require adding the access group (and the Keychain Sharing entitlement).
- **Strings only.** The API is `String`-in / `String`-out. Storing non-UTF-8 binary
  would need a different surface.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/KeychainStore.swift` | Typed `save` / `read` / `delete` / `clearAll` over `kSecClassGenericPassword` | `Foundation`, `Security` (both system frameworks, nothing to swap) |

## Adaptation notes
- Change `service` (`"app.kosherconnect.session"`) to your own reverse-DNS string so
  items don't collide with another app reusing this file.
- Replace the `Key` enum cases (`bearerToken`, `appleUserID`) and their raw-value
  strings with whatever secrets you store. Versioned suffixes (`.v1`) let you rotate
  the storage format later without colliding with old items.
- Update `clearAll()` to delete every case you add (it enumerates them by hand).
- If you need biometric protection, add a `SecAccessControl` via
  `kSecAttrAccessControl` on the `save` attributes. If you need extension sharing,
  add `kSecAttrAccessGroup` plus the Keychain Sharing entitlement.
- No env vars, no migrations, no API keys. The only brand string is the `service`.

## Provenance
- Origin file: `rork-kosher-connect/ios/KosherConnect/Utilities/KeychainStore.swift` @ `8ac5474`
- Pairs with: the magic-link / Sign in with Apple auth flow (token is the BFF bearer; see `.agents/ios-specs/magic-link-auth.md` in origin repo)
- Related memory: `project_kosher_connect_ios_app_review.md` (free companion-app auth context)
