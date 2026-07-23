/**
 * App Store attribution layer.
 *
 * Maps inbound utm_source to a campaign-tagged App Store URL so that
 * downloads can be attributed to the originating channel in Apple's
 * App Store Connect Sources dashboard.
 *
 * Flow:
 *   1. Reader clicks therma.one?utm_source=rina_raphael
 *   2. lib/utm-tracking.ts persists the UTM to localStorage
 *   3. <DownloadAppButton> / useAppStoreUrl() reads the stored UTM
 *   4. Resolves to a campaign URL with Apple's pt + ct tokens
 *   5. Click on Download → App Store sees the campaign tokens → attributes install
 *
 * IMPORTANT: paste the App Store Connect Campaign Link URLs into the map
 * below once Sam has generated them. Until then, all entries fall back to
 * the canonical App Store URL and attribution is lost (but nothing breaks).
 */

import { APP_STORE_URL } from './links';
import { getStoredUtmParams } from './utm-tracking';

/**
 * utm_source value → App Store Connect campaign-tagged URL.
 *
 * Generate each campaign URL in App Store Connect:
 *   My Apps → Therma → App Analytics → Sources → Create Campaign Link
 *
 * Apple returns URLs in this shape:
 *   https://apps.apple.com/us/app/.../id6760090996?pt=PROVIDER_TOKEN&ct=wave4_rina&mt=8
 *
 * Match utm_source values to the campaign names below. Lowercase + underscore.
 */
const APP_STORE_CAMPAIGN_URLS: Record<string, string> = {
  // Wave 4 press push (May 2026). Keys must match the utm_source values in
  // the journalist email pitches (wave-4-ready-to-send.md). Azzaro generated
  // ct tokens 2026-05-27; rina got wave4_rina, the rest got bare first names.
  wave4_rina: 'https://apps.apple.com/app/apple-store/id6760090996?pt=128576378&ct=wave4_rina&mt=8',
  wave4_arvid: 'https://apps.apple.com/app/apple-store/id6760090996?pt=128576378&ct=arvid&mt=8',
  wave4_courtland: 'https://apps.apple.com/app/apple-store/id6760090996?pt=128576378&ct=courtland&mt=8',
  wave4_channing: 'https://apps.apple.com/app/apple-store/id6760090996?pt=128576378&ct=channing&mt=8',
  wave4_justin: 'https://apps.apple.com/app/apple-store/id6760090996?pt=128576378&ct=justin&mt=8',
  wave4_simon: 'https://apps.apple.com/app/apple-store/id6760090996?pt=128576378&ct=simon&mt=8',
  wave4_jen: 'https://apps.apple.com/app/apple-store/id6760090996?pt=128576378&ct=jen&mt=8',
};

/**
 * Resolve the App Store URL to use for the current visitor.
 * Returns the campaign-tagged URL if utm_source matches a known campaign.
 * Falls back to the canonical APP_STORE_URL when no UTM is present or
 * no campaign mapping exists.
 *
 * Safe to call from server components (returns fallback when no window).
 */
export function getAttributedAppStoreUrl(explicitSource?: string): string {
  if (explicitSource && APP_STORE_CAMPAIGN_URLS[explicitSource]) {
    return APP_STORE_CAMPAIGN_URLS[explicitSource];
  }

  if (typeof window === 'undefined') return APP_STORE_URL;

  const stored = getStoredUtmParams();
  const source = stored?.utm_source;
  if (source && APP_STORE_CAMPAIGN_URLS[source]) {
    return APP_STORE_CAMPAIGN_URLS[source];
  }

  return APP_STORE_URL;
}

/**
 * All known utm_source values that have a campaign URL configured.
 * Exported so a debug/admin view can list active campaigns.
 */
export const KNOWN_CAMPAIGN_SOURCES = Object.keys(APP_STORE_CAMPAIGN_URLS);
