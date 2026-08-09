/**
 * Seed data/acquisition/config/city-aliases.json from the site's city config
 * (the same config that drives programmatic city hub pages).
 * Key = "<lowercase raw variant>|<STATE>", value = { dbName, state }.
 * City-level entries win over neighborhood rollups; hand-added aliases in
 * config/city-aliases.extra.json are merged last and always win.
 *
 * Run: npx tsx scripts/acquisition/build-city-aliases.ts
 */
import fs from "node:fs";
import path from "node:path";
// Swap for your own city/geo config module. Expected shape per city:
// { name, dbName, stateAbbr, dbNames?: string[], neighborhoods?: string[] }
import { CITIES } from "../../src/config/cities";
import { ACQ, writeJson, type CityAlias } from "./lib";

const aliases: Record<string, CityAlias> = {};

function add(raw: string, state: string, dbName: string, force = false) {
  const key = `${raw.trim().toLowerCase()}|${state.toUpperCase()}`;
  if (!key.startsWith("|") && (force || !aliases[key])) {
    aliases[key] = { dbName, state: state.toUpperCase() };
  }
}

// Pass 1: city-level names (authoritative). dbNames members map to
// THEMSELVES: prod stores borough/municipality-level city values and the
// hub aggregates them, so "Brooklyn" stays "Brooklyn".
for (const city of CITIES) {
  const st = city.stateAbbr;
  add(city.dbName, st, city.dbName, true);
  add(city.name, st, city.dbName);
  for (const dn of city.dbNames ?? []) add(dn, st, dn);
}

// Pass 2: neighborhoods roll up to their city's dbName, but never shadow a
// real city entry (e.g. Brooklyn is both an NYC dbNames member and its own
// hub; pass 1 already claimed it).
for (const city of CITIES) {
  for (const hood of city.neighborhoods ?? []) add(hood, city.stateAbbr, city.dbName);
}

// Pass 3: hand-maintained extras (created on first run; edit freely).
const extraPath = path.join(ACQ, "config", "city-aliases.extra.json");
if (fs.existsSync(extraPath)) {
  const extra: Record<string, CityAlias> = JSON.parse(fs.readFileSync(extraPath, "utf8"));
  for (const [k, v] of Object.entries(extra)) {
    // Key format is "<city>|<STATE>": lowercase the city half only, so the
    // lookup in normalizeCity (which uppercases the state) always hits.
    const [rawCity, rawState] = k.split("|");
    aliases[`${(rawCity || "").toLowerCase()}|${(rawState || "").toUpperCase()}`] = v;
  }
} else {
  writeJson(extraPath, {});
}

writeJson(path.join(ACQ, "config", "city-aliases.json"), aliases);
console.log(`wrote ${Object.keys(aliases).length} aliases for ${CITIES.length} cities`);
