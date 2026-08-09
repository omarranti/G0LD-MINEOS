/**
 * Auto-approve ListingClaim submissions when the claimant's email domain
 * matches the listing's website domain. Instant verification for the common
 * case (the business has a real website at its own domain); everything else
 * falls through to the manual /admin/claims queue.
 */

export const AUTO_APPROVE_MARKER =
  "Auto-approved: claimant email domain matches listing website";

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "msn.com",
  "gmx.com",
  "fastmail.com",
  "duck.com",
]);

const SOCIAL_OR_LINK_HOSTS = new Set([
  "instagram.com",
  "facebook.com",
  "fb.com",
  "linktr.ee",
  "linkin.bio",
  "beacons.ai",
  "bio.link",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "youtu.be",
  "yelp.com",
  "google.com",
  "maps.google.com",
  "g.page",
  "wa.me",
  "bit.ly",
]);

/** Normalize a URL or hostname to a bare lowercase host with no leading www. */
export function extractHost(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+\-.]*:\/\//.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    let host = u.hostname;
    if (host.startsWith("www.")) host = host.slice(4);
    return host || null;
  } catch {
    return null;
  }
}

/** Extract the lowercase domain from an email address. */
export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase() || null;
}

/**
 * True when emailHost is the same as, or a subdomain of, websiteHost.
 * `mail.joesdeli.com` matches `joesdeli.com`. The reverse does NOT match:
 * a site at `subdomain.gmail.com` would never validate ownership.
 */
export function hostMatches(emailHost: string, websiteHost: string): boolean {
  if (emailHost === websiteHost) return true;
  return emailHost.endsWith("." + websiteHost);
}

export interface AutoApproveInput {
  listingWebsite: string | null | undefined;
  claimantEmail: string | null | undefined;
}

export function shouldAutoApprove({
  listingWebsite,
  claimantEmail,
}: AutoApproveInput): boolean {
  const webHost = extractHost(listingWebsite);
  const emailHost = emailDomain(claimantEmail);
  if (!webHost || !emailHost) return false;
  if (SOCIAL_OR_LINK_HOSTS.has(webHost)) return false;
  if (FREE_EMAIL_DOMAINS.has(emailHost)) return false;
  return hostMatches(emailHost, webHost);
}
