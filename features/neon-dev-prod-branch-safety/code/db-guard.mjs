#!/usr/bin/env node
/**
 * Refuse destructive Prisma commands when DATABASE_URL points at production.
 *
 * Wire it into package.json so `db:push:dev` goes through the guard:
 *   "db:push:dev": "node scripts/db-guard.mjs && prisma db push"
 *
 * The guard blocks when the connection host contains any PROD_HOST_MARKER.
 * Markers are substrings of your production endpoint host (e.g. the Neon
 * endpoint id "ep-example-prod-1a2b3c"). Keep the real markers in an env var
 * or a gitignored file so they are not committed.
 */

const url = process.env.DATABASE_URL || "";

// Substrings that identify the production endpoint host. Load from env so the
// real production endpoint id never lands in the repo.
const PROD_HOST_MARKERS = (process.env.PROD_DB_HOST_MARKERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!url) {
  console.error("db-guard: DATABASE_URL is not set. Refusing to run.");
  process.exit(1);
}

if (PROD_HOST_MARKERS.length === 0) {
  console.error(
    "db-guard: PROD_DB_HOST_MARKERS is empty. Set it (comma-separated host substrings) so the guard can recognize production.",
  );
  process.exit(1);
}

const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return url; // non-URL DSNs: match against the raw string
  }
})();

const hit = PROD_HOST_MARKERS.find((m) => host.includes(m));
if (hit) {
  console.error(
    `db-guard: DATABASE_URL host "${host}" matches production marker "${hit}". ` +
      `Destructive command refused. Point .env.local at the dev branch.`,
  );
  process.exit(1);
}

console.log(`db-guard: ok, target host "${host}" is not production.`);
process.exit(0);
