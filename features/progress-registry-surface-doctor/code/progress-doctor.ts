/**
 * Advisory health check for the product progress registry
 * (src/lib/progress/registry.ts), the data behind /admin/progress.
 *
 * Reports, never blocks: always exits 0. Run it in a session when statuses
 * feel stale, or after a stretch of shipping without touching the registry.
 *
 * Run: npm run progress:doctor
 * Without DATABASE_URL it runs the structural checks only and says so.
 */

// Load env the way Next.js does: .env.local wins, .env fills in the gaps.
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  PROGRESS_REGISTRY,
  STALE_AMBER_DAYS,
  STALE_RED_DAYS,
  stalenessOf,
  type ProgressVertical,
  type VerticalMetricKey,
} from "../src/lib/progress/registry";
import {
  SITE_FURNITURE,
  claimedSurfaces,
  duplicateClaims,
  surfaceCoverage,
} from "./progress-lib/surfaces";

const now = new Date();
let findings = 0;

function report(section: string, lines: string[]) {
  if (lines.length === 0) return;
  findings += lines.length;
  console.log(`\n${section}`);
  for (const line of lines) console.log(`  - ${line}`);
}

// Structural checks: things that make the registry itself untrustworthy.
const allFeatures = PROGRESS_REGISTRY.flatMap((v) => v.features.map((f) => ({ v, f })));

const seen = new Map<string, number>();
for (const { f } of allFeatures) seen.set(f.id, (seen.get(f.id) ?? 0) + 1);
report(
  "Duplicate feature ids",
  [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} appears ${n} times`),
);

report(
  "Unparseable lastUpdated dates",
  allFeatures
    .filter(({ f }) => Number.isNaN(Date.parse(f.lastUpdated)))
    .map(({ f }) => `${f.id}: "${f.lastUpdated}"`),
);

report(
  "Future-dated lastUpdated",
  allFeatures
    .filter(({ f }) => Date.parse(f.lastUpdated) > now.getTime() + 86_400_000)
    .map(({ f }) => `${f.id}: ${f.lastUpdated}`),
);

// Surface coverage: the check CI structurally cannot do. CI asks whether
// registry.ts moved; this asks whether the surface is in the registry at all.
//
// Only directories that actually resolve to a route count, so helper folders
// and colocated components never show up as findings.
function hasPageBeneath(dir: string, depth = 0): boolean {
  if (depth > 3) return false;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  if (entries.some((e) => e.isFile() && /^page\.(tsx|ts|jsx|js|mdx)$/.test(e.name))) {
    return true;
  }
  return entries
    .filter((e) => e.isDirectory())
    .some((e) => hasPageBeneath(join(dir, e.name), depth + 1));
}

function discoverSurfaces(): string[] {
  // (marketing) is descended into rather than counted, because it is a route
  // group and contributes nothing to the URL. api and actions hold no pages.
  const roots: { dir: string; skip: Set<string> }[] = [
    { dir: "src/app", skip: new Set(["(marketing)", "api", "actions"]) },
    { dir: "src/app/(marketing)", skip: new Set() },
  ];

  const found = new Set<string>();
  for (const { dir, skip } of roots) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || skip.has(entry.name)) continue;
      // Dynamic segments belong to their parent feature, never stand alone.
      if (entry.name.startsWith("[")) continue;
      if (hasPageBeneath(join(dir, entry.name))) found.add(entry.name);
    }
  }
  return [...found].sort();
}

const coverage = surfaceCoverage({
  discovered: discoverSurfaces(),
  claimed: claimedSurfaces(PROGRESS_REGISTRY),
  furniture: Object.keys(SITE_FURNITURE),
});

report(
  "Product surfaces with no registry feature (add a feature, or declare it in SITE_FURNITURE)",
  coverage.uncovered,
);
report(
  "Features claiming a route that does not exist on disk",
  coverage.phantom,
);
report(
  "SITE_FURNITURE entries whose route is gone",
  coverage.staleFurniture,
);
report(
  "Routes claimed by more than one feature",
  duplicateClaims(PROGRESS_REGISTRY).map(
    (d) => `${d.surface}: ${d.featureIds.join(", ")}`,
  ),
);

// Staleness: the page shows these too; the doctor lists them for sessions.
const stale = allFeatures
  .map(({ v, f }) => ({ v, f, s: stalenessOf(f, now) }))
  .filter(({ s }) => s !== "fresh");
report(
  `Stale entries (amber past ${STALE_AMBER_DAYS}d, red past ${STALE_RED_DAYS}d)`,
  stale.map(({ v, f, s }) => `[${s.toUpperCase()}] ${v.name} / ${f.name}, last touched ${f.lastUpdated}`),
);

async function liveChecks() {
  if (!process.env.DATABASE_URL) {
    console.log("\nDATABASE_URL not set: skipping live shipped-vs-metric checks.");
    return;
  }
  const { prisma } = await import("../src/lib/db");
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  // One representative live count per metric key. A vertical with shipped
  // work but a zero count is either dead instrumentation or a wrong status.
  const representative: Record<VerticalMetricKey, () => Promise<number>> = {
    supply: () => prisma.listing.count({ where: { status: "ACTIVE" } }),
    discovery: async () => {
      const sums = await prisma.listingMetric.aggregate({
        where: { day: { gte: fourteenDaysAgo } },
        _sum: { views: true },
      });
      return sums._sum.views ?? 0;
    },
    trust: () => prisma.review.count({ where: { status: "PUBLISHED" } }),
    engagement: () => prisma.savedListing.count(),
    community: () => prisma.event.count({ where: { status: "PUBLISHED" } }),
    monetization: () => prisma.deal.count({ where: { status: "ACTIVE" } }),
    owners: () => prisma.listingClaim.count(),
    ios: () =>
      prisma.mobilePushToken.count({
        where: { revokedAt: null, lastSeenAt: { gte: thirtyDaysAgo } },
      }),
  };

  const suspicious: string[] = [];
  for (const vertical of PROGRESS_REGISTRY) {
    if (!vertical.metricKey) continue;
    const hasShipped = vertical.features.some((f) => f.web === "shipped" || f.ios === "shipped");
    if (!hasShipped) continue;
    try {
      const count = await representative[vertical.metricKey]();
      if (count === 0) {
        suspicious.push(
          `${vertical.name}: has shipped features but its representative count is 0`,
        );
      }
    } catch (err) {
      suspicious.push(`${vertical.name}: live check failed (${(err as Error).message})`);
    }
  }
  report("Shipped verticals with a zero or failing live metric", suspicious);
  await prisma.$disconnect();
}

function completionLine(v: ProgressVertical): string {
  const shipped = v.features.filter((f) => f.web === "shipped" || f.ios === "shipped").length;
  return `${v.name}: ${shipped}/${v.features.length} features with a shipped cell`;
}

liveChecks()
  .catch((err) => console.log(`\nLive checks errored: ${(err as Error).message}`))
  .finally(() => {
    console.log("\nRegistry summary");
    for (const v of PROGRESS_REGISTRY) console.log(`  - ${completionLine(v)}`);
    console.log(
      findings === 0
        ? "\nProgress doctor: no findings."
        : `\nProgress doctor: ${findings} finding${findings === 1 ? "" : "s"}. Advisory only, nothing blocks.`,
    );
    process.exit(0);
  });
