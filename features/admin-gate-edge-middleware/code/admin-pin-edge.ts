/**
 * Edge-safe admin PIN cookie verification, used by src/middleware.ts.
 *
 * Must stay importable in the Edge runtime: WebCrypto only, no node:crypto,
 * no next/headers. Signature scheme is identical to adminPinCookieValue() in
 * admin-pin-gate.ts (HMAC-SHA256 hex of "admin-pin-gate:<pin>"); the parity
 * test in tests/unit/admin-pin-edge.test.ts pins the two together.
 *
 * Divergence by design: where the node gate throws on a missing production
 * secret, this returns "" so middleware fails CLOSED (redirect to the PIN
 * page) instead of 500ing every admin request.
 */

export const ADMIN_PIN_COOKIE = "app_admin_pin";

function pinCode(): string | null {
  const pin = process.env.ADMIN_PIN?.trim();
  if (pin) return pin;
  if (process.env.NODE_ENV !== "production") return "1980";
  return null;
}

function gateSecret(): string | null {
  const secret = process.env.AUTH_SECRET || process.env.APP_ADMIN_PIN_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "app-admin-pin-dev-only-change-in-production";
  }
  return null;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Expected signed cookie value; "" when PIN or secret is unconfigured. */
export async function expectedAdminPinCookieValue(): Promise<string> {
  const pin = pinCode();
  const secret = gateSecret();
  if (!pin || !secret) return "";
  return hmacHex(secret, `admin-pin-gate:${pin}`);
}

/** Constant-time comparison over same-length strings; false on length mismatch. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyAdminPinCookieValue(candidate: string): Promise<boolean> {
  if (!candidate) return false;
  const expected = await expectedAdminPinCookieValue();
  if (!expected) return false;
  return timingSafeEqualHex(candidate, expected);
}
