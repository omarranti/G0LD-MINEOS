# Recently-Viewed Listings Tracker

> A localStorage-backed ring buffer that remembers the last N listings a visitor
> opened, most-recent-first, with zero auth and zero server round-trips.

- **Slug:** `recently-viewed`
- **Tags:** `ux`, `personalization`, `engagement`
- **Source project:** Kosher Connect web
- **Stack:** Next.js 15 App Router + React 19 (browser-only module, no Prisma / no API)
- **Reuse confidence:** drop-in (rename the storage key and the entry shape, nothing else)
- **Status in origin:** live in prod

## Problem it solves
Visitors browse a directory, open a few listings, then want to find the one they
saw two clicks ago. Asking them to sign in to get history kills the casual-browse
flow. This gives every visitor a personal "recently viewed" strip with no account,
no database row, and no privacy surface (the data never leaves the device).

## When to reach for this
- You want a "recently viewed" / "continue where you left off" strip and most of
  your traffic is anonymous.
- You do NOT want to write per-visit rows to a database (cheap, private, no cron
  cleanup).
- The history is a convenience, not a system of record. Losing it on a cache clear
  is fine.
- You need it to be safe to import into a server component file (it no-ops on the
  server instead of throwing).

## How it works
- Single browser module backed by one `localStorage` key. No cookies, no server,
  no React context.
- `trackRecentlyViewed(listing)` is the write path: read the current list, drop any
  entry with the same `id`, unshift the new one (stamped with an ISO `viewedAt`),
  then `slice(0, MAX_ENTRIES)`. That is the whole ring-buffer behavior: dedupe by
  id, most-recent-first, hard cap at 24.
- `getRecentlyViewed()` is the read path; `clearRecentlyViewed()` wipes the key.
- Every entry point guards on `isBrowser()` (checks `window` and `localStorage`),
  so the module is import-safe in SSR / server components and simply does nothing
  there.
- Reads are defensively parsed: bad JSON, non-arrays, and malformed entries are
  filtered out rather than trusted, so a corrupted key degrades to an empty list
  instead of crashing the page.

## Data model
Stateless on the server. Client-only, one `localStorage` key:

```
key:   "kc_recently_viewed_v1"
value: JSON array, newest-first, max 24 entries

RecentlyViewedEntry {
  id:       string   // listing id, used as the dedupe key
  slug:     string
  name:     string
  city:     string
  viewedAt: string   // ISO timestamp, set at track() time
}
```

The `_v1` suffix on the key is a manual schema version. Bumping it (to `_v2`)
cleanly orphans the old shape if `RecentlyViewedEntry` ever changes.

## Key decisions & gotchas
- **localStorage, not a cookie.** This data never needs to reach the server, so a
  cookie would just be dead weight on every request (and a privacy / consent
  surface). If you DO need the server to read it (SSR personalization), this is the
  wrong storage medium, switch to a cookie and accept the request-size cost.
- **Dedupe key is `id`, and the new visit wins position.** Re-viewing an existing
  listing removes the old entry and re-inserts at the front, so the list is true
  recency order, never "first seen" order.
- **Cap is 24, enforced on every write** via `slice`, so the array can never grow
  unbounded.
- **SSR access is the main trap.** Calling these from a server component would throw
  on `localStorage`. The `isBrowser()` guard turns every function into a safe no-op
  on the server (reads return `[]`), so it can be imported anywhere. Practically,
  call `track` from a click handler / `useEffect`, not during render.
- **Writes swallow quota-exceeded errors silently.** If `localStorage` is full, the
  write is dropped with no throw and no user-visible error. Acceptable because the
  feature is non-critical; do not copy this swallow pattern for data that matters.
- **Validation is intentionally loose.** `readAll` checks `id`/`slug`/`name`/`viewedAt`
  are strings but does NOT require `city` (older entries written before `city`
  existed still parse). That is a deliberate forward/backward-compat choice, not an
  oversight.
- **Private by construction.** Because nothing is sent to a server, there is no
  history leak, no GDPR data-subject row, and clearing browser data fully erases it.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/recently-viewed.ts` | Full feature: track / get / clear over one localStorage key, SSR-safe guards, defensive parse | none (zero imports, drop-in) |

## Adaptation notes
- The module has **no imports**, copy it as-is. The only edits a new project needs:
  - Rename `STORAGE_KEY` to your namespace (and keep the `_v1` versioning habit).
  - Reshape `RecentlyViewedEntry` to your domain object, and update the field checks
    in `readAll`'s filter to match the fields you actually require.
  - Tune `MAX_ENTRIES`.
- Call sites in origin: the listing-card click handler and the listing detail page
  call `trackRecentlyViewed`; the `/account` "Recently viewed" panel calls
  `getRecentlyViewed`. Wire your equivalents.
- If you need this readable on the server (e.g. to render the strip in SSR without a
  client flash), this is the wrong medium, move to a cookie and re-add the
  request-size / consent trade-offs.

## Provenance
- Origin file: `kosher-connect-web/src/lib/recently-viewed.ts` @ `457d8e1`
- Pairs with: listing-card click handler, listing detail page, `/account` recently-viewed panel
- Related features: [[claim-with-domain-auto-approve]]
