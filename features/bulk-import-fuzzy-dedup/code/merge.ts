/**
 * Cross-source merge + dedup for the acquisition pipeline.
 *
 * Reads every data/acquisition/normalized/<source>.json, normalizes cities
 * against the alias map, merges duplicates across sources, then splits the
 * result against the prod snapshot: new records go to merged/<batch>.json,
 * records already in prod go to merged/<batch>.enrich.json (gap-fill only).
 *
 * Merge rule: two records are the same place iff normKey equal, OR phoneKey
 * equal, OR (addrKey equal AND name Jaccard >= 0.5). Near-misses (Jaccard
 * 0.3-0.5 on same addrKey, or same normalized name in same state but
 * different city) go to reports/needs-human-dedup.md and are NOT
 * auto-merged.
 *
 * Authority precedence between sources: earlier in SOURCE_PRIORITY wins the
 * authority fields; later sources fill remaining gaps and are kept in
 * provenance.
 *
 * Run: npx tsx scripts/acquisition/merge.ts <batch-name> [source ...]
 */
import fs from "node:fs";
import path from "node:path";
import {
  ACQ, type SourceRecord, type MergedRecord, slugify, normalizeName,
  nameTokens, jaccard, phoneKey, addrKey, normalizeCity, loadCityAliases,
  isUsState, readJson, writeJson,
} from "./lib";

// Highest-trust source first. Files are named <source>.json in normalized/.
const SOURCE_PRIORITY = ["source-a", "source-b", "source-c"];

const batch = process.argv[2];
if (!batch) {
  console.error("usage: npx tsx scripts/acquisition/merge.ts <batch-name> [source ...]");
  process.exit(1);
}
const only = process.argv.slice(3);

const aliases = loadCityAliases();
const normalizedDir = path.join(ACQ, "normalized");
const sources = fs
  .readdirSync(normalizedDir)
  .filter((f) => f.endsWith(".json") && !f.endsWith(".meta.json"))
  .map((f) => f.replace(/\.json$/, ""))
  .filter((s) => only.length === 0 || only.includes(s))
  .sort((a, b) => {
    const ia = SOURCE_PRIORITY.indexOf(a);
    const ib = SOURCE_PRIORITY.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

interface Keyed extends MergedRecord {
  normKey: string;
  pKey: string | null;
  aKey: string | null;
  tokens: Set<string>;
}

const merged: Keyed[] = [];
const byNormKey = new Map<string, Keyed>();
const byPhone = new Map<string, Keyed>();
const byAddr = new Map<string, Keyed[]>();
const needsHuman: string[] = [];
const unmapped = new Map<string, number>();
const dropped: string[] = [];
let totalIn = 0;

function fillGaps(target: Keyed, src: SourceRecord, source: string) {
  const fillable: Array<keyof SourceRecord> = [
    "address", "postalCode", "phone", "website",
  ];
  for (const f of fillable) {
    if (!target[f] && src[f]) (target as unknown as Record<string, unknown>)[f] = src[f];
  }
  if (target.latitude == null && src.latitude != null) {
    target.latitude = src.latitude;
    target.longitude = src.longitude;
  }
  if (src.attrA) target.attrA = true;
  if (src.attrB) target.attrB = true;
  target.provenance.push({ source, sourceUrl: src.sourceUrl, sourceId: src.sourceId });
}

for (const source of sources) {
  const records = readJson<SourceRecord[]>(path.join(normalizedDir, `${source}.json`));
  for (const raw of records) {
    totalIn++;
    if (!raw.name?.trim() || !raw.city?.trim() || !isUsState(raw.state)) {
      dropped.push(`${source}: ${raw.name || "(no name)"} / ${raw.city || "?"}, ${raw.state || "?"}`);
      continue;
    }
    const state = raw.state.trim().toUpperCase();
    const { city, mapped } = normalizeCity(raw.city, state, aliases);
    if (!mapped) unmapped.set(`${city}, ${state}`, (unmapped.get(`${city}, ${state}`) || 0) + 1);

    const rec: Keyed = {
      ...raw,
      state,
      source,
      cityDbName: city,
      city,
      cityMapped: mapped,
      slug: slugify(raw.name, city),
      provenance: [{ source, sourceUrl: raw.sourceUrl, sourceId: raw.sourceId }],
      normKey: `${normalizeName(raw.name)}|${city.toLowerCase()}`,
      pKey: phoneKey(raw.phone),
      aKey: addrKey(raw.address, raw.postalCode),
      tokens: nameTokens(raw.name),
    };

    // Exact cross-source match?
    let hit = byNormKey.get(rec.normKey) || (rec.pKey ? byPhone.get(rec.pKey) : undefined);
    if (!hit && rec.aKey) {
      for (const cand of byAddr.get(rec.aKey) || []) {
        const j = jaccard(rec.tokens, cand.tokens);
        if (j >= 0.5) { hit = cand; break; }
        if (j >= 0.3) {
          needsHuman.push(
            `same address key ${rec.aKey}, name jaccard ${j.toFixed(2)}: "${cand.name}" (${cand.source}) vs "${rec.name}" (${source}) in ${city}, ${state}`,
          );
        }
      }
    }

    if (hit) {
      fillGaps(hit, rec, source);
      continue;
    }

    merged.push(rec);
    byNormKey.set(rec.normKey, rec);
    if (rec.pKey) byPhone.set(rec.pKey, rec);
    if (rec.aKey) {
      const arr = byAddr.get(rec.aKey) || [];
      arr.push(rec);
      byAddr.set(rec.aKey, arr);
    }
  }
}

// Split against prod: slug / phone / addr+name matches become enrich rows.
interface ProdRow {
  slug: string; name: string; city: string; state: string;
  phone: string | null; latitude: number | null; longitude: number | null;
  authority: string; authority_name: string | null; status: string; type: string;
}
const snapshot = readJson<{ rows: ProdRow[] }>(path.join(ACQ, "cache", "prod-snapshot.json"));
const prodSlugs = new Set(snapshot.rows.map((r) => r.slug));
const prodPhones = new Map(
  snapshot.rows.map((r) => [phoneKey(r.phone), r] as const).filter(([k]) => k) as Array<[string, ProdRow]>,
);
const prodNormKeys = new Map(
  snapshot.rows.map((r) => [`${normalizeName(r.name)}|${r.city.toLowerCase()}`, r]),
);

const inserts: Keyed[] = [];
const enrich: Array<Keyed & { prodSlug: string }> = [];
for (const rec of merged) {
  const prodRow = prodNormKeys.get(rec.normKey) || (rec.pKey && prodPhones.get(rec.pKey)) || null;
  if (prodSlugs.has(rec.slug) || prodRow) {
    // Enrich mode matches by slugify(name, city), so the row must carry the
    // PROD name/city. A phone-matched record with a differently-normalized
    // city would otherwise miss its target.
    const e = { ...rec, prodSlug: prodRow ? prodRow.slug : rec.slug };
    if (prodRow) {
      e.name = prodRow.name;
      e.cityDbName = prodRow.city;
      e.city = prodRow.city;
      e.state = prodRow.state;
      e.slug = prodRow.slug;
    }
    enrich.push(e);
  } else {
    inserts.push(rec);
  }
}

const strip = ({ normKey, pKey, aKey, tokens, ...keep }: Keyed) => keep;
writeJson(path.join(ACQ, "merged", `${batch}.json`), inserts.map(strip));
writeJson(path.join(ACQ, "merged", `${batch}.enrich.json`), enrich.map(strip));

const reportLines = [
  `# merge report: ${batch}`,
  ``,
  `sources (priority order): ${sources.join(", ")}`,
  `records in: ${totalIn}`,
  `dropped (missing name/city or non-US state): ${dropped.length}`,
  `unique places after cross-source merge: ${merged.length}`,
  `new (insert): ${inserts.length}`,
  `already in prod (enrich): ${enrich.length}`,
  ``,
  `## unmapped cities (import fine, no hub page yet)`,
  ...[...unmapped.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `- ${c}: ${n}`),
  ``,
  `## needs human dedup (NOT auto-merged)`,
  ...(needsHuman.length ? needsHuman.map((l) => `- ${l}`) : ["- none"]),
  ``,
  `## dropped rows`,
  ...(dropped.length ? dropped.map((l) => `- ${l}`) : ["- none"]),
];
fs.mkdirSync(path.join(ACQ, "reports"), { recursive: true });
fs.writeFileSync(path.join(ACQ, "reports", `${batch}.merge.md`), reportLines.join("\n") + "\n");

console.log(
  `${batch}: in=${totalIn} dropped=${dropped.length} unique=${merged.length} insert=${inserts.length} enrich=${enrich.length} unmappedCities=${unmapped.size} needsHuman=${needsHuman.length}`,
);
