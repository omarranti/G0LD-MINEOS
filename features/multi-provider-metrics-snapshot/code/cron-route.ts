/**
 * Daily marketing snapshot cron. Vercel Cron hits this once per day; it
 * recomputes the marketing metrics (first-party DB counts plus every
 * configured provider) and writes them into teamState['marketing_snapshot'],
 * which the Overview hub reads on each load.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { computeMarketingMetrics, writeMarketingSnapshot } from '@/lib/marketing-metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const snapshot = await computeMarketingMetrics();
    await writeMarketingSnapshot(snapshot);
    return NextResponse.json({ ok: true, generatedAt: snapshot.generatedAt });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
