# Stripe Subscription Webhook (idempotent, seat-aware)

> The one webhook handler that turns Stripe subscription events into upgraded users, without double-firing, silently dropping paid customers, or double-selling limited inventory.

<!-- Structure over skin: the value here is the decision set, not the plan names. -->

- **Slug:** `stripe-subscription-webhook`
- **Tags:** `payments, stripe, webhook, idempotency, subscriptions, concurrency`
- **Source project:** web app (subscription SaaS)
- **Stack:** Next.js 15 App Router (route handler) + Prisma + Postgres + Stripe SDK
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live in prod

## Problem it solves
Stripe fires subscription events (`invoice.paid`, `customer.subscription.deleted`, ...) at-least-once and out of order, from a raw HTTP POST you must authenticate yourself. A naive handler double-applies retried events, breaks the moment Stripe bumps its API version, and race-conditions when two payments land together. This is the handler that survives all three.

## When to reach for this
- You sell a subscription (or a capped "first N members" tier) through Stripe Checkout and need the backend to actually grant access when money moves.
- You've been bitten by, or want to pre-empt: duplicate webhook deliveries, Stripe API version bumps, or two buyers claiming the last seat.
- You need to fulfil buyers who paid *before* they had an account (anonymous checkout).

## How it works
1. **Signature first.** Verify `stripe-signature` against the **raw** request body (`req.text()`), never a re-serialized object. No signature or bad signature -> 400, nothing else runs.
2. **Idempotency by insert.** `INSERT INTO "StripeEvent"(id,...) ON CONFLICT (id) DO NOTHING`. If it affects 0 rows the event was already processed -> return `{idempotent:true}`. Every downstream handler is then free to assume it runs once.
3. **API-version resilience.** Read the subscription id from both `invoice.subscription` (pre-Basil) and `invoice.parent.subscription_details.subscription` (Basil, 2025-04-30+). See gotchas.
4. **User resolution fallback chain.** `metadata.userId` -> lookup by `stripeCustomerId` -> lookup by `customer_email` -> stash a `PendingCheckout` the signup flow claims later. Anonymous buyers never fall on the floor.
5. **Atomic seat claim.** For capped inventory, one `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1)` inside a transaction with the user upgrade. Concurrent payments grab different seats; sold-out cancels the sub so Stripe refunds.
6. **Cancel path.** `deleted`, or `updated` with `status=canceled`, downgrades to FREE and releases the seat back into inventory.
7. **Ack to stop retries.** Handled-but-noop cases (no subscription, unhandled type, best-effort email failed) return **200**, not an error, so Stripe doesn't re-enter the handler forever.

## Data model
```
StripeEvent      id (PK, = Stripe event id)   type   createdAt      -- the idempotency ledger
User             id   email   plan   stripeCustomerId   seatNumber   trialEndsAt
Seat             id (PK, 1..N)   userId (nullable)   claimedAt        -- capped inventory
PendingCheckout  stripeSessionId (unique)   stripeCustomerId   email   planType
```
The idempotency guarantee lives entirely in `StripeEvent` having `id` as its primary key.

## Key decisions & gotchas
- **The Basil trap (the expensive one).** Stripe API "Basil" moved `invoice.subscription` under `invoice.parent.subscription_details.subscription`. If you read only the old field on a post-Basil account, `subId` is `null`, the handler returns "no subscription," and **every subscription payment silently no-ops**. Paid users stay unfulfilled with zero errors logged. Read both shapes.
- **Idempotency is one insert, not per-handler dedupe.** The `ON CONFLICT DO NOTHING` gate up front means nothing below has to be individually idempotent.
- **`FOR UPDATE SKIP LOCKED` over `SELECT ... LIMIT 1` then update.** The naive version hands the same seat to two concurrent transactions. SKIP LOCKED makes each grab the next unlocked free row.
- **Return 200 on best-effort failures.** A failed reminder email or a deal-row deleted between checkout and webhook (Prisma P2025) must not 500. Stripe would retry into the already-recorded event and thrash.
- **Deliberately not handled:** proration math, multi-item invoices, dunning/`invoice.payment_failed` (that's a separate retention flow), and partial refunds.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/route.ts` | The `POST` handler: verify -> idempotency insert -> `invoice.paid` (resolve user, claim seat, activate) / cancel -> downgrade | `@/lib/db` (Prisma), `@/lib/stripe` (`getStripe()`), `@/lib/audit-log`, `stripe`, `STRIPE_WEBHOOK_SECRET` |

## Structure to keep, skin to drop
- **Keep (the idea):** raw-body signature check, the `StripeEvent` idempotency insert, the dual-shape subscription read, the user-resolution fallback chain, the SKIP LOCKED seat claim inside a transaction, the 200-to-stop-retries discipline.
- **Drop (regenerate natively):** the plan names (`premium_annual`, `MONTHLY`), the seat/inventory concept if you don't sell capped tiers, the specific `metadata` keys, and the audit-log event strings. The origin also multiplexes several offer types off `metadata.offer` (sponsored placements, one-time deals); that branching was cut here. Add your own the same way.

## Adaptation notes
- Env: `STRIPE_WEBHOOK_SECRET` (the endpoint's `whsec_...`, distinct from the API key). Register the endpoint in the Stripe dashboard and subscribe to `invoice.paid`, `customer.subscription.deleted`, `customer.subscription.updated`.
- Prisma: add the `StripeEvent` model and migrate. If you don't sell capped inventory, delete the `Seat` block and the `premium_annual` branch entirely.
- Set `runtime = "nodejs"` and `dynamic = "force-dynamic"`. Signature verification needs the raw body and must not be statically optimized.
- Swap `@/lib/stripe`'s `getStripe()` for however you construct your Stripe client, and `@/lib/audit-log` for your logger (or delete the calls).

## Provenance
- Origin file: `src/app/api/webhooks/stripe/route.ts` @ `origin/main` (subscription SaaS, live). Genericized for this library: brand and business-model specifics (founding-seat program, sponsored/deal offer branches, price constants) removed; the reusable control flow is intact.
- Related features: [[token-bucket-rate-limit]], [[ssrf-url-guard]], [[email-nurture-sequence]]
- Related memory: Stripe webhook incident + Basil period-end reads.
