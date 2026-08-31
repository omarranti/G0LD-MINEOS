#!/usr/bin/env node
/**
 * Read a project's timelog JSONL + (optional) hand-written archive,
 * compute totals, and regenerate the human-readable markdown view.
 *
 * Usage:
 *   timelog-compute.mjs --project acme
 *   timelog-compute.mjs --project acme --dry-run    # print, don't write
 *
 * Files used:
 *   ~/.claude/timelog/<project>.jsonl  (source)
 *   ~/.claude/timelog_<project>_archive.md  (optional, prior history; appended verbatim)
 *   ~/.claude/timelog_<project>.md  (output)
 *
 * Notes:
 *   - The archive is opaque text. We don't try to parse session numbers
 *     out of it; we just preserve it verbatim under "## Archive (manual entries)".
 *   - Session numbers in the rendered view are assigned chronologically by
 *     loggedAt, so concurrent tabs never race on numbering.
 *   - priorTotalHours can be set in the optional config file
 *     ~/.claude/timelog/<project>.config.json
 *     to roll forward an archive baseline into the totals header.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const MEM_ROOT = join(homedir(), '.claude');
const TIMELOG_ROOT = join(MEM_ROOT, 'timelog');

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') out.project = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

const args = parseArgs(process.argv);
if (!args.project) {
  console.error('timelog-compute: --project required');
  process.exit(1);
}

const jsonlPath = join(TIMELOG_ROOT, `${args.project}.jsonl`);
const configPath = join(TIMELOG_ROOT, `${args.project}.config.json`);
const archivePath = join(MEM_ROOT, `timelog_${args.project}_archive.md`);
const outPath = join(MEM_ROOT, `timelog_${args.project}.md`);

let priorTotal = 0;
let priorSessions = 0;
let priorAsOf = null;
if (existsSync(configPath)) {
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  priorTotal = Number(cfg.priorTotalHours ?? 0);
  priorSessions = Number(cfg.priorSessionCount ?? 0);
  priorAsOf = cfg.priorAsOf ?? null;
}

const rows = existsSync(jsonlPath)
  ? readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean).map((l, i) => {
      try { return JSON.parse(l); }
      catch (e) { console.error(`malformed JSONL line ${i + 1}: ${e.message}`); return null; }
    }).filter(Boolean)
  : [];

// chronological by loggedAt, with date fallback
rows.sort((a, b) => {
  const ka = a.loggedAt ?? a.date ?? '';
  const kb = b.loggedAt ?? b.date ?? '';
  return ka.localeCompare(kb);
});

const totalJsonl = rows.reduce((acc, r) => acc + (typeof r.hours === 'number' ? r.hours : 0), 0);
const grandTotal = priorTotal + totalJsonl;
const grandSessions = priorSessions + rows.length;

// per-month breakdown from JSONL
const byMonth = new Map();
for (const r of rows) {
  const month = (r.date ?? '').slice(0, 7);
  if (!month) continue;
  const cur = byMonth.get(month) ?? { sessions: 0, hours: 0 };
  cur.sessions += 1;
  cur.hours += r.hours;
  byMonth.set(month, cur);
}

function renderBullets(items, label) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return `**${label}:**\n${items.map((i) => `- ${i}`).join('\n')}\n\n`;
}

function renderEntry(r, num) {
  const lines = [];
  lines.push(`## Session ${num} — ${r.date} — ${r.title}\n`);
  if (r.task) lines.push(`**Task:** ${r.task}\n\n`);
  lines.push(renderBullets(r.whatChanged, 'What changed'));
  lines.push(renderBullets(r.userFacing, 'User facing'));
  lines.push(renderBullets(r.businessImpact, 'Business impact'));
  lines.push(renderBullets(r.decisions, 'Decisions'));
  lines.push(renderBullets(r.verified, 'Verified'));
  lines.push(renderBullets(r.risks, 'Risks'));
  lines.push(renderBullets(r.next, 'Next'));
  if (Array.isArray(r.commits) && r.commits.length) {
    lines.push(`**Commits:** ${r.commits.map((c) => `\`${c}\``).join(', ')}\n\n`);
  }
  if (Array.isArray(r.hoursBreakdown) && r.hoursBreakdown.length) {
    const parts = r.hoursBreakdown.map((b) => `${b.label} ${b.hours}h`).join(' · ');
    lines.push(`**Hours:** ${r.hours}h (${parts})\n\n`);
  } else {
    lines.push(`**Hours:** ${r.hours}h\n\n`);
  }
  if (r.notes) lines.push(`${r.notes}\n\n`);
  if (r.id || r.loggedAt) {
    const meta = [];
    if (r.id) meta.push(`id: \`${r.id}\``);
    if (r.loggedAt) meta.push(`logged: ${r.loggedAt}`);
    if (r.claudeChatId) meta.push(`chat: \`${r.claudeChatId}\``);
    lines.push(`<sub>${meta.join(' · ')}</sub>\n\n`);
  }
  lines.push(`---\n\n`);
  return lines.join('');
}

const header = [
  `# ${args.project} time log\n\n`,
  `> Generated from \`timelog/${args.project}.jsonl\` by \`timelog-compute.mjs\`.\n`,
  `> Do not hand-edit this file. Append new sessions via the \`/log-session\` slash command or \`timelog-append.mjs\`.\n\n`,
  `## Totals\n\n`,
  `- **All-time:** ${grandTotal.toFixed(1)}h across ${grandSessions} sessions\n`,
  priorTotal ? `  - prior baseline: ${priorTotal.toFixed(1)}h / ${priorSessions} sessions${priorAsOf ? ` (as of ${priorAsOf})` : ''}\n` : '',
  rows.length ? `  - tracked here (JSONL): ${totalJsonl.toFixed(1)}h / ${rows.length} sessions\n` : '',
  byMonth.size ? `\n**Per month (JSONL only):**\n${Array.from(byMonth.entries()).sort().map(([m, v]) => `- ${m}: ${v.sessions} session${v.sessions === 1 ? '' : 's'}, ${v.hours.toFixed(1)}h`).join('\n')}\n` : '',
  `\n---\n\n`,
].join('');

const startingNumber = priorSessions + 1;
const rendered = rows
  .map((r, i) => renderEntry(r, startingNumber + i))
  .reverse() // newest first, matching the existing convention
  .join('');

let archiveBlock = '';
if (existsSync(archivePath)) {
  const archive = readFileSync(archivePath, 'utf8');
  archiveBlock = `## Archive (manual entries, pre-JSONL)\n\n` + archive.trim() + '\n';
}

const out = header + (rendered || '_no JSONL entries yet_\n\n') + archiveBlock;

if (args.dryRun) {
  process.stdout.write(out);
} else {
  writeFileSync(outPath, out);
  console.error(`timelog-compute: wrote ${outPath}`);
  console.error(`  ${grandTotal.toFixed(1)}h total / ${grandSessions} sessions`);
  console.error(`  ${rows.length} from JSONL, ${priorSessions} from archive baseline`);
}
