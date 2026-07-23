# Deterministic UUID from a Server ID (Swift)

> Derive the same UUID every time from an arbitrary stable string id, so models
> whose wire ids are not UUIDs still get a consistent local identity across
> fetches.

- **Slug:** `ios-deterministic-uuid-from-id`
- **Tags:** `ios`, `identity`, `data-modeling`
- **Source project:** Kosher Connect iOS
- **Stack:** Swift (Foundation + CryptoKit, no third-party deps)
- **Reuse confidence:** drop-in
- **Status in origin:** live in prod (v1.0 correctness fix)

## Problem it solves
When a backend returns non-UUID ids (here, cuids) but your local models are keyed
by `UUID`, `UUID(uuidString:)` fails and code tends to fall back to a fresh random
`UUID()` on every decode. That silently breaks any match-by-id behavior: in this app,
a spot saved in one fetch no longer matched its re-minted id on the next, so
saved / liked / RSVP badges flickered off.

## When to reach for this
- Your wire ids are stable strings but not valid UUIDs (cuid, nanoid, slug, numeric).
- Your local layer (SwiftData, Identifiable, diffable lists) wants a real `UUID`.
- You need the mapping to be stable across fetches and across multiple decode paths,
  without a lookup table.

## How it works
- SHA256 the UTF-8 bytes of the server id, take the first 16 bytes.
- Stamp the version nibble (0x50, "version 5" style) and the RFC 4122 variant bits,
  then construct a `UUID` from those 16 bytes.
- Same input string always yields the same `UUID`; different inputs effectively never
  collide (SHA256 over the id space).

## Data model
Stateless pure function. No storage, no lookup table. The raw server id is never
exposed by the helper.

## Key decisions & gotchas
- **Hash, do not store a map.** A deterministic hash means any decode path derives the
  same id with zero shared state. A lookup table would have to be threaded everywhere.
- **It is name-based (v5-style), not random (v4).** Do not use this where you need
  unpredictability or uniqueness guarantees beyond the input; it is a deterministic
  projection, by design.
- **One-way.** You cannot recover the server id from the UUID. If you later need the
  raw id (e.g. to call the API), keep it alongside, do not try to reverse this.
- **Migration note from origin:** this is the v1.0 fix; the planned v1.1 re-keys models
  to `Set<String>` on the raw server id and retires this helper. Reach for the re-key
  if you are starting fresh and can hold string ids end to end.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/StableID.swift` | `stableUUID(from:)` deterministic UUID derivation | none (Foundation + CryptoKit) |

## Adaptation notes
- Drop in as-is. Call `stableUUID(from: dto.id)` wherever you map a DTO to a local
  model keyed by `UUID`.
- If you would rather avoid UUIDs entirely, prefer re-keying your models to the raw
  string id (the v1.1 direction) instead of adopting this.

## Provenance
- Origin file: `rork-kosher-connect/ios/KosherConnect/Networking/StableID.swift` @ `8ac5474`
- Related features: [[ios-api-client]]
