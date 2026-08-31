import { prisma } from "@/lib/db";

/**
 * Per-email marketing opt-out, backing the one-click unsubscribe link.
 *
 * Keyed by email address (not userId) so the link works for a recipient who
 * is not signed in, and so the suppression is honored even before the account
 * row is loaded. A row in EmailOptOut for (email, type) -- or (email, "all") --
 * means "do not send this type of mail to this address."
 *
 * Transactional mail (receipts, security, account lifecycle) must NOT call
 * this; opt-out governs promotional/lifecycle broadcasts only.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The one unsubscribe-URL builder. Every footer link and every
 * List-Unsubscribe header in the codebase resolves through this.
 *
 * It lives here rather than in a template module because the `type` it
 * encodes is the same scope isOptedOut() reads back. Two builders meant two
 * URL shapes, and one of them pointed at a route that does not exist, so
 * seven footers 404'd while the opt-out they promised was never recorded.
 */
export function unsubscribeUrl(email: string, type = "marketing"): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://example.com";
  return `${base}/api/unsubscribe?email=${encodeURIComponent(email)}&type=${type}`;
}

/** True if this address has opted out of `type` (or of "all" mail). */
export async function isOptedOut(email: string, type: string): Promise<boolean> {
  const e = normalizeEmail(email);
  const row = await prisma.emailOptOut.findFirst({
    where: { email: e, type: { in: [type, "all"] } },
    select: { id: true },
  });
  return row !== null;
}

/** Record an opt-out. Idempotent on (email, type). */
export async function recordOptOut(email: string, type: string): Promise<void> {
  const e = normalizeEmail(email);
  if (!e) return;
  await prisma.emailOptOut.upsert({
    where: { email_type: { email: e, type } },
    update: {},
    create: { email: e, type },
  });
}
