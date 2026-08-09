"use client";

import { createContext, useContext } from "react";

export type SubscriptionTier =
  | "anonymous"
  | "free"
  | "monthly"
  | "yearly"
  | "family"
  | "founding_annual"
  | "lifetime";

export interface SubscriptionState {
  /** User is not logged in at all */
  isAnonymous: boolean;
  /** User has a free account (logged in, no paid plan) */
  isFreeAccount: boolean;
  /** User has any paid plan (monthly, yearly, family, founding_annual, or lifetime) */
  isPaid: boolean;
  /** User is on the family plan */
  isFamily: boolean;
  /** User is a founding annual member */
  isFoundingAnnual: boolean;
  /** User is a founding member with permanent yearly-tier access (legacy) */
  isLifetime: boolean;
  /** User is in an active app-side trial (no CC) */
  isTrial: boolean;
  /** Days remaining in trial, 0 if not in trial */
  trialDaysRemaining: number;
  /** User has paid access OR active trial */
  hasAccess: boolean;
  /** Current tier */
  tier: SubscriptionTier;
}

/**
 * Resolve tier from user plan string (from Prisma/DB).
 * Returns "anonymous" when no user is present.
 */
export function resolveSubscription(user?: {
  plan?: string;
  trialEndsAt?: string | Date | null;
} | null): SubscriptionState {
  if (!user) {
    return {
      isAnonymous: true,
      isFreeAccount: false,
      isPaid: false,
      isFamily: false,
      isFoundingAnnual: false,
      isLifetime: false,
      isTrial: false,
      trialDaysRemaining: 0,
      hasAccess: false,
      tier: "anonymous",
    };
  }

  const plan = (user.plan || "FREE").toUpperCase();
  const isPaid =
    plan === "MONTHLY" ||
    plan === "YEARLY" ||
    plan === "FAMILY" ||
    plan === "FOUNDING_ANNUAL" ||
    plan === "LIFETIME";
  const isFamily = plan === "FAMILY";
  const isFoundingAnnual = plan === "FOUNDING_ANNUAL";
  const isLifetime = plan === "LIFETIME";

  let isTrial = false;
  let trialDaysRemaining = 0;
  if (user.trialEndsAt) {
    const trialEnd = new Date(user.trialEndsAt);
    const diff = trialEnd.getTime() - Date.now();
    if (diff > 0) {
      isTrial = true;
      trialDaysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
  }

  const hasAccess = isPaid || isTrial;

  let tier: SubscriptionTier;
  if (isPaid) {
    tier = plan.toLowerCase().replace("_", "_") as SubscriptionTier;
  } else {
    tier = "free";
  }

  return {
    isAnonymous: false,
    isFreeAccount: !isPaid && !isTrial,
    isPaid,
    isFamily,
    isFoundingAnnual,
    isLifetime,
    isTrial,
    trialDaysRemaining,
    hasAccess,
    tier,
  };
}

const SubscriptionContext = createContext<SubscriptionState>({
  isAnonymous: true,
  isFreeAccount: false,
  isPaid: false,
  isFamily: false,
  isFoundingAnnual: false,
  isLifetime: false,
  isTrial: false,
  trialDaysRemaining: 0,
  hasAccess: false,
  tier: "anonymous",
});

export const SubscriptionProvider = SubscriptionContext.Provider;

export function useSubscription(): SubscriptionState {
  return useContext(SubscriptionContext);
}
