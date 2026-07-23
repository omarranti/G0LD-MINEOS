import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CITIES, TYPES, getCityBySlug, getTypeBySlug, type CityConfig, type TypeConfig } from "@/config/pseo";

// ISR: rebuild each spoke hourly so newly-added inventory flips it indexable.
export const revalidate = 3600;

/**
 * Programmatic SEO spoke page: /[city]/[type] (e.g. /austin/restaurants).
 *
 * The load-bearing idea is NOT that we generate a big cartesian of pages, it's
 * that empty pages are gated `noindex,follow` and only become indexable once
 * they have real inventory (see generateMetadata). A large thin tail of empty
 * combos would otherwise drag the whole domain's sitewide helpful-content
 * signal. The sitemap applies the SAME gate, so meta-robots and sitemap agree.
 */

// ─── Static params: the full city x type cartesian ─────────────────────────
// Generate every combo; the inventory gate (not this list) decides indexability.
export function generateStaticParams() {
  const params: { city: string; type: string }[] = [];
  for (const city of CITIES) {
    for (const type of TYPES) {
      params.push({ city: city.slug, type: type.slug });
    }
  }
  return params;
}

// ─── The where-clause that both the page and the count share ───────────────
function whereFor(city: CityConfig, type: TypeConfig) {
  return {
    status: "ACTIVE" as const,
    state: city.stateAbbr,
    city: { in: city.dbNames }, // one slug can map to several DB city spellings
    type: type.dbValue as never,
  };
}

// ─── Metadata + the inventory gate ─────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; type: string }>;
}): Promise<Metadata> {
  const { city: citySlug, type: typeSlug } = await params;
  const city = getCityBySlug(citySlug);
  const type = getTypeBySlug(typeSlug);
  if (!city || !type) return { title: "Not Found" };

  // The count drives BOTH the copy and the index decision.
  const count = await prisma.listing.count({ where: whereFor(city, type) }).catch(() => 0);

  const title =
    count > 0
      ? `${count} ${type.plural} in ${city.name}, ${city.stateAbbr}`
      : `${type.plural} in ${city.name}, ${city.stateAbbr}`;

  const description =
    count > 0
      ? `${city.name} has ${count} ${type.plural.toLowerCase()}. See what's open, what they offer, and what the community thinks.`
      : `Looking for ${type.plural.toLowerCase()} in ${city.name}? We're adding new spots regularly.`;

  return {
    title,
    description,
    alternates: { canonical: `/${city.slug}/${type.slug}` },
    // THE GATE: empty combos are crawlable but not indexable. They flip to
    // indexable automatically the next time ISR rebuilds after a listing lands.
    robots:
      count === 0
        ? { index: false, follow: true }
        : { index: true, follow: true },
  };
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default async function Page({
  params,
}: {
  params: Promise<{ city: string; type: string }>;
}) {
  const { city: citySlug, type: typeSlug } = await params;
  const city = getCityBySlug(citySlug);
  const type = getTypeBySlug(typeSlug);
  if (!city || !type) notFound();

  const listings = await prisma.listing.findMany({
    where: whereFor(city, type),
    orderBy: { name: "asc" },
  });

  // Render listings (or a "coming soon / add yours" state when empty). The empty
  // state is deliberately still a real page: it stays crawlable (follow) so it
  // passes link equity and gets discovered, it just isn't indexed until it has
  // something worth indexing.
  return (
    <main>
      <h1>{type.plural} in {city.name}, {city.stateAbbr}</h1>
      {listings.length === 0 ? (
        <p>No {type.plural.toLowerCase()} listed here yet. Know one? Add it.</p>
      ) : (
        <ul>
          {listings.map((l) => (
            <li key={l.id}>{l.name}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
