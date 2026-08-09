import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/saved
 *
 * Returns the IDs of all listings the signed-in user has saved.
 * Used by client-side <SaveListingButton> components on cached pages
 * (the listing detail and pSEO pages stay edge-cacheable; the personalized
 * saved-state hydrates client-side via this endpoint).
 *
 * Returns 200 with `{ ids: [] }` for unauthenticated users so the client
 * doesn't need special-case handling.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ids: [] }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const rows = await prisma.savedListing.findMany({
    where: { userId: session.user.id },
    select: { listingId: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    { ids: rows.map((r) => r.listingId) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
