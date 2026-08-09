"use client";

import type { ListingMetricKey } from "@/lib/listing-metrics";

/**
 * Fire-and-forget first-party metric ping for a listing. Uses sendBeacon
 * when available so taps that immediately navigate away (tel: links,
 * external websites, directions) still get counted. Never throws.
 */
export function trackListingMetric(
  listingId: string,
  metric: ListingMetricKey,
): void {
  if (typeof window === "undefined") return;
  const url = `/api/listings/${listingId}/track`;
  const payload = JSON.stringify({ metric });
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Metrics must never break the page.
  }
}
