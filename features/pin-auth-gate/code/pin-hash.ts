import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const N = 16384;
const KEY_LEN = 32;
const SALT_LEN = 16;

// Hash format: 'scrypt$<N>$<saltHex>$<derivedHex>'
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derived = (await scryptAsync(pin, salt, KEY_LEN)) as Buffer;
  return `scrypt$${N}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const n = parseInt(parts[1], 10);
  if (!Number.isFinite(n) || n <= 0) return false;
  const salt = Buffer.from(parts[2], 'hex');
  const expected = Buffer.from(parts[3], 'hex');
  if (expected.length !== KEY_LEN) return false;
  // n is recorded for future migration but with default scrypt params we just verify.
  void n;
  const derived = (await scryptAsync(pin, salt, KEY_LEN)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
