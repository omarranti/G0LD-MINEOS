#!/usr/bin/env node
/**
 * Append one session entry to a project's timelog JSONL.
 *
 * Usage:
 *   echo '{"project":"acme","hours":1.5,...}' | timelog-append.mjs
 *   timelog-append.mjs --project acme --json '{...}'
 *
 * One line per entry. Append is atomic via O_APPEND, so concurrent
 * Claude tabs writing at the same time won't clobber each other.
 *
 * Required JSON fields:
 *   project      string   slug; maps to memory/timelog/<project>.jsonl
 *   date         string   YYYY-MM-DD (the session date, not loggedAt)
 *   title        string   short headline
 *   hours        number   total billable hours for this session
 *
 * Optional fields:
 *   task              string
 *   whatChanged       string[]
 *   verified          string[]
 *   decisions         string[]
 *   risks             string[]
 *   next              string[]
 *   commits           string[]   git short hashes
 *   hoursBreakdown    {label, hours}[]
 *   claudeChatId      string
 *   notes             string     freeform tail
 *
 * Auto-assigned:
 *   id           {date}-{project}-{random}
 *   loggedAt     ISO timestamp
 *
 * Stdout: the new line that was appended, plus the rolling total for this
 * project (sum of hours across the JSONL, no per-day cap).
 */
import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const TIMELOG_ROOT = join(homedir(), '.claude/timelog');

function fatal(msg) {
  console.error(`timelog-append: ${msg}`);
  process.exit(1);
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') out.project = argv[++i];
    else if (a === '--json') out.json = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith(' *')).map(l => l.replace(/^ \*\s?/, '')).join('\n'));
      process.exit(0);
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const stdin = await readStdin();
const raw = args.json ?? stdin;
if (!raw) fatal('no JSON given (pass via stdin or --json)');

let entry;
try { entry = JSON.parse(raw); }
catch (e) { fatal(`could not parse JSON: ${e.message}`); }

const project = entry.project ?? args.project;
if (!project) fatal('project field required');
if (!entry.date) fatal('date field required (YYYY-MM-DD)');
if (typeof entry.hours !== 'number') fatal('hours field required (number)');
if (!entry.title) fatal('title field required');

entry.project = project;
entry.id = entry.id ?? `${entry.date}-${project}-${Math.random().toString(36).slice(2, 8)}`;
entry.loggedAt = entry.loggedAt ?? new Date().toISOString();

if (!existsSync(TIMELOG_ROOT)) mkdirSync(TIMELOG_ROOT, { recursive: true });
const jsonlPath = join(TIMELOG_ROOT, `${project}.jsonl`);
if (!existsSync(dirname(jsonlPath))) mkdirSync(dirname(jsonlPath), { recursive: true });

// O_APPEND on POSIX is atomic for writes <= PIPE_BUF (4096 bytes).
// Use a newline-terminated single line and never go larger than that.
const line = JSON.stringify(entry);
if (line.length > 3800) fatal(`entry too large (${line.length} bytes); split into multiple sessions or shorten notes`);
appendFileSync(jsonlPath, line + '\n', { flag: 'a' });

// Compute the rolling project total from the file we just appended to.
const rows = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean).map((l) => {
  try { return JSON.parse(l); } catch { return null; }
}).filter(Boolean);
const total = rows.reduce((acc, r) => acc + (typeof r.hours === 'number' ? r.hours : 0), 0);

console.log(line);
console.error(`\nappended to ${jsonlPath}`);
console.error(`session id: ${entry.id}`);
console.error(`project total (JSONL only): ${total.toFixed(1)}h across ${rows.length} sessions`);
