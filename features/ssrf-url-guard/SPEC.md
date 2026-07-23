# SSRF-Safe URL Guard

> Validate a user-supplied URL before fetching it server-side, rejecting any host
> that resolves to a private, loopback, link-local, or cloud-metadata address, and
> re-checking every redirect hop so a public URL can't bounce you into the internal network.

- **Slug:** `ssrf-url-guard`
- **Tags:** `security`, `ssrf`, `server`
- **Source project:** Therma (therma.one website)
- **Stack:** Next.js 14 App Router, Node.js runtime, `node:dns/promises` (zero npm deps)
- **Reuse confidence:** drop-in (one file, no imports beyond Node's stdlib `node:dns`)
- **Status in origin:** live in prod (powers the `/api/link-preview` OG-scraping route)

## Problem it solves
Any server endpoint that fetches a URL the user controls (link previews, webhook
testers, "import from URL", avatar-by-URL, OG scrapers) is a Server-Side Request
Forgery hole. An attacker passes `http://169.254.169.254/...` (the AWS/GCP metadata
endpoint) or `http://localhost:6379` and your server, sitting inside the trusted
network, makes the request for them. This guard is the gate every such fetch goes through.

## When to reach for this
- You have a server route that does `fetch(userSuppliedUrl)` for any reason.
- You need to block private RFC-1918 ranges, loopback, and the `169.254.169.254`
  cloud-metadata address specifically.
- You want redirect-following but safely, so a public URL that 302s to an internal
  host gets caught on the second hop.
- You want this with no dependency to vet (it's pure Node stdlib).

## How it works
- `assertPublicHttpUrl(rawUrl)` parses the URL, requires `http:`/`https:` (no
  `file:`, `gopher:`, `ftp:`, `data:`), and rejects obvious internal names by string
  (`localhost`, `*.local`, `*.internal`) before any network call.
- It then DNS-resolves the host with `lookup(host, { all: true })` and checks every
  returned address. This is the key move: blocking by hostname alone is useless because
  `evil.com` can have an A record pointing at `10.0.0.5`. You must resolve, then judge the IP.
- IPv4 blocklist covers `10/8`, `127/8`, `0/8`, `169.254/16` (link-local incl.
  metadata), `172.16/12`, `192.168/16`, `100.64/10` (CGNAT), `192.0.0/24`, and
  `224.0.0.0+` (multicast/reserved). Malformed IPs fail closed (blocked).
- IPv6 blocklist covers `::1`, `::`, `fe80` (link-local), `fc`/`fd` (ULA), and unwraps
  IPv4-mapped `::ffff:a.b.c.d` addresses back through the IPv4 check.
- `safeFetch(rawUrl, init, maxHops=3)` runs `assertPublicHttpUrl` on the first URL,
  fetches with `redirect: 'manual'`, and on a 3xx + `Location` re-validates the next
  URL before following it. Caps at `maxHops` and throws on overflow.

## Data model
Stateless. No tables, cookies, or flags. Pure functions over a URL string plus a live
DNS lookup. The only runtime input beyond the URL is whatever DNS returns at call time.

## Key decisions & gotchas
- **Resolve-then-judge, not name-matching.** The whole point is the `lookup()` call.
  A blocklist of hostnames is trivially bypassed by an attacker pointing their own
  domain's A record at an internal IP. The guard judges the resolved address, not the name.
- **DNS rebinding is only partially closed.** `safeFetch` resolves the host in
  `assertPublicHttpUrl`, then `fetch()` resolves it again independently. A fast-flipping
  DNS record (public on the first lookup, private on the fetch's lookup) can still slip
  through. Fully closing this needs pinning the validated IP into the actual connection
  (custom agent/socket), which this file does NOT do. Acceptable for low-stakes scraping;
  not acceptable for high-value internal networks without the pin.
- **Redirects are the classic bypass, and they're handled.** `redirect: 'manual'` plus
  per-hop re-validation is deliberate. A naive `fetch` with default redirect-following
  validates only the first URL and then cheerfully follows a 302 to `127.0.0.1`.
- **IPv4-mapped IPv6 is unwrapped on purpose.** `::ffff:127.0.0.1` would otherwise sail
  past an IPv4-only check; the regex catches it and re-runs the IPv4 logic.
- **Fail closed on malformed input.** A non-4-octet or out-of-range IPv4 returns
  `true` (blocked), not `false`. Better to reject a weird-but-valid host than admit a crafted one.
- **Not handled, deliberately:** no port allowlist (it will fetch `:6379` on a public
  host), no response-size cap (the caller's `AbortSignal.timeout` and own logic handle
  that), no DNS-pinning (see rebinding above). `maxHops` default is 3.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/ssrf.ts` | `assertPublicHttpUrl` (validate + DNS-resolve + range-check) and `safeFetch` (redirect-revalidating fetch). Private helpers `ipv4InBlockedRange`, `ipv6InBlockedRange`, `isBlockedAddress`. | `node:dns/promises` only (Node stdlib) |

## Adaptation notes
- Genuinely drop-in: copy `code/ssrf.ts`, import `safeFetch` (or `assertPublicHttpUrl`
  if you do the fetch yourself), done. No env vars, no schema, no keys.
- Must run on the **Node.js runtime**, not the Edge runtime. `node:dns/promises` is
  unavailable on Edge, so any consuming route needs `export const runtime = 'nodejs'`
  (or no edge opt-in). The origin route is `force-dynamic` on Node.
- Caller owns the timeout and the User-Agent. In origin, the consumer passes
  `signal: AbortSignal.timeout(10000)` and a `ThermaBot/1.0` UA. Set your own.
- If you need to allow a specific internal host (rare), add an allowlist check before
  the `lookup`, not after, and document why.
- For higher-stakes use, add a port allowlist (80/443) and pin the resolved IP into the
  connection to close the DNS-rebinding window.

## Provenance
- Origin file: `therma-site/lib/ssrf.ts` @ `52f65787`
- Consumed by: `therma-site/app/api/link-preview/route.ts` (`safeFetch` for OG-tag scraping)
- Related memory: none
