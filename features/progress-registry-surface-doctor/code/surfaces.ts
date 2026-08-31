/**
 * Route-surface coverage for the progress registry.
 *
 * The CI reminder (.github/workflows/progress-registry.yml) can only ask
 * "did registry.ts move in this PR". It cannot ask the question that
 * actually matters, which is whether a surface exists in the registry at
 * all. A brand-new product route with no feature row anywhere ships
 * completely invisible to /admin/progress and nothing fires.
 *
 * This closes that: every route segment on disk must either be claimed by a
 * feature's `surfaces` list or be declared site furniture below. Anything
 * else is reported by `npm run progress:doctor`.
 *
 * HUMAN-MAINTAINED, like FEATURE_PATHS. Adding a route to the furniture list
 * is a deliberate statement that it has no build status worth tracking, not
 * a way to silence the check.
 *
 * Pure module: no fs, no prisma. The doctor does the disk walk and passes
 * the discovered segments in, so the interesting logic stays testable.
 */

/**
 * Routes that legitimately have no feature row. Company and legal pages,
 * internal asset pages, and redirects: real surfaces, but nothing about
 * them has a planned / in-flight / shipped lifecycle.
 */
export const SITE_FURNITURE: Record<string, string> = {
  about: "Company page, no build lifecycle",
  blog: "Content surface, tracked as content not as a feature",
  contact: "Company page, no build lifecycle",
  features: "Marketing page describing features, not a feature itself",
  "work-with-us": "Hiring page, no build lifecycle",
  terms: "Legal",
  privacy: "Legal",
  "brand-kit": "Internal brand asset page",
  services: "Marketing page for the owner services lane",
};

export interface CoverageInput {
  /** Route segments discovered on disk. */
  discovered: string[];
  /** Union of every feature's `surfaces`. */
  claimed: string[];
  /** Keys of SITE_FURNITURE, injected so tests can vary it. */
  furniture: string[];
}

export interface CoverageResult {
  /** On disk, claimed by nobody, not declared furniture. The finding. */
  uncovered: string[];
  /** Claimed by a feature but absent from disk. A stale or typo'd claim. */
  phantom: string[];
  /** Declared furniture that no longer exists. Dead config. */
  staleFurniture: string[];
}

export function surfaceCoverage(input: CoverageInput): CoverageResult {
  const discovered = new Set(input.discovered);
  const claimed = new Set(input.claimed);
  const furniture = new Set(input.furniture);

  const uncovered = [...discovered]
    .filter((s) => !claimed.has(s) && !furniture.has(s))
    .sort();

  // A claim pointing at a route that does not exist is just as wrong as an
  // unclaimed route: it makes the registry look more complete than it is.
  const phantom = [...claimed].filter((s) => !discovered.has(s)).sort();

  const staleFurniture = [...furniture].filter((s) => !discovered.has(s)).sort();

  return { uncovered, phantom, staleFurniture };
}

/** Every surface claimed across the registry, deduplicated. */
export function claimedSurfaces(
  registry: { features: { surfaces?: string[] }[] }[],
): string[] {
  const out = new Set<string>();
  for (const vertical of registry) {
    for (const feature of vertical.features) {
      for (const surface of feature.surfaces ?? []) out.add(surface);
    }
  }
  return [...out].sort();
}

/**
 * A surface claimed by more than one feature. Not automatically wrong (a
 * route can genuinely serve two features) but worth surfacing, because the
 * usual cause is a copy-pasted row.
 */
export function duplicateClaims(
  registry: { features: { id: string; surfaces?: string[] }[] }[],
): { surface: string; featureIds: string[] }[] {
  const owners = new Map<string, string[]>();
  for (const vertical of registry) {
    for (const feature of vertical.features) {
      for (const surface of feature.surfaces ?? []) {
        owners.set(surface, [...(owners.get(surface) ?? []), feature.id]);
      }
    }
  }
  return [...owners.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([surface, featureIds]) => ({ surface, featureIds }))
    .sort((a, b) => a.surface.localeCompare(b.surface));
}
