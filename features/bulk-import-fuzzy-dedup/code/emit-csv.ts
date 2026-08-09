/**
 * Emit import-ready CSVs from merged batch JSON for the admin bulk importer.
 *
 * - import/<batch>.insert.csv    -- new listings. Authority-sourced batches
 *   ship status=ACTIVE + verificationStatus=VERIFIED; pass --pending to ship
 *   PENDING + SELF_REPORTED instead (discovery batches).
 * - import/<batch>.enrich.csv    -- rows matching existing prod listings; run
 *   through the importer's enrich mode (fills gaps only).
 *
 * Run: npx tsx scripts/acquisition/emit-csv.ts <batch-name> [--pending]
 */
import fs from "node:fs";
import path from "node:path";
import { ACQ, type MergedRecord, csvEscape, readJson } from "./lib";

const batch = process.argv[2];
if (!batch) {
  console.error("usage: npx tsx scripts/acquisition/emit-csv.ts <batch-name> [--pending]");
  process.exit(1);
}
const pending = process.argv.includes("--pending");
const status = pending ? "PENDING" : "ACTIVE";
const verStatus = pending ? "SELF_REPORTED" : "VERIFIED";

const COLS = [
  "name", "type", "city", "state", "address", "postalCode", "phone",
  "website", "latitude", "longitude", "authority", "authorityName",
  "verificationStatus", "status", "attrA", "attrB", "sourceUrl",
  "sourceId",
] as const;

function toRow(r: MergedRecord, s: string, vs: string): string {
  const vals: Record<(typeof COLS)[number], unknown> = {
    name: r.name.trim(),
    type: r.type || "OTHER",
    city: r.cityDbName,
    state: r.state,
    address: r.address || "",
    postalCode: r.postalCode || "",
    phone: r.phone || "",
    website: r.website || "",
    latitude: r.latitude ?? "",
    longitude: r.longitude ?? "",
    authority: r.authority || "OTHER",
    authorityName: r.authorityName || "",
    verificationStatus: vs,
    status: s,
    attrA: r.attrA ? "true" : "false",
    attrB: r.attrB ? "true" : "false",
    sourceUrl: r.sourceUrl || r.provenance[0]?.sourceUrl || "",
    sourceId: r.sourceId || r.provenance[0]?.sourceId || "",
  };
  return COLS.map((c) => csvEscape(vals[c])).join(",");
}

function emit(jsonPath: string, csvPath: string, s: string, vs: string): number {
  if (!fs.existsSync(jsonPath)) return 0;
  const records = readJson<MergedRecord[]>(jsonPath);
  if (records.length === 0) return 0;
  const lines = [COLS.join(","), ...records.map((r) => toRow(r, s, vs))];
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, lines.join("\n") + "\n");
  return records.length;
}

const importDir = path.join(ACQ, "import");
const n1 = emit(
  path.join(ACQ, "merged", `${batch}.json`),
  path.join(importDir, `${batch}.insert.csv`),
  status, verStatus,
);
// Enrich rows never carry status (enrich mode ignores it anyway) but keep
// VERIFIED so an authority match upgrades a prod row's verification claim.
const n2 = emit(
  path.join(ACQ, "merged", `${batch}.enrich.json`),
  path.join(importDir, `${batch}.enrich.csv`),
  "DRAFT", verStatus,
);

console.log(`${batch}: insert.csv=${n1} rows (${status}/${verStatus}), enrich.csv=${n2} rows`);
