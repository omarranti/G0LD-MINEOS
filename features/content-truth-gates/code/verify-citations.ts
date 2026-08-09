/**
 * Verify every citation in the citation-bearing pSEO data files
 * (how-to, quotes, coping, what-is, when) against the real PMC/PubMed
 * record. Writes scripts/audit/audit-report.md.
 *
 * Strategy:
 *   - Walk the JSON files, collect every source with its slug + cluster.
 *   - Parse URL into { db: 'pmc'|'pubmed'|'other', id }.
 *   - Batch-query NCBI E-utilities esummary (comma-separated ids, db at a time).
 *   - Token-overlap score between cited label and fetched title.
 *   - Sort report by lowest score first.
 */

import fs from 'fs';
import path from 'path';

type Source = { label: string; url: string; publisher?: string };
type Entry = {
  cluster: string;
  slug: string;
  label: string;
  url: string;
  db: 'pmc' | 'pubmed' | 'ncbi-books' | 'other';
  id: string | null;
};

const ROOT = path.resolve(__dirname, '../..');
const CLUSTERS = ['how-to', 'quotes', 'coping', 'what-is', 'when'];
const OUT = path.join(__dirname, 'audit-report.md');

function parseUrl(url: string): { db: Entry['db']; id: string | null } {
  try {
    const u = new URL(url);
    if (u.hostname === 'pmc.ncbi.nlm.nih.gov') {
      const m = u.pathname.match(/\/articles\/PMC(\d+)/i);
      return { db: 'pmc', id: m ? m[1] : null };
    }
    if (u.hostname === 'www.ncbi.nlm.nih.gov') {
      const pmc = u.pathname.match(/\/pmc\/articles\/PMC(\d+)/i);
      if (pmc) return { db: 'pmc', id: pmc[1] };
      const book = u.pathname.match(/\/books\/(NBK\d+)/i);
      if (book) return { db: 'ncbi-books', id: book[1] };
    }
    if (u.hostname === 'pubmed.ncbi.nlm.nih.gov') {
      const m = u.pathname.match(/\/(\d+)/);
      return { db: 'pubmed', id: m ? m[1] : null };
    }
    return { db: 'other', id: null };
  } catch {
    return { db: 'other', id: null };
  }
}

function collectEntries(): Entry[] {
  const result: Entry[] = [];
  for (const cluster of CLUSTERS) {
    const file = path.join(ROOT, `content/pseo/data/${cluster}.json`);
    const pages = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const page of pages) {
      const sources: Source[] = page.sources || [];
      for (const s of sources) {
        const { db, id } = parseUrl(s.url);
        result.push({ cluster, slug: page.slug, label: s.label || '', url: s.url, db, id });
      }
    }
  }
  return result;
}

const STOP = new Set([
  'a', 'an', 'and', 'or', 'of', 'the', 'in', 'on', 'for', 'to', 'with', 'by',
  'from', 'at', 'as', 'is', 'are', 'be', 'this', 'that', 'these', 'those',
  'study', 'studies', 'review', 'reviews', 'analysis', 'meta', 'metaanalysis',
  'effects', 'effect', 'evidence', 'paper', 'article', 'journal', 'research',
  'systematic', 'randomized', 'controlled', 'trial', 'pmc', 'nih', 'apa',
]);

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !STOP.has(t))
  );
}

function overlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / ta.size;
}

async function esummaryBatch(db: 'pmc' | 'pubmed', ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=${db}&id=${ids.join(',')}&retmode=json`;
  const titles: Record<string, string> = {};
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: any = await res.json();
      const result = json.result || {};
      const uids: string[] = result.uids || [];
      for (const uid of uids) {
        const rec = result[uid];
        if (rec && typeof rec === 'object') {
          titles[uid] = rec.title || rec.error || '';
        }
      }
      return titles;
    } catch (e) {
      if (attempt === 2) {
        console.warn(`  retry ${attempt} failed for ${db}:`, (e as Error).message);
        return titles;
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return titles;
}

async function main() {
  console.log('Collecting citations...');
  const entries = collectEntries();
  console.log(`  ${entries.length} total citations`);
  const byDb = {
    pmc: entries.filter(e => e.db === 'pmc' && e.id),
    pubmed: entries.filter(e => e.db === 'pubmed' && e.id),
    other: entries.filter(e => e.db !== 'pmc' && e.db !== 'pubmed'),
    ncbiBooks: entries.filter(e => e.db === 'ncbi-books'),
  };
  console.log(`  pmc=${byDb.pmc.length} pubmed=${byDb.pubmed.length} ncbi-books=${byDb.ncbiBooks.length} other=${byDb.other.length}`);

  const pmcTitles: Record<string, string> = {};
  const pubmedTitles: Record<string, string> = {};

  const CHUNK = 100;
  for (const [db, list, target] of [
    ['pmc', byDb.pmc, pmcTitles] as const,
    ['pubmed', byDb.pubmed, pubmedTitles] as const,
  ]) {
    const uniqueIds = Array.from(new Set(list.map(e => e.id!)));
    console.log(`Fetching ${db}: ${uniqueIds.length} unique ids`);
    for (let i = 0; i < uniqueIds.length; i += CHUNK) {
      const chunk = uniqueIds.slice(i, i + CHUNK);
      const got = await esummaryBatch(db as 'pmc' | 'pubmed', chunk);
      Object.assign(target, got);
      // NCBI rate limit: <=3 req/sec without API key. We're well under.
      await new Promise(r => setTimeout(r, 400));
      console.log(`  ${db}: ${Object.keys(target).length}/${uniqueIds.length}`);
    }
  }

  type Row = {
    cluster: string;
    slug: string;
    db: string;
    id: string;
    url: string;
    label: string;
    actual: string;
    score: number;
    note: string;
  };
  const rows: Row[] = [];
  for (const e of entries) {
    let actual = '';
    let note = '';
    if (e.db === 'pmc' && e.id) {
      actual = pmcTitles[e.id] || '';
      if (!actual) note = 'no title returned (id may be invalid)';
    } else if (e.db === 'pubmed' && e.id) {
      actual = pubmedTitles[e.id] || '';
      if (!actual) note = 'no title returned (id may be invalid)';
    } else if (e.db === 'ncbi-books') {
      note = 'NCBI Bookshelf — manual check needed';
    } else {
      note = 'non-PMC source — manual check needed';
    }
    const score = actual ? overlap(e.label, actual) : -1;
    rows.push({
      cluster: e.cluster,
      slug: e.slug,
      db: e.db,
      id: e.id || '',
      url: e.url,
      label: e.label,
      actual,
      score,
      note,
    });
  }

  rows.sort((a, b) => {
    // unfetchable manual-check rows go to bottom; rest sorted ascending by score
    if (a.score < 0 && b.score >= 0) return 1;
    if (b.score < 0 && a.score >= 0) return -1;
    return a.score - b.score;
  });

  const FLAG = 0.25;
  const flagged = rows.filter(r => r.score >= 0 && r.score < FLAG);
  const manual = rows.filter(r => r.score < 0);
  const clean = rows.filter(r => r.score >= FLAG);

  const lines: string[] = [];
  lines.push('# Citation Audit Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`- **Total citations:** ${rows.length}`);
  lines.push(`- **Flagged (score < ${FLAG}, likely wrong):** ${flagged.length}`);
  lines.push(`- **Manual check needed (non-PMC or unfetchable):** ${manual.length}`);
  lines.push(`- **Clean (score >= ${FLAG}):** ${clean.length}`);
  lines.push('');
  lines.push('Token-overlap score = (cited label tokens that appear in actual title) / (cited label tokens). Stopwords removed. Score < 0.25 is almost certainly a hallucination; 0.25 to 0.5 deserves a look.');
  lines.push('');

  function renderRows(list: Row[], heading: string) {
    if (!list.length) return;
    lines.push(`## ${heading}`);
    lines.push('');
    for (const r of list) {
      lines.push(`### ${r.cluster}/${r.slug} — score ${r.score >= 0 ? r.score.toFixed(2) : 'N/A'}`);
      lines.push(`- **Cited:** ${r.label}`);
      lines.push(`- **Actual:** ${r.actual || '(unfetched)'}`);
      lines.push(`- **URL:** ${r.url}`);
      if (r.note) lines.push(`- **Note:** ${r.note}`);
      lines.push('');
    }
  }

  renderRows(flagged, `Flagged (score < ${FLAG})`);
  renderRows(rows.filter(r => r.score >= FLAG && r.score < 0.5), 'Borderline (0.25–0.5)');
  renderRows(manual, 'Manual check needed (non-PMC or unfetchable)');

  lines.push(`## Clean (${clean.length})`);
  lines.push('');
  lines.push('Brief listing only — manual spot-check optional.');
  lines.push('');
  for (const r of clean) {
    lines.push(`- \`${r.cluster}/${r.slug}\` ${r.score.toFixed(2)} — ${r.label.slice(0, 80)}`);
  }

  fs.writeFileSync(OUT, lines.join('\n'));
  console.log(`Wrote ${OUT}`);
  console.log(`Summary: flagged=${flagged.length} manual=${manual.length} clean=${clean.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
