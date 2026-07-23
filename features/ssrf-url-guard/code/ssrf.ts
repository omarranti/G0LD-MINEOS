// SSRF guard for server-side fetches of user-supplied URLs.
// Validates scheme, resolves DNS, and rejects any address in a private,
// loopback, link-local (incl. cloud metadata 169.254.169.254), or reserved
// range. Use safeFetch() so redirects are re-validated hop-by-hop — a public
// URL that 30x-redirects to an internal host is the classic bypass.

import { lookup } from 'node:dns/promises';

function ipv4InBlockedRange(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // malformed → block
  const [a, b] = p;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0 && p[2] === 0) return true; // 192.0.0.0/24
  if (a >= 224) return true; // multicast/reserved 224.0.0.0+
  return false;
}

function ipv6InBlockedRange(ip: string): boolean {
  const v = ip.toLowerCase().split('%')[0];
  if (v === '::1' || v === '::') return true; // loopback / unspecified
  if (v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd')) return true; // link-local / ULA
  const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return ipv4InBlockedRange(mapped[1]);
  return false;
}

function isBlockedAddress(ip: string, family: number): boolean {
  return family === 6 ? ipv6InBlockedRange(ip) : ipv4InBlockedRange(ip);
}

/**
 * Validates an external URL is safe to fetch server-side.
 * Throws if the scheme is not http(s) or the host resolves to a blocked range.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed');
  }
  // Reject IP-literal hosts that are private, plus obvious internal names.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Blocked host');
  }
  const results = await lookup(host, { all: true });
  if (results.length === 0) throw new Error('Host does not resolve');
  for (const { address, family } of results) {
    if (isBlockedAddress(address, family)) throw new Error('Blocked address range');
  }
  return parsed;
}

/**
 * fetch() that re-validates every redirect hop against the SSRF guard.
 * Caps at maxHops to avoid loops.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  maxHops = 3,
): Promise<Response> {
  let url = rawUrl;
  for (let hop = 0; hop <= maxHops; hop++) {
    await assertPublicHttpUrl(url);
    const res = await fetch(url, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, url).href;
      continue;
    }
    return res;
  }
  throw new Error('Too many redirects');
}
