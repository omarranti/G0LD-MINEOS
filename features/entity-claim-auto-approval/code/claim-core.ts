/**
 * Shared claim-core: the single source of truth for creating a ListingClaim,
 * validating its fields, and running domain-match auto-approval.
 *
 * Both entry points call this so web and mobile never drift:
 *   - the web server action `submitListingClaim` (listing-claims-actions.ts)
 *   - the mobile endpoint POST /api/mobile/v1/listings/[slug]/claim
 *
 * This module is transport-agnostic: it takes typed inputs and returns a
 * result object. Callers map the result to their own transport (server-action
 * return value vs HTTP status codes) and handle revalidation.
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  AUTO_APPROVE_MARKER,
  shouldAutoApprove,
} from "@/lib/claim-auto-approve";
// Swap for your email layer (or delete the two call sites below).
import {
  sendClaimReceivedEmail,
  sendClaimApprovedEmail,
} from "@/lib/email";

/** Cap a single claimant email at this many auto-approvals per rolling 24h. */
const AUTO_APPROVE_DAILY_CAP = 5;

/** Validation shared by both callers. Accepts trimmed strings; "" == absent. */
export const ClaimInputSchema = z.object({
  businessEmail: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(200)
    .optional()
    .or(z.literal("")),
  businessPhone: z.string().trim().max(30).optional().or(z.literal("")),
  relationship: z
    .string()
    .trim()
    .min(2, "Tell us your role at the business")
    .max(60),
  proofNotes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type ClaimInput = z.infer<typeof ClaimInputSchema>;

/** Why a create failed, so HTTP callers can pick a status code. */
export type CreateClaimError =
  | "validation"
  | "no_contact"
  | "listing_not_found"
  | "internal";

export type CreateClaimResult =
  | { ok: true; claimId: string; status: "PENDING" | "APPROVED"; slug: string }
  | { ok: false; code: CreateClaimError; error: string };

/**
 * Create or update (resubmit) a claim for a listing, then auto-approve when the
 * claimant's email domain matches the listing website. One claim per
 * (listing, user) via `@@unique([listingId, userId])`; a resubmit resets it to
 * PENDING. Callers must have already authenticated the user.
 */
export async function createListingClaim(params: {
  listingId: string;
  userId: string;
  userEmail: string | null;
  input: unknown;
}): Promise<CreateClaimResult> {
  const parsed = ClaimInputSchema.safeParse(params.input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      error: parsed.error.issues[0]?.message ?? "Invalid form",
    };
  }
  const data = parsed.data;

  if (!data.businessEmail && !data.businessPhone) {
    return {
      ok: false,
      code: "no_contact",
      error:
        "Provide at least one contact method (email or phone) so we can verify you.",
    };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: params.listingId },
    select: { id: true, slug: true, website: true, name: true },
  });
  if (!listing) {
    return { ok: false, code: "listing_not_found", error: "Listing not found" };
  }

  try {
    const claim = await prisma.listingClaim.upsert({
      where: {
        listingId_userId: { listingId: params.listingId, userId: params.userId },
      },
      create: {
        listingId: params.listingId,
        userId: params.userId,
        businessEmail: data.businessEmail || null,
        businessPhone: data.businessPhone || null,
        relationship: data.relationship,
        proofNotes: data.proofNotes || null,
        status: "PENDING",
      },
      update: {
        businessEmail: data.businessEmail || null,
        businessPhone: data.businessPhone || null,
        relationship: data.relationship,
        proofNotes: data.proofNotes || null,
        status: "PENDING", // resubmitting resets to pending
      },
      select: { id: true },
    });

    let status: "PENDING" | "APPROVED" = "PENDING";
    const matchEmail = data.businessEmail || params.userEmail || null;
    if (
      shouldAutoApprove({
        listingWebsite: listing.website,
        claimantEmail: matchEmail,
      })
    ) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentAuto = await prisma.listingClaim.count({
        where: {
          businessEmail: matchEmail,
          status: "APPROVED",
          reviewNotes: { startsWith: AUTO_APPROVE_MARKER },
          reviewedAt: { gte: dayAgo },
        },
      });
      if (recentAuto < AUTO_APPROVE_DAILY_CAP) {
        await runApprovalTransaction({
          claimId: claim.id,
          listingId: params.listingId,
          userId: params.userId,
          reviewNotes: AUTO_APPROVE_MARKER,
        });
        status = "APPROVED";
      }
    }

    // Lifecycle email, best-effort. Never block or fail the claim on delivery.
    if (params.userEmail) {
      try {
        if (status === "APPROVED") {
          await sendClaimApprovedEmail(params.userEmail, {
            name: null,
            businessName: listing.name,
            listingId: params.listingId,
          });
        } else {
          await sendClaimReceivedEmail(params.userEmail, listing.name);
        }
      } catch {
        // email is not critical to claim creation
      }
    }

    return { ok: true, claimId: claim.id, status, slug: listing.slug };
  } catch {
    return {
      ok: false,
      code: "internal",
      error: "Couldn't submit your claim. Try again.",
    };
  }
}

/**
 * Approve a claim and transfer listing ownership. Shared by manual admin
 * approval and the domain-match auto-approval path.
 */
export async function runApprovalTransaction(args: {
  claimId: string;
  listingId: string;
  userId: string;
  reviewNotes: string | null;
}): Promise<void> {
  await prisma.$transaction([
    prisma.listingClaim.updateMany({
      where: {
        listingId: args.listingId,
        id: { not: args.claimId },
        status: "PENDING",
      },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewNotes: "Superseded by an approved claim for the same listing.",
      },
    }),
    prisma.listingClaim.update({
      where: { id: args.claimId },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewNotes: args.reviewNotes,
      },
    }),
    prisma.listing.update({
      where: { id: args.listingId },
      data: { createdById: args.userId },
    }),
  ]);
}
