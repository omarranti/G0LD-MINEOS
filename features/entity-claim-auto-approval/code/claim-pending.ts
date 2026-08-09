import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

/**
 * ADJACENT PATTERN (optional; delete if you don't sell pre-auth checkout).
 * This is the OTHER "claim" in the origin codebase: claim any unclaimed
 * PendingCheckout rows matching a user's email, i.e. attach an anonymous
 * Stripe purchase to an account created afterward. It is unrelated to
 * listing-ownership claims but ships here because it completes the origin's
 * claim-* module family.
 *
 * Called from:
 * - a post-auth client call (POST /api/claim-pending)
 * - the email-signup register route, right after user create
 * - the NextAuth createUser event (OAuth signups)
 *
 * Whatever plan this path writes MUST match what the invoice.paid webhook
 * writes for the same purchase, or the two fulfillment paths drift.
 */

/** Placeholder: the locked annual price for the capped founding tier. */
const FOUNDING_ANNUAL_PRICE = 36.0;

export type ClaimPendingResult =
  | { status: "user_not_found" }
  | { status: "no_email" }
  | { status: "no_pending" }
  | { status: "already_founder" }
  | { status: "founding_claimed"; foundingMemberNumber: number }
  | { status: "seats_exhausted" }
  | { status: "founding_failed" }
  | { status: "already_subscribed"; plan: string }
  | { status: "subscription_activated"; plan: string }
  | { status: "unknown_plan_type"; planType: string };

export async function claimPendingForUser(userId: string): Promise<ClaimPendingResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, foundingMemberNumber: true, plan: true },
  });

  if (!user) return { status: "user_not_found" };
  if (!user.email) return { status: "no_email" };

  // Find unclaimed pending purchase matching this email.
  const pending = await prisma.pendingCheckout.findFirst({
    where: { email: user.email.toLowerCase(), claimed: false },
    orderBy: { createdAt: "asc" },
  });

  if (!pending) return { status: "no_pending" };

  // Pull billing name from the Stripe session.
  let billingName: string | null = null;
  try {
    const stripe = getStripe();
    const stripeSession = await stripe.checkout.sessions.retrieve(pending.stripeSessionId);
    billingName = stripeSession.customer_details?.name ?? stripeSession.shipping_details?.name ?? null;
  } catch {
    // non-fatal
  }

  // ─── Capped founding tier ───────────────────────────────────────────
  if (pending.planType === "founding") {
    if (user.foundingMemberNumber != null) {
      await prisma.pendingCheckout.update({
        where: { id: pending.id },
        data: { claimed: true, claimedByUserId: user.id },
      });
      return { status: "already_founder" };
    }

    try {
      const seatId = await prisma.$transaction(async (tx) => {
        const claimed = await tx.$queryRaw<Array<{ id: number }>>`
          UPDATE "FounderSeat"
            SET "userId" = ${user.id}, "claimedAt" = NOW()
            WHERE id = (
              SELECT id FROM "FounderSeat"
                WHERE "userId" IS NULL
                ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
            ) RETURNING id;
        `;
        if (claimed.length === 0) throw new Error("SEATS_EXHAUSTED");

        const sid = claimed[0].id;
        await tx.user.update({
          where: { id: user.id },
          data: {
            plan: "FOUNDING_ANNUAL",
            foundingMemberNumber: sid,
            foundingMemberSince: new Date(),
            lockedAnnualPrice: FOUNDING_ANNUAL_PRICE,
            stripeCustomerId: pending.stripeCustomerId ?? undefined,
            ...(billingName && !user.name ? { name: billingName } : {}),
          },
        });
        await tx.pendingCheckout.update({
          where: { id: pending.id },
          data: { claimed: true, claimedByUserId: user.id },
        });
        return sid;
      });

      // Best-effort coupon.
      const couponId = process.env.STRIPE_FOUNDER_COUPON_ID;
      if (pending.stripeCustomerId && couponId) {
        try {
          const stripe = getStripe();
          await stripe.customers.update(pending.stripeCustomerId, { coupon: couponId });
        } catch { /* non-fatal */ }
      }

      return { status: "founding_claimed", foundingMemberNumber: seatId };
    } catch (err) {
      if (err instanceof Error && err.message === "SEATS_EXHAUSTED") {
        try {
          const stripe = getStripe();
          const s = await stripe.checkout.sessions.retrieve(pending.stripeSessionId);
          const piId = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
          if (piId) {
            await stripe.refunds.create({
              payment_intent: piId,
              reason: "requested_by_customer",
              metadata: { reason: "founding_seats_exhausted", userId: user.id },
            });
          }
        } catch { /* non-fatal */ }
        return { status: "seats_exhausted" };
      }
      console.error("[claim-pending] founding transaction failed:", err);
      return { status: "founding_failed" };
    }
  }

  // ─── Subscription (monthly / yearly) ────────────────────────────────
  if (pending.planType === "monthly" || pending.planType === "yearly") {
    const currentPlan = (user.plan ?? "FREE").toUpperCase();
    if (currentPlan !== "FREE") {
      await prisma.pendingCheckout.update({
        where: { id: pending.id },
        data: { claimed: true, claimedByUserId: user.id },
      });
      return { status: "already_subscribed", plan: currentPlan };
    }

    const dbPlan = pending.planType === "yearly" ? "YEARLY" : "MONTHLY";
    await prisma.user.update({
      where: { id: user.id },
      data: {
        plan: dbPlan,
        stripeCustomerId: pending.stripeCustomerId ?? undefined,
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ...(billingName && !user.name ? { name: billingName } : {}),
      },
    });
    await prisma.pendingCheckout.update({
      where: { id: pending.id },
      data: { claimed: true, claimedByUserId: user.id },
    });

    return { status: "subscription_activated", plan: dbPlan };
  }

  return { status: "unknown_plan_type", planType: pending.planType };
}
