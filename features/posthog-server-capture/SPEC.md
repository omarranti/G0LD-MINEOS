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

## Data model
Stateless. Env: `NEXT_PUBLIC_POSTHOG_KEY`. Region host is `us.i.posthog.com` (use `eu.i.posthog.com` for EU projects).

## Key decisions & gotchas
- **`distinct_id` must be the SAME id the client identifies with.** If the client calls `posthog.identify(user.id)` and the server sends `distinct_id: user.id`, they merge. Send an email or a random id here and you get a split person and broken funnels.
- **Best-effort is a hard rule, not a nicety.** This is called from webhooks; if capture can throw, one PostHog blip fails payments. The empty catch is deliberate.
- **The timeout matters.** Without `AbortSignal.timeout`, a hung analytics request holds your webhook handler open and can cascade into provider retries.
- **Public key only.** The capture endpoint takes the public project key (safe client-side too). No private/personal API key belongs in this path.
- **Deliberately not included:** feature-flag evaluation, batching/flushing, and `$identify`/`$groupidentify` calls. Add the Node SDK if you need those.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/analytics-server.ts` | `captureServer(distinctId, event, properties)`: best-effort POST to PostHog with a timeout. | `NEXT_PUBLIC_POSTHOG_KEY`, `fetch` |

## Structure to keep, skin to drop
- **Keep (the idea):** raw `fetch` to `/capture/`, the same-key/same-distinct_id merge, the `$lib` source tag, and the swallow-plus-timeout safety.
- **Drop (regenerate natively):** the `$lib` label value, the region host if you are on EU, and the exact property typing.

## Adaptation notes
- Confirm your client SDK calls `identify(userId)` with the same id you pass as `distinctId` here.
- Call it from webhook/cron handlers after the state change commits: `await captureServer(userId, "payment_succeeded", { plan })`.
- EU project? Change the host to `eu.i.posthog.com`.
- Self-hosting? Point `POSTHOG_CAPTURE_URL` at your instance.

## Provenance
- Origin file: `src/lib/analytics-server.ts` @ `origin/main` (web app, live). Genericized: `$lib` value renamed; logic unchanged.
- Related features: [[stripe-subscription-webhook]], [[utm-and-appstore-attribution]], [[consent-gated-analytics]]
- Related memory: PostHog project + server attribution.
