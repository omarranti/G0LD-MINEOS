# PostHog Server-Side Capture

> A tiny `captureServer()` that fires PostHog events from webhooks and crons onto the same person timeline as the user's browser events, without adding an SDK, and without ever being able to break the caller.

- **Slug:** `posthog-server-capture`
- **Tags:** `analytics, posthog, server, webhooks, events`
- **Source project:** web app
- **Stack:** TypeScript (Node / edge runtime), no SDK, just `fetch`
- **Reuse confidence:** drop-in
- **Status in origin:** live in prod

## Problem it solves
Your most important conversion events often happen where there is no browser: a Stripe webhook confirms payment, a cron ends a trial, a background job fulfils an order. The PostHog browser SDK cannot see any of these. Pulling in the Node SDK for three `fetch` calls is overkill, and worse, a naive server capture can throw or hang and take the webhook down with it.

## When to reach for this
- You already use PostHog client-side and want server-only moments (payment, trial-end, fulfilment) on the same funnel.
- You want those events attributed to the *same person*, not a separate anonymous id.
- You need analytics that is strictly best-effort: it must never be the reason a webhook 500s or a cron stalls.

## How it works
1. **Raw HTTP, no SDK.** POST to the PostHog `/capture/` endpoint with the public project key. That is the entire dependency surface: `fetch`.
2. **Same key, same person.** Use the same `NEXT_PUBLIC_POSTHOG_KEY` the client uses, and pass the app's user id as `distinct_id`. As long as the client identifies the user by that same id, the server event merges onto their timeline.
3. **Tag the source.** `properties.$lib = "app-server"` so you can separate server events from client SDK events in queries.
4. **Fail safe, always.** No key -> silently return. Any error -> swallow and `console.debug`. A 3s `AbortSignal.timeout` caps how long a slow analytics host can hold the caller.
5. **Say something about location, always.** Emit exactly one of `$ip` (the real person's IP, so PostHog geolocates them) or `$geoip_disable: true` (record no location). Emitting neither is the bug described below.

## Data model
Stateless. Env: `NEXT_PUBLIC_POSTHOG_KEY`. Region host is `us.i.posthog.com` (use `eu.i.posthog.com` for EU projects).

## Key decisions & gotchas
- **Server-side capture geolocates your DATACENTER, not your user.** PostHog
  geolocates whichever IP posts to `/capture/`. A server capture posts from your
  serverless function, so every event gets stamped with the datacenter's city. In
  the origin app this filed every OAuth signup in the project's history under
  Ashburn, Virginia (us-east-1). Nothing surfaced it, because a wrong city is
  indistinguishable from a real one in a breakdown. The fix is the exactly-one-of
  rule: pass `$ip` when you have the person's IP, `$geoip_disable` when you do not.
  Emitting neither is the failure mode.
- **This data is not repairable after the fact.** Captured events cannot be edited
  in PostHog, so any pre-fix events carry a fabricated location forever. Fixing
  this is forward-only, and historical location breakdowns need a date floor.
- **Take the RIGHTMOST `x-forwarded-for` entry, not the leftmost.** The leftmost is
  client-forgeable, so trusting it lets a caller pick its own city (and defeat any
  IP-keyed throttle built on the same helper). Prefer the platform-set `x-real-ip`.
- **Only callers inside a user's request have an IP to give.** Auth callbacks and
  route handlers do (the person's IP is still on the request headers). Stripe
  webhooks and crons do not, and correctly get GeoIP disabled.
- **`distinct_id` must be the SAME id the client identifies with.** If the client calls `posthog.identify(user.id)` and the server sends `distinct_id: user.id`, they merge. Send an email or a random id here and you get a split person and broken funnels.
- **Best-effort is a hard rule, not a nicety.** This is called from webhooks; if capture can throw, one PostHog blip fails payments. The empty catch is deliberate.
- **The timeout matters.** Without `AbortSignal.timeout`, a hung analytics request holds your webhook handler open and can cascade into provider retries.
- **Public key only.** The capture endpoint takes the public project key (safe client-side too). No private/personal API key belongs in this path.
- **Deliberately not included:** feature-flag evaluation, batching/flushing, and `$identify`/`$groupidentify` calls. Add the Node SDK if you need those.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/analytics-server.ts` | `captureServer(distinctId, event, properties, clientIp?)`: best-effort POST to PostHog with a timeout and the exactly-one-of GeoIP contract. | `NEXT_PUBLIC_POSTHOG_KEY`, `fetch` |
| `code/client-ip.ts` | `clientIpFromHeaders()`: platform-trusted client IP, rightmost-XFF fallback. Feeds `clientIp` above. | none (Web `Headers`) |

## Structure to keep, skin to drop
- **Keep (the idea):** raw `fetch` to `/capture/`, the same-key/same-distinct_id merge, the `$lib` source tag, and the swallow-plus-timeout safety.
- **Drop (regenerate natively):** the `$lib` label value, the region host if you are on EU, and the exact property typing.

## Adaptation notes
- Confirm your client SDK calls `identify(userId)` with the same id you pass as `distinctId` here.
- Call it from webhook/cron handlers after the state change commits: `await captureServer(userId, "payment_succeeded", { plan })`. These have no client IP, so they land on `$geoip_disable` and that is correct.
- From inside a user's request, pass the IP: `await captureServer(userId, "signup_completed", { method }, clientIpFromHeaders(await headers()))`. Wrap the header read in try/catch and fall back to `null`, since the request context is absent in some execution paths.
- If you already have an IP-keyed rate limiter, share `clientIpFromHeaders()` with it so the two cannot disagree about who the caller is.
- EU project? Change the host to `eu.i.posthog.com`.
- Self-hosting? Point `POSTHOG_CAPTURE_URL` at your instance.

## Provenance
- Origin file: `src/lib/analytics-server.ts` @ `origin/main` (web app, live). Genericized: `$lib` value renamed; logic unchanged.
- GeoIP contract + `client-ip.ts` added from `3f7b99b` (2026-08-30), "Stop server-side captures geolocating the datacenter instead of the user".
- Related features: [[stripe-subscription-webhook]], [[utm-and-appstore-attribution]], [[consent-gated-analytics]]
- Related memory: PostHog project + server attribution.
