import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { CITIES, TYPES, type CityConfig } from "@/config/pseo";

const BASE = "https://example.com";

/**
 * Sitemap for the pSEO spokes. It MUST apply the same inventory gate the page's
 * generateMetadata applies, otherwise the sitemap advertises empty pages that
 * are `noindex` and you send Google mixed signals ("crawl this" + "don't index
 * this"). Here: only emit spokes for cities that have at least one active
 * listing. Same source of truth (active inventory), two consumers.
 */

// One round-trip: which cities currently have any active inventory.
async function getActiveCities(): Promise<Set<string>> {
  const rows = await prisma.listing.findMany({
    where: { status: "ACTIVE" },
    select: { city: true },
    distinct: ["city"],
  });
  return new Set(rows.map((r) => r.city));
}

function cityHasInventory(city: CityConfig, active: Set<string>): boolean {
  return city.dbNames.some((name) => active.has(name));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const active = await getActiveCities();
  const entries: MetadataRoute.Sitemap = [];

  for (const city of CITIES) {
    // Gate: skip whole cities with zero inventory so we never list a noindex spoke.
    if (!cityHasInventory(city, active)) continue;
    for (const type of TYPES) {
      entries.push({
        url: `${BASE}/${city.slug}/${type.slug}`,
        changeFrequency: "daily",
        priority: 0.6,
      });
    }
  }

  return entries;
}
