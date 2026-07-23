import Foundation
import CryptoKit

/// Derive a deterministic `UUID` from a stable server identifier.
///
/// Wire ids are cuids, not UUIDs, so `UUID(uuidString:)` always failed and the
/// mappers fell back to a fresh random `UUID()` on every decode. That broke
/// saved / liked / RSVP badge matching: a spot saved in one fetch no longer
/// matched its re-minted id on the next. Hashing the server id yields the same
/// `UUID` for the same entity across fetches and across both decode paths.
///
/// v1.1 cross-device-sync replaces this with a full re-key to `Set<String>` on
/// the server id (see `.agents/ios-specs/_ideas/server-id-rekey.md`). This
/// helper is the v1.0 correctness fix; it does not expose the raw server id.
func stableUUID(from serverID: String) -> UUID {
    let digest = SHA256.hash(data: Data(serverID.utf8))
    var bytes = [UInt8](digest.prefix(16))
    bytes[6] = (bytes[6] & 0x0F) | 0x50  // version 5
    bytes[8] = (bytes[8] & 0x3F) | 0x80  // RFC 4122 variant
    return UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3],
                       bytes[4], bytes[5], bytes[6], bytes[7],
                       bytes[8], bytes[9], bytes[10], bytes[11],
                       bytes[12], bytes[13], bytes[14], bytes[15]))
}
