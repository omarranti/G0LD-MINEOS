#!/usr/bin/env tsx
/**
 * Caching-correctness linter. Runs in CI (build + verify) and on
 * `npm run lint:caching`.
 *
 * The bug class it guards: a page whose render tree reaches Prisma but that
 * declares no caching posture renders STATICALLY at build, and its DB-derived
 * numbers silently freeze until the next deploy. Prisma reads (unlike fetch)
 * are invisible to Next's dynamic detection, so the framework never warns.
 * Reference incident: homepage hero counts frozen at deploy.
 *
 * Rule: every page.tsx / layout.tsx under src/app that TRANSITIVELY imports
 * @/lib/db must declare an explicit caching posture. Accepted postures:
 *   - `export const revalidate = N`
 *   - `export const dynamic = "..."`
 *   - an ancestor layout.tsx exporting `dynamic = "force-dynamic"`
 *   - request-time APIs in the file itself: searchParams, cookies(),
 *     headers(), auth(), unstable_noStore(), connection(), draftMode()
 *   - a leading "use client" directive (client components cannot run Prisma
 *     during server render)
 *   - a `// caching-lint-ignore: <reason>` comment, for module-level false
 *     positives (a page importing only constants from a module that also
 *     exports DB functions). The reason is mandatory and lives in the file.
 *
 * Transitive analysis: a static import graph over src/, following
 * string-literal `import ... from` / `export ... from` specifiers, resolving
 * the `@/` alias and relative paths. Traversal does NOT continue through
 * "use server" modules (server actions imported by a page run on invocation,
 * not at render).
 *
 * Known limits: dynamic `import(variable)` and aliases other than `@/` are
 * invisible. Neither is used under src/ today.
 *
 * Exit codes: 0 clean, 1 violations, 2 crash.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";

const SRC = resolve("src");
const DB_MODULE = join(SRC, "lib", "db.ts");

function walk(dir: string, hits: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, hits);
    else if (/\.(ts|tsx)$/.test(entry)) hits.push(p);
  }
  return hits;
}

/** Resolve an import specifier to an absolute file under src/, or null. */
function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // package import
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function importSpecifiers(src: string): string[] {
  const specs: string[] = [];
  // import ... from "x" | export ... from "x" | import "x"
  const re = /(?:import|export)\s+(?:[^;'"]*?from\s+)?["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) specs.push(m[1]);
  return specs;
}

function hasLeadingDirective(src: string, directive: string): boolean {
  // Match "use client"/"use server" as the first statement (after comments).
  const head = src.slice(0, 600);
  return new RegExp(`^\\s*(?:\\/\\/[^\\n]*\\n|\\/\\*[\\s\\S]*?\\*\\/\\s*)*["']${directive}["']`).test(head);
}

function pathToRoute(filePath: string): string {
  const route = filePath
    .replace(/^src\/app/, "")
    .replace(/\/(page|layout)\.tsx$/, "")
    .replace(/\/\([^)]+\)/g, "");
  return route || "/";
}

function main() {
  const files = walk(SRC);
  const sources = new Map<string, string>();
  for (const f of files) sources.set(f, readFileSync(f, "utf-8"));

  // Reverse-BFS from @/lib/db: the set of modules that transitively import it.
  // Cycle-safe by construction. "use server" modules are marked reachable but
  // their importers are not (actions do not execute at render).
  const importers = new Map<string, string[]>();
  for (const [file, src] of sources) {
    for (const spec of importSpecifiers(src)) {
      const target = resolveSpecifier(spec, file);
      if (!target) continue;
      if (!importers.has(target)) importers.set(target, []);
      importers.get(target)!.push(file);
    }
  }

  const reachesDb = new Set<string>();
  const queue: string[] = [DB_MODULE];
  while (queue.length > 0) {
    const mod = queue.pop()!;
    if (reachesDb.has(mod)) continue;
    reachesDb.add(mod);
    const src = sources.get(mod);
    if (mod !== DB_MODULE && src && hasLeadingDirective(src, "use server")) continue;
    for (const parent of importers.get(mod) ?? []) queue.push(parent);
  }

  // Check every page.tsx / layout.tsx under src/app.
  const APP = join(SRC, "app");
  const routeFiles = files.filter(
    (f) => f.startsWith(APP + sep) && /\/(page|layout)\.tsx$/.test(f),
  );

  const forceDynamicLayouts = new Set(
    routeFiles.filter(
      (f) =>
        f.endsWith("layout.tsx") &&
        /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(sources.get(f)!),
    ),
  );

  function underForceDynamicLayout(file: string): boolean {
    let dir = dirname(file);
    while (dir.startsWith(APP)) {
      if (forceDynamicLayouts.has(join(dir, "layout.tsx"))) return true;
      if (dir === APP) break;
      dir = dirname(dir);
    }
    return false;
  }

  const DYNAMIC_MARKERS =
    /\bsearchParams\b|\bcookies\s*\(|\bheaders\s*\(|\bauth\s*\(|\bunstable_noStore\s*\(|\bconnection\s*\(|\bdraftMode\s*\(/;

  const violations: string[] = [];
  for (const file of routeFiles) {
    if (!reachesDb.has(file)) continue;
    const src = sources.get(file)!;
    if (hasLeadingDirective(src, "use client")) continue;
    if (/\/\/\s*caching-lint-ignore:\s*\S/.test(src)) continue;
    if (/export\s+const\s+(revalidate|dynamic)\s*=/.test(src)) continue;
    if (DYNAMIC_MARKERS.test(src)) continue;
    if (underForceDynamicLayout(file)) continue;
    const rel = relative(process.cwd(), file);
    violations.push(
      `  [NO_CACHING_DIRECTIVE] ${rel}\n` +
        `    Route ${pathToRoute(rel)} transitively reads Prisma but declares no caching posture.\n` +
        `    Its DB-derived output will freeze at deploy. Add \`export const revalidate = N\`\n` +
        `    or \`export const dynamic\`.`,
    );
  }

  if (violations.length === 0) {
    console.log(`✓ Caching lint passed (${routeFiles.length} route files, ${reachesDb.size} DB-reaching modules)`);
    return;
  }
  console.error(`\n✗ Caching lint failed: ${violations.length} violation(s)\n`);
  for (const v of violations) console.error(v + "\n");
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error("Caching linter crashed:", err);
  process.exit(2);
}
