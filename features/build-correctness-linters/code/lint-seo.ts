#!/usr/bin/env tsx
/**
 * SEO linter. Runs in CI and on `pnpm lint:seo`.
 *
 * Rules (static metadata only — generateMetadata blocks are skipped):
 *   1. NOINDEX_IN_SITEMAP — page declares `index: false` but its route appears in sitemap.ts
 *   2. TITLE_TOO_LONG    — metadata.title > 60 chars (SERP truncation)
 *   3. DESC_TOO_SHORT    — metadata.description < 120 chars
 *   4. DESC_TOO_LONG     — metadata.description > 160 chars
 *   5. EM_DASH           — em dash in title or description (house style rule)
 *
 * Exit codes:
 *   0 — clean
 *   1 — violations found
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, hits: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, hits);
    else if (entry === "page.tsx") hits.push(p);
  }
  return hits;
}

type Severity = "error" | "warn";
type Violation = { file: string; rule: string; severity: Severity; detail: string };

const errors: Violation[] = [];

function pathToRoute(filePath: string): string {
  // src/app/pricing/page.tsx                    -> /pricing
  // src/app/(marketing)/explore/page.tsx        -> /explore
  // src/app/(marketing)/city/[city]/page.tsx    -> /city/[city]
  const route = filePath
    .replace(/^src\/app/, "")
    .replace(/\/page\.tsx$/, "")
    .replace(/\/\([^)]+\)/g, ""); // strip Next.js route groups
  return route || "/";
}

function extractStaticMetadataBlock(src: string): string | null {
  // Match `export const metadata: Metadata = { ... };` — non-greedy through balanced braces is
  // hard with regex, so we anchor on the keyword and walk braces.
  const idx = src.indexOf("export const metadata");
  if (idx === -1) return null;
  const open = src.indexOf("{", idx);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return null;
}

function extractKeyValue(block: string, key: string): string | null {
  // Match `key: "..."`, `key: '...'`, or `key: \`...\`` — single-line only.
  // Skips template-literal interpolations (those imply dynamic content).
  const re = new RegExp(`\\b${key}:\\s*(["'\`])([^"'\`]*)\\1`);
  const m = block.match(re);
  return m ? m[2] : null;
}

function routeInSitemap(route: string, sitemapSrc: string): boolean {
  // Sitemap constructs URLs as `${BASE}/path`. Match that literal pattern.
  // Dynamic routes ([city], [slug]) are constructed via .map and won't match — skip them.
  if (route.includes("[")) return false;
  // Escape the path for regex
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\$\\{BASE\\}${escaped}\\b`);
  return pattern.test(sitemapSrc);
}

async function main() {
  const sitemapSrc = readFileSync("src/app/sitemap.ts", "utf-8");
  const indexnowSrc = readFileSync("src/app/api/indexnow/route.ts", "utf-8");

  const pages = walk("src/app");

  for (const file of pages) {
    const src = readFileSync(file, "utf-8");
    const route = pathToRoute(file);
    const metaBlock = extractStaticMetadataBlock(src);
    if (!metaBlock) continue; // dynamic generateMetadata — out of scope

    // Rule 1: NOINDEX in sitemap
    const isNoIndex = /\bindex:\s*false\b/.test(metaBlock);
    if (isNoIndex) {
      if (routeInSitemap(route, sitemapSrc)) {
        errors.push({
          file,
          rule: "NOINDEX_IN_SITEMAP",
          severity: "error",
          detail: `Route ${route} is noindexed but appears in sitemap.ts. Remove it from sitemap.ts.`,
        });
      }
      // Also check IndexNow STATIC_URLS list
      const pathLiteral = `"${route}"`;
      if (indexnowSrc.includes(pathLiteral)) {
        errors.push({
          file,
          rule: "NOINDEX_IN_INDEXNOW",
          severity: "error",
          detail: `Route ${route} is noindexed but appears in src/app/api/indexnow/route.ts STATIC_URLS. Remove it.`,
        });
      }
    }

    // Rules 2-4 only apply to indexed pages — title/description length is
    // irrelevant on noindex pages because they never appear in SERPs.
    const title = extractKeyValue(metaBlock, "title");
    const description = extractKeyValue(metaBlock, "description");

    if (!isNoIndex) {
      if (title && title.length > 60) {
        errors.push({
          file,
          rule: "TITLE_TOO_LONG",
          severity: "error",
          detail: `${title.length} chars > 60: "${title}"`,
        });
      }
      if (description) {
        if (description.length < 120) {
          errors.push({
            file,
            rule: "DESC_TOO_SHORT",
            severity: "error",
            detail: `${description.length} chars < 120: "${description.slice(0, 80)}..."`,
          });
        } else if (description.length > 160) {
          errors.push({
            file,
            rule: "DESC_TOO_LONG",
            severity: "error",
            detail: `${description.length} chars > 160: "${description.slice(0, 80)}..."`,
          });
        }
      }
    }

    // Rule 5: Em dash in user-visible metadata
    if (title && title.includes("—")) {
      errors.push({
        file,
        rule: "EM_DASH",
        severity: "error",
        detail: `Em dash in title: "${title}"`,
      });
    }
    if (description && description.includes("—")) {
      errors.push({
        file,
        rule: "EM_DASH",
        severity: "error",
        detail: `Em dash in description.`,
      });
    }
  }

  if (errors.length === 0) {
    console.log(`✓ SEO lint passed (${pages.length} pages scanned)`);
    return;
  }

  console.error(`\n✗ SEO lint failed: ${errors.length} violation(s)\n`);
  for (const e of errors) {
    console.error(`  [${e.rule}] ${e.file}`);
    console.error(`    ${e.detail}`);
    console.error();
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("SEO linter crashed:", err);
  process.exit(2);
});
