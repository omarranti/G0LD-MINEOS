# Vercel Platform Config (crons, security headers, CSP, canonical redirect)

> One `vercel.json` carrying the four things that are easy to leave off a Next.js
> deploy and expensive to add later: a scheduled-job fleet, security headers, a
> real CSP, and the host redirect that keeps the search index single-source.

<!-- GUIDING PRINCIPLE: capture the STRUCTURE, not the skin. The reusable value is
the idea, the data model, the logic, the contracts, the flow. -->

- **Slug:** `vercel-platform-config`
- **Tags:** `vercel`, `config`, `cron`, `security-headers`, `csp`, `redirects`, `caching`, `seo`
- **Source project:** directory / marketplace web app
- **Stack:** Vercel + Next.js (`vercel.json`)
- **Reuse confidence:** adapt-the-shape (the header block is close to drop-in; the cron fleet is entirely app-specific)
- **Status in origin:** live in prod, 19 crons

## Problem it solves
Four unrelated platform concerns have no natural home in application code, so
they get skipped:

1. **Scheduled work.** Lifecycle email, digests, cleanup, and data sync all need a
   cron. Adding a separate scheduler service for this is overkill when the host
   can hit your own routes.
2. **Security headers.** Clickjacking, MIME sniffing, referrer leakage, and
   feature-policy defaults are one config block that almost nobody writes until an
   audit asks.
3. **CSP.** Every third-party script silently widens your attack surface, and a
   CSP written after the fact means auditing dozens of integrations at once.
4. **Host canonicalization.** `www` and apex both resolving means the search index
   splits across two origins.

## When to reach for this
- Standing up a new Next.js app on Vercel and you want the platform layer right on day one.
- You need scheduled jobs and are about to add a worker service for something the host does natively.
- A security review just asked for headers and a CSP.
- Both `www` and apex serve your site.

## How it works
- **Crons are route hits, not workers.** Each entry maps a schedule to a path
  under `/api/cron/*`. The route is a normal handler, so it shares the app's
  database client, env, and deploy lifecycle, and is testable locally by curling it.
- **Send times are staggered, not stacked.** The fleet runs across the day rather
  than all at midnight, and the user-facing sends cluster in the recipients'
  daytime while cleanup and purge jobs run overnight.
- **Weekday-only schedules use `0-5`.** Several sends deliberately skip one weekend
  day, which is the schedule doing quiet-window work the application does not have
  to. See [[calendar-quiet-windows]] for the in-app version of that idea.
- **Headers are applied by path prefix**, most general first: a site-wide security
  block, then an immutable one-year cache for fingerprinted `/_next/static/*`
  assets, then a shorter one for the favicon.
- **The CSP is an allowlist that names every third party.** Adding an analytics or
  maps vendor means editing this line, which is exactly the friction you want.
- **`frame-ancestors 'none'`** backs up `X-Frame-Options` for modern browsers.
- **The `www` to apex redirect is permanent and host-conditional**, expressed with
  a `has` host matcher so it fires only on the wrong host.
- **A rewrite maps `/sitemap.xml` to `/sitemap-index.xml`**, so the conventional
  URL search engines look for serves an index of split sitemaps.

## Data model
Configuration only, no runtime state. Four blocks: `crons`, `redirects`,
`rewrites`, `headers`.

## Key decisions & gotchas
- **Vercel crons have plan limits.** Hobby allows very few and only daily
  granularity; the 19 here need a paid plan. Check the ceiling before designing a
  fleet, because the failure is a deploy-time rejection.
- **Cron routes are publicly reachable URLs.** Vercel sends a bearer token in
  `Authorization` for scheduled invocations. **Verify it inside every handler.**
  Nothing in this file protects those paths, and an unguarded `/api/cron/user-purge`
  is a destructive endpoint anyone can call.
- **Crons fire against production only**, so a schedule change cannot be validated
  in preview. Keep handlers idempotent and give them a manual trigger.
- **`unsafe-inline` and `unsafe-eval` in `script-src` substantially weaken the CSP.**
  They are here because Next's inline bootstrap and some vendor SDKs require them.
  This is a real trade, not a best practice, and a nonce-based CSP is the stricter
  path if you can afford the work.
- **`img-src https:` is effectively open.** Convenient for user-supplied and CDN
  images, and worth tightening to named hosts if your image sources are known.
- **A CSP mistake is invisible until it is catastrophic**, because the browser
  blocks silently unless you are watching the console. Ship it in report-only mode
  first if the app is already live.
- **`geolocation=(self)`** must stay `self` rather than `()` if any feature asks
  for location; `()` disables it for your own origin too.
- **Long-cache only fingerprinted assets.** `max-age=31536000, immutable` on
  `/_next/static/*` is safe because the filenames hash. Applying it to a stable
  path pins a stale file in every CDN and browser for a year.
- **Deliberately not handled:** per-region config, edge middleware matchers (see
  [[admin-gate-edge-middleware]]), and function memory or duration overrides.

## Code layer

| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/vercel.json` | The full config: 19 staggered crons, the `www` to apex permanent redirect, the sitemap rewrite, and three header blocks including the CSP. | every cron path, the hostnames, the CSP third-party allowlist |

## Structure to keep, skin to drop
- **Keep (the idea):** crons as authenticated route hits, staggered scheduling with
  overnight maintenance and daytime sends, the security header block, a CSP written
  as an explicit vendor allowlist, host-conditional canonical redirect, and
  cache-control tiered by whether the filename is fingerprinted.
- **Drop (regenerate natively):** all 19 cron paths and their times, both
  hostnames, the third-party origins in the CSP, and the favicon rule.

## Adaptation notes
- Replace every hostname. Two appear: the `www` matcher and the redirect destination.
- Delete the entire `crons` array and add only jobs you actually have. An entry
  pointing at a non-existent route fails at deploy time.
- **Add the cron bearer-token check to every handler before shipping any of them.**
  This is the step most likely to be skipped and the one with the worst downside.
- Rebuild the CSP from your own vendor list. Start in report-only, watch for a
  week, then enforce.
- Confirm your plan's cron allowance and minimum interval.
- If your sitemap is a single file, drop the rewrite rather than leaving a
  redirect to a path you never created.
- Pair with [[post-deploy-production-smoke]] so a config change that breaks a real
  user flow surfaces immediately.

## Provenance
- Origin file: `vercel.json` @ `origin/main` (captured 2026-08-31).
  Genericized: hostnames.
- Related features: [[post-deploy-production-smoke]],
  [[github-actions-app-scheduler]], [[calendar-quiet-windows]],
  [[admin-gate-edge-middleware]]
