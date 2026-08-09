import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { parseMetricKey, recordListingMetric } from "@/lib/listing-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/listings/[id]/track
 *
 * Body: { metric: "view" | "phone" | "website" | "directions" }
 *
 * Increments the first-party daily counter for a listing. Fired from the
 * public listing page (page mount, phone tap, website click, directions
 * tap). Anonymous by design: no user data is stored, only an aggregate
 * count per listing per UTC day.
 *
 * Always returns 204 on accepted input, even if the write was skipped
 * (table not yet created, unknown listing) -- tracking must never surface
 * errors to visitors.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id || id.length > 64) {
    return NextResponse.json({ error: "Invalid listing id" }, { status: 400 });
  }

  let body: { metric?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const metric = parseMetricKey(body.metric);
  if (!metric) {
    return NextResponse.json(
      { error: "metric must be view, phone, website, or directions" },
      { status: 400 },
    );
  }

  // Per-visitor, per-listing throttle. Generous enough for real browsing,
  // tight enough that a single client can't inflate a sponsor's numbers.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`listing-track:${ip}:${id}`, 30, 10 * 60 * 1000);
  if (!rl.ok) {
    return new NextResponse(null, { status: 204 });
  }

  await recordListingMetric(id, metric);

  return new NextResponse(null, { status: 204 });
}
