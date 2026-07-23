import { cookies } from 'next/headers';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { type TeamMember, ADMIN_MEMBERS, isAdmin } from './team-members';
import { db } from './db';
import { userPins } from './schema';
import { verifyPin } from './pin-hash';

export { type TeamMember, ADMIN_MEMBERS, isAdmin };

const TEAM_PINS: Record<string, TeamMember> = {
  TEAM_PIN_OMAR: 'Sam',
  TEAM_PIN_KYLE: 'Kyle',
  TEAM_PIN_ANTON: 'Anton',
  TEAM_PIN_IVAN: 'Ivan',
  TEAM_PIN_AZZARO: 'Azzaro',
};

const VALID_MEMBERS: TeamMember[] = ['Sam', 'Kyle', 'Anton', 'Ivan', 'Azzaro'];

// The HMAC input that turns a (member, current PIN state) into a cookie token.
// For DB-overridden members, we use the scrypt salt as the seed: rotating the
// PIN rotates the salt, which invalidates every cookie minted against the old
// PIN. For env-only members, we keep the original member:envPin seed.
async function cookieSeed(member: TeamMember): Promise<string | null> {
  const rows = await db.select().from(userPins).where(eq(userPins.member, member)).limit(1);
  if (rows[0]) {
    const parts = rows[0].pinHash.split('$');
    if (parts.length === 4) return `db:${parts[2]}`; // salt hex
  }
  const env = process.env[`TEAM_PIN_${member.toUpperCase()}`];
  return env ? `env:${env}` : null;
}

const COOKIE_TOKEN = 'therma_team_token';
const COOKIE_USER = 'therma_team_user';
const EXPIRY_DAYS = 7;

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against self to burn same time, then return false
    const buf = Buffer.from(a);
    crypto.timingSafeEqual(buf, buf);
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

async function checkOne(pin: string, member: TeamMember): Promise<boolean> {
  // DB hash takes precedence when present.
  const rows = await db.select().from(userPins).where(eq(userPins.member, member)).limit(1);
  if (rows[0]) return verifyPin(pin, rows[0].pinHash);
  const env = process.env[`TEAM_PIN_${member.toUpperCase()}`];
  if (!env) return false;
  return timingSafeCompare(pin, env);
}

export async function validatePin(pin: string, member?: TeamMember): Promise<TeamMember | null> {
  if (member) {
    return (await checkOne(pin, member)) ? member : null;
  }
  for (const m of VALID_MEMBERS) {
    if (await checkOne(pin, m)) return m;
  }
  return null;
}

function deriveTokenFromSeed(member: TeamMember, seed: string): string {
  const secret = process.env.TEAM_TOKEN_SECRET;
  if (!secret) throw new Error('TEAM_TOKEN_SECRET env var is required');
  return crypto.createHmac('sha256', secret).update(`${member}:${seed}`).digest('hex');
}

export async function getAuthenticatedUser(): Promise<TeamMember | null> {
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get(COOKIE_TOKEN);
    const userCookie = cookieStore.get(COOKIE_USER);

    if (!tokenCookie || !userCookie) return null;

    const member = userCookie.value as TeamMember;
    if (!VALID_MEMBERS.includes(member)) return null;

    const seed = await cookieSeed(member);
    if (!seed) return null;

    const expected = deriveTokenFromSeed(member, seed);
    if (!timingSafeCompare(tokenCookie.value, expected)) return null;

    return member;
  } catch {
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getAuthenticatedUser()) !== null;
}

export async function buildSessionCookies(member: TeamMember, _pin: string): Promise<string[]> {
  const seed = await cookieSeed(member);
  if (!seed) throw new Error(`no pin source for ${member}`);
  const token = deriveTokenFromSeed(member, seed);
  const expires = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const base = `Path=/; HttpOnly; SameSite=Strict${secure}; Expires=${expires.toUTCString()}`;

  return [
    `${COOKIE_TOKEN}=${token}; ${base}`,
    `${COOKIE_USER}=${member}; ${base}`,
  ];
}

export function buildLogoutCookies(): string[] {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const base = `Path=/; HttpOnly; SameSite=Strict${secure}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;

  return [
    `${COOKIE_TOKEN}=; ${base}`,
    `${COOKIE_USER}=; ${base}`,
  ];
}
