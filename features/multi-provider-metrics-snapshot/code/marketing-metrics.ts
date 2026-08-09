// -----------------------------------------------------------------------
//  Daily marketing metrics snapshot.
//  computeMarketingMetrics() pulls every credentialed source; the cron writes
//  the result into teamState['marketing_snapshot']; the Overview reads it back.
//  Providers without configured creds return null and render as "connect"
//  states in the UI, never as a misleading 0.
// -----------------------------------------------------------------------

import { gte, sql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { waitlist, teamState } from '@/lib/schema';
import { fetchSentPosts } from '@/lib/buffer-graphql';
import { fetchMailgunStats } from '@/lib/mailgun-stats';
import { fetchBeehiivStats } from '@/lib/beehiiv-stats';
import { fetchGa4CampaignStats, type Ga4CampaignStats } from '@/lib/ga4-stats';
import { fetchMetaCampaignStats, type MetaCampaignStats } from '@/lib/meta-stats';

export const MARKETING_SNAPSHOT_KEY = 'marketing_snapshot';

export interface MarketingSnapshot {
  generatedAt: string;
  waitlist: { total: number; last7d: number; last24h: number };
  buffer: { sent7d: number; byPlatform: { platform: string; count: number }[] } | null;
  email: { sent: number; delivered: number; opened: number; clicked: number } | null;
  newsletter: { subscribers: number; openRate: string } | null;
  ga4: Ga4CampaignStats | null;
  meta: MetaCampaignStats | null;
}

export async function computeMarketingMetrics(): Promise<MarketingSnapshot> {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);

  const [totalRow, weekRow, dayRow] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(waitlist),
    db.select({ c: sql<number>`count(*)::int` }).from(waitlist).where(gte(waitlist.createdAt, sevenDaysAgo)),
    db.select({ c: sql<number>`count(*)::int` }).from(waitlist).where(gte(waitlist.createdAt, dayAgo)),
  ]);

  // fan out to every provider in parallel. each external call gets its own
  // .catch(() => null) so one dead provider can never sink the snapshot;
  // it just shows up as null (= unavailable) in the result.
  const [sent, mailgun, beehiiv, ga4, meta] = await Promise.all([
    fetchSentPosts(100),
    fetchMailgunStats().catch(() => null),
    fetchBeehiivStats().catch(() => null),
    fetchGa4CampaignStats().catch(() => null),
    fetchMetaCampaignStats().catch(() => null),
  ]);

  const sevenIso = sevenDaysAgo.toISOString();
  const recentSent = sent.filter((p) => (p.sentAt ?? '') >= sevenIso);
  const platformCounts = new Map<string, number>();
  for (const p of recentSent) platformCounts.set(p.channelService, (platformCounts.get(p.channelService) ?? 0) + 1);
  const buffer =
    sent.length === 0
      ? null
      : {
          sent7d: recentSent.length,
          byPlatform: [...platformCounts.entries()]
            .map(([platform, count]) => ({ platform, count }))
            .sort((a, b) => b.count - a.count),
        };

  return {
    generatedAt: new Date().toISOString(),
    waitlist: { total: totalRow[0]?.c ?? 0, last7d: weekRow[0]?.c ?? 0, last24h: dayRow[0]?.c ?? 0 },
    buffer,
    email: mailgun ? { sent: mailgun.sent, delivered: mailgun.delivered, opened: mailgun.opened, clicked: mailgun.clicked } : null,
    newsletter: beehiiv ? { subscribers: beehiiv.subscribers, openRate: beehiiv.openRate } : null,
    ga4: ga4 ?? null,
    meta: meta ?? null,
  };
}

export async function writeMarketingSnapshot(snapshot: MarketingSnapshot): Promise<void> {
  await db
    .insert(teamState)
    .values({ key: MARKETING_SNAPSHOT_KEY, data: snapshot, updatedAt: new Date() })
    .onConflictDoUpdate({ target: teamState.key, set: { data: snapshot, updatedAt: new Date() } });
}

export async function readMarketingSnapshot(): Promise<{ snapshot: MarketingSnapshot; updatedAt: Date } | null> {
  const [row] = await db.select().from(teamState).where(eq(teamState.key, MARKETING_SNAPSHOT_KEY)).limit(1);
  if (!row) return null;
  return { snapshot: row.data as MarketingSnapshot, updatedAt: row.updatedAt };
}
