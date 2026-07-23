import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { auditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe subscription webhook. Load-bearing patterns (see SPEC.md):
 *   1. Verify the signature against the raw body (never the parsed body).
 *   2. Idempotency: record every event id once; duplicates return early.
 *   3. Read the subscription id from BOTH the pre- and post-"Basil" shapes.
 *   4. Resolve the user via a fallback chain (metadata -> customer -> email
 *      -> stash a pending checkout for post-signup claiming).
 *   5. Claim capped inventory (a "seat") atomically with FOR UPDATE SKIP LOCKED.
 *   6. Downgrade + release the seat on cancel.
 *   7. Return 200 for handled-but-noop cases so Stripe stops retrying.
 *
 * A single subscription plan is shown. In the origin app this same handler
 * multiplexes several offer types by reading `metadata.offer`; that branching
 * is dropped here to keep the reusable core legible.
 */

const SEAT_TOTAL = 100; // capped-inventory example (e.g. "first 100 members")

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new NextResponse("Missing stripe-signature header", { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    auditLog({ event: "stripe.webhook.config_error", ok: false, meta: { reason: "STRIPE_WEBHOOK_SECRET not set" } });
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  // Must be the RAW body. Next.js hands it over via req.text(); do not JSON.parse
  // first or the signature check will fail on a re-serialized payload.
  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    auditLog({ event: "stripe.webhook.sig_failed", ok: false, meta: { message } });
    return new NextResponse(`Webhook signature verification failed: ${message}`, { status: 400 });
  }

  // ─── Idempotency check ──────────────────────────────────────────
  // Stripe redelivers events (at-least-once). Record the id; if the row
  // already exists the INSERT affects 0 rows and we short-circuit. This is
  // the whole idempotency story: no per-handler dedupe needed downstream.
  const inserted = await prisma.$executeRaw`
    INSERT INTO "StripeEvent" ("id", "type", "createdAt")
    VALUES (${event.id}, ${event.type}, NOW())
    ON CONFLICT ("id") DO NOTHING;
  `;
  if (inserted === 0) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  // ─── invoice.paid: activate plan + claim a seat ─────────────────
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;

    // Stripe API "Basil" (2025-04-30+) removed the top-level
    // `invoice.subscription` field and moved it under
    // `invoice.parent.subscription_details.subscription`. Accounts on a
    // post-Basil version send only the nested shape, so read BOTH,
    // otherwise subId is null and every subscription payment silently
    // no-ops here, leaving paid users unfulfilled.
    const parentSub = (
      invoice as unknown as {
        parent?: { subscription_details?: { subscription?: string | { id: string } | null } };
      }
    ).parent?.subscription_details?.subscription ?? null;
    const subRef = invoice.subscription ?? parentSub;
    const subId = typeof subRef === "string" ? subRef : subRef?.id ?? null;

    if (!subId) {
      return NextResponse.json({ ok: true, ignored: "no subscription on invoice" });
    }

    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.retrieve(subId);
    } catch {
      auditLog({ event: "stripe.webhook.sub_fetch_failed", ok: false, meta: { subId } });
      return new NextResponse("Failed to fetch subscription", { status: 500 });
    }

    const plan = sub.metadata?.plan;
    const customerId = typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id ?? null;

    // ─── User resolution fallback chain ───────────────────────────
    // Checkout metadata is the happy path, but anonymous / pre-signup
    // buyers won't have a userId. Fall back to customer id, then email,
    // then stash a PendingCheckout the signup flow claims later.
    let userId = sub.metadata?.userId ?? null;

    if (!userId && customerId) {
      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: customerId },
        select: { id: true },
      });
      if (user) userId = user.id;
    }

    if (!userId && invoice.customer_email) {
      const user = await prisma.user.findUnique({
        where: { email: invoice.customer_email.toLowerCase() },
        select: { id: true },
      });
      if (user) userId = user.id;
    }

    if (!userId) {
      const email = invoice.customer_email;
      if (email) {
        await prisma.pendingCheckout.upsert({
          where: { stripeSessionId: `invoice_${invoice.id}` },
          create: {
            stripeSessionId: `invoice_${invoice.id}`,
            stripeCustomerId: customerId,
            email: email.toLowerCase(),
            planType: plan ?? "monthly",
          },
          update: {},
        });
        auditLog({ event: "stripe.webhook.pending_invoice", ok: true, meta: { email } });
      }
      return NextResponse.json({ ok: true, pending: true });
    }

    // ─── Capped-inventory seat claim (atomic) ─────────────────────
    // Two payments can land at the same instant. FOR UPDATE SKIP LOCKED
    // lets each transaction grab a *different* free seat without blocking
    // or double-assigning. Wrapped in a transaction with the user update
    // so a seat is never claimed without the user being upgraded.
    if (plan === "premium_annual") {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const claimed = await tx.$queryRaw<Array<{ id: number }>>`
            UPDATE "Seat"
              SET "userId" = ${userId}, "claimedAt" = NOW()
              WHERE id = (
                SELECT id FROM "Seat"
                  WHERE "userId" IS NULL AND id <= ${SEAT_TOTAL}
                  ORDER BY id
                  FOR UPDATE SKIP LOCKED
                  LIMIT 1
              )
              RETURNING id;
          `;
          if (claimed.length === 0) throw new Error("SEATS_EXHAUSTED");

          await tx.user.update({
            where: { id: userId! },
            data: {
              plan: "PREMIUM_ANNUAL",
              seatNumber: claimed[0].id,
              stripeCustomerId: customerId ?? undefined,
              trialEndsAt: null,
            },
          });
          return { seatId: claimed[0].id };
        });

        auditLog({ event: "stripe.webhook.seat_claimed", ok: true, meta: { seatId: result.seatId, userId } });
        // A public counter renders the claimed-seat count on an ISR page.
        revalidatePath("/");
        return NextResponse.json({ ok: true, seatId: result.seatId, userId });
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        if (message === "SEATS_EXHAUSTED") {
          auditLog({ event: "stripe.webhook.seats_exhausted", ok: false, meta: { userId } });
          // Sold out between checkout and fulfilment: cancel + let Stripe refund.
          try { await stripe.subscriptions.cancel(subId); } catch {}
          return NextResponse.json({ ok: true, error: "seats_exhausted", canceled: true });
        }
        auditLog({ event: "stripe.webhook.claim_failed", ok: false, meta: { error: message } });
        return new NextResponse("Webhook handler failed", { status: 500 });
      }
    }

    // ─── Standard plan activation ─────────────────────────────────
    const dbPlan = plan === "annual" ? "YEARLY" : "MONTHLY";
    await prisma.user.update({
      where: { id: userId },
      data: { plan: dbPlan, stripeCustomerId: customerId ?? undefined, trialEndsAt: null },
    });
    auditLog({ event: "stripe.webhook.plan_activated", ok: true, meta: { plan: dbPlan, userId } });
    return NextResponse.json({ ok: true, plan: dbPlan, userId });
  }

  // ─── subscription deleted / canceled: downgrade to FREE ─────────
  if (
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.updated"
  ) {
    const sub = event.data.object as Stripe.Subscription;

    // On update, only a transition to canceled is actionable.
    if (event.type === "customer.subscription.updated" && sub.status !== "canceled") {
      return NextResponse.json({ ok: true, ignored: "not a cancellation" });
    }

    const userId = sub.metadata?.userId ?? null;
    if (!userId) {
      auditLog({ event: "stripe.webhook.cancel_no_user", ok: false, meta: { subId: sub.id } });
      return NextResponse.json({ ok: true, skipped: "no userId in metadata" });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { plan: "FREE", trialEndsAt: null },
    });

    // Release the seat back into inventory so the next buyer can claim it.
    if (sub.metadata?.plan === "premium_annual") {
      await prisma.$executeRaw`
        UPDATE "Seat" SET "userId" = NULL, "claimedAt" = NULL WHERE "userId" = ${userId};
      `;
      await prisma.user.update({ where: { id: userId }, data: { seatNumber: null } });
      auditLog({ event: "stripe.webhook.seat_released", ok: true, meta: { userId } });
      revalidatePath("/");
    }

    auditLog({ event: "stripe.webhook.subscription_canceled", ok: true, meta: { userId } });
    return NextResponse.json({ ok: true, canceled: true, userId });
  }

  // ─── Unhandled event type: ack so Stripe stops retrying ─────────
  return NextResponse.json({ ok: true, ignored: event.type });
}
