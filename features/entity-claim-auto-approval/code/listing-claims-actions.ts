"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
// Swap for your admin auth (session role check, PIN gate, etc.).
import { ADMIN_PIN_COOKIE, adminPinCookieValue } from "@/lib/admin-pin-gate";
import { createListingClaim, runApprovalTransaction } from "@/lib/claim-core";
// Swap for your email layer (or delete the call site).
import { sendClaimApprovedEmail } from "@/lib/email";

// ─── Auth helpers ────────────────────────────────────────────────────────

async function requireAdminCookie(): Promise<void> {
  const jar = await cookies();
  const c = jar.get(ADMIN_PIN_COOKIE)?.value;
  if (!c || c !== adminPinCookieValue()) throw new Error("Unauthorized");
}

// ─── Submit claim ────────────────────────────────────────────────────────

export type SubmitClaimResult =
  | { ok: true; claimId: string }
  | { ok: false; error: string };

/**
 * Submit a claim request for a listing. Requires the user to be signed in.
 * Thin wrapper over the shared claim-core (validation + create + auto-approve);
 * the same core powers the mobile claim endpoint so the two never drift.
 */
export async function submitListingClaim(
  listingId: string,
  formData: FormData,
): Promise<SubmitClaimResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Please sign in to claim a listing." };
  }

  const result = await createListingClaim({
    listingId,
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    input: {
      businessEmail: formData.get("businessEmail"),
      businessPhone: formData.get("businessPhone"),
      relationship: formData.get("relationship"),
      proofNotes: formData.get("proofNotes"),
    },
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/listings/${result.slug}`);
  return { ok: true, claimId: result.claimId };
}

// ─── Admin review actions ────────────────────────────────────────────────

export async function approveClaim(
  claimId: string,
  reviewNotes?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminCookie();

  try {
    const claim = await prisma.listingClaim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        listingId: true,
        userId: true,
        status: true,
        claimant: { select: { email: true, name: true } },
        listing: { select: { name: true } },
      },
    });
    if (!claim) return { ok: false, error: "Claim not found" };

    await runApprovalTransaction({
      claimId: claim.id,
      listingId: claim.listingId,
      userId: claim.userId,
      reviewNotes: reviewNotes ?? null,
    });

    // Activation email, best-effort. Don't fail approval on delivery.
    if (claim.claimant?.email) {
      try {
        await sendClaimApprovedEmail(claim.claimant.email, {
          name: claim.claimant.name,
          businessName: claim.listing.name,
          listingId: claim.listingId,
        });
      } catch {
        // email is best-effort
      }
    }

    revalidatePath("/admin/claims");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't approve the claim." };
  }
}

export async function rejectClaim(
  claimId: string,
  reviewNotes: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminCookie();

  const notes = reviewNotes.trim();
  if (!notes) return { ok: false, error: "Reason is required when rejecting" };

  try {
    await prisma.listingClaim.update({
      where: { id: claimId },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    });
    revalidatePath("/admin/claims");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reject the claim." };
  }
}
