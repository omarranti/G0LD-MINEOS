// -----------------------------------------------------------------------
//  Live marketing snapshots for the Overview hub.
//  Thin aggregation over existing fetchers (no new external integrations).
//  Rendered at request time so the hub is always current, never stale.
//
//  The core idea: `available: false` means "we can't see this provider",
//  which is a different fact from "this provider reports zero". The UI
//  renders a connect state for the former and real numbers for the latter.
// -----------------------------------------------------------------------

import { fetchScheduledPosts, fetchSentPosts } from '@/lib/buffer-graphql';

export interface BufferSnapshot {
  available: boolean; // false when BUFFER_API_TOKEN is missing / API unreachable
  totalScheduled: number;
  sent7d: number;
  activePlatforms: number;
  nextPost: { dueAt: string; platform: string } | null;
}

export async function getBufferSnapshot(): Promise<BufferSnapshot> {
  const [scheduled, sent] = await Promise.all([fetchScheduledPosts(100), fetchSentPosts(100)]);

  // fetchers return [] both when there's genuinely nothing AND when the token
  // is absent; treat "no scheduled and no sent" as unavailable so the UI can
  // show a connect state rather than a misleading "0".
  if (scheduled.length === 0 && sent.length === 0) {
    return { available: false, totalScheduled: 0, sent7d: 0, activePlatforms: 0, nextPost: null };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sent7d = sent.filter((p) => (p.sentAt ?? '') >= sevenDaysAgo).length;

  const platforms = new Set(scheduled.map((p) => p.channelService).filter(Boolean));

  // scheduled is already sorted ascending by dueAt in the fetcher.
  const upcoming = scheduled.find((p) => p.dueAt);
  const nextPost = upcoming?.dueAt
    ? { dueAt: upcoming.dueAt, platform: upcoming.channelDisplayName || upcoming.channelService }
    : null;

  return {
    available: true,
    totalScheduled: scheduled.length,
    sent7d,
    activePlatforms: platforms.size,
    nextPost,
  };
}
