/**
 * Best-available location signal for a user, carrying its own provenance.
 *
 * The app never asks for location at signup, so a user's city has to be
 * reconstructed from whatever they happened to leave behind. The sources
 * differ in how far they can be trusted, so the provenance travels with the
 * answer instead of being flattened into a single "city" that reads as fact:
 *
 *   stated  the user picked it, via the onboarding quiz or the /account editor
 *   alert   the user subscribed to a city's new-listing alert
 *   saves   the city most of their saved listings sit in
 *
 * Precedence is stated > alert > saves, so an inference never outranks
 * something the user actually said. An IP-derived `signupMetroSlug` would
 * slot in below the two declared sources.
 *
 * Pure module: no ORM, no next/headers, so it stays unit-testable.
 */

import { METRO_LABELS } from "@/lib/quiz-prefs";

export type LocationProvenance = "stated" | "alert" | "saves" | "none";

export interface ResolvedUserLocation {
  provenance: LocationProvenance;
  /** Human label ("Lakewood, NJ"), or null when nothing is known. */
  label: string | null;
  /** Short qualifier explaining where the label came from. */
  detail: string | null;
}

export interface UserLocationInput {
  preferredCitySlug: string | null;
  cityAlerts: { citySlug: string; cityName: string }[];
  savedCities: { city: string; state: string }[];
}

/** How confident each source is, for display ordering and legends. */
export const PROVENANCE_LABEL: Record<LocationProvenance, string> = {
  stated: "Stated",
  alert: "From alert",
  saves: "From saves",
  none: "No signal",
};

/**
 * Most common saved-listing city. Ties break alphabetically so the same
 * input always renders the same answer, which matters because this page is
 * force-dynamic and would otherwise flicker between equally-common cities.
 */
function modalSavedCity(
  saved: { city: string; state: string }[],
): { label: string; count: number } | null {
  if (saved.length === 0) return null;

  const counts = new Map<string, number>();
  for (const { city, state } of saved) {
    const label = state ? `${city}, ${state}` : city;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  let best: { label: string; count: number } | null = null;
  for (const [label, count] of [...counts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (!best || count > best.count) best = { label, count };
  }
  return best;
}

export function resolveUserLocation(u: UserLocationInput): ResolvedUserLocation {
  if (u.preferredCitySlug) {
    return {
      provenance: "stated",
      label: METRO_LABELS[u.preferredCitySlug] ?? u.preferredCitySlug,
      detail: "chose this city",
    };
  }

  const [firstAlert, ...otherAlerts] = u.cityAlerts;
  if (firstAlert) {
    return {
      provenance: "alert",
      label: firstAlert.cityName,
      detail:
        otherAlerts.length > 0
          ? `plus ${otherAlerts.length} more alert${otherAlerts.length === 1 ? "" : "s"}`
          : "new listing alert",
    };
  }

  const modal = modalSavedCity(u.savedCities);
  if (modal) {
    return {
      provenance: "saves",
      label: modal.label,
      detail: `${modal.count} of ${u.savedCities.length} saved`,
    };
  }

  return { provenance: "none", label: null, detail: null };
}

/** Every distinct saved city with its count, most-saved first. For the detail panel. */
export function savedCityBreakdown(
  saved: { city: string; state: string }[],
): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { city, state } of saved) {
    const label = state ? `${city}, ${state}` : city;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Counts per provenance across a set of users, for the coverage bar. */
export function locationCoverage(
  resolved: ResolvedUserLocation[],
): Record<LocationProvenance, number> {
  const out: Record<LocationProvenance, number> = {
    stated: 0,
    alert: 0,
    saves: 0,
    none: 0,
  };
  for (const r of resolved) out[r.provenance] += 1;
  return out;
}
