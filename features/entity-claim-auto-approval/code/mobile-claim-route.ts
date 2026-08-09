import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
// Swap for your mobile bearer-token auth.
import {
  MobileAuthError,
  requireMobileUser,
} from "@/app/api/mobile/v1/_lib/mobile-jwt";
import { createListingClaim } from "@/lib/claim-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/v1/listings/[slug]/claim
 *
 * Submit (or resubmit) the bearer user's ownership claim for a listing.
 * Mirrors the web claim flow: both call the shared claim-core, so validation,
 * the one-claim-per-(listing,user) rule, and domain-match auto-approval stay
 * identical. The claim lands in the same ListingClaim table the web
 * /admin/claims queue reads, so review is one queue across web + app.
 *
 * Body (JSON):
 *   { relationship, businessEmail?, businessPhone?, proofNotes? }
 *   (at least one of businessEmail / businessPhone is required)
 *
 * Returns { ok: true, claimId, status } where status is PENDING or APPROVED
 * (APPROVED when the claimant email domain matches the listing website).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  let claims;
  try {
    claims = await requireMobileUser(req);
  } catch (err) {
    if (err instanceof MobileAuthError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    throw err;
  }

  const { slug } = await ctx.params;
  if (!slug) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Resolve slug -> id (the mobile client addresses listings by slug).
  const listing = await prisma.listing.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!listing) {
    return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);

  const result = await createListingClaim({
    listingId: listing.id,
    userId: claims.sub,
    userEmail: claims.email ?? null,
    input: {
      relationship: body?.relationship,
      businessEmail: body?.businessEmail,
      businessPhone: body?.businessPhone,
      proofNotes: body?.proofNotes,
    },
  });

  if (!result.ok) {
    const status =
      result.code === "listing_not_found"
        ? 404
        : result.code === "internal"
          ? 500
          : 400;
    return NextResponse.json(
      { error: result.code, detail: result.error },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    { ok: true, claimId: result.claimId, status: result.status },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
