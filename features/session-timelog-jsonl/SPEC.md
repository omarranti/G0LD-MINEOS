# Session Timelog (append-only JSONL, concurrency-safe, derived totals)

> A work log that concurrent agent sessions can all write to at once without
> clobbering each other, because every entry is one small `O_APPEND` line and
> nothing that could collide is decided at write time.

<!-- GUIDING PRINCIPLE: capture the STRUCTURE, not the skin. The reusable value is
the idea, the data model, the logic, the contracts, the flow. -->

- **Slug:** `session-timelog-jsonl`
- **Tags:** `logging`, `jsonl`, `concurrency`, `append-only`, `derived-state`, `agent-workflow`, `time-tracking`, `meta-pattern`
- **Source project:** agent workflow tooling (slash command + two Node scripts)
- **Stack:** Node.js ESM, stdlib only (`node:fs`, `node:path`, `node:os`)
- **Reuse confidence:** drop-in (both scripts are stdlib-only; change one root path and the field list)
- **Status in origin:** live, used daily across several project ledgers

## Problem it solves
You want a durable record of what each work session actually did: hours, what
changed, what was decided, what is still owed. The naive version is a markdown
file the agent edits at the end of a session, and it breaks in three ways:

1. **Concurrent sessions clobber each other.** Two agent tabs finishing at the
   same time both read the file, both append their section, and the second write
   erases the first.
2. **Hand-summed totals go wrong and stay wrong.** Once a total is a number typed
   into a file, every later edit either re-does the arithmetic or quietly drifts.
3. **Sequential numbering races.** If each writer picks "the next session number",
   two writers pick the same one.

The fix is to make the write the smallest possible atomic operation and to derive
absolutely everything else.

## When to reach for this
- Multiple agent sessions, tabs, or machines append to one shared log.
- You have a running total (hours, cost, tokens, count) that must never be hand-maintained.
- You want a machine-readable ledger and a human-readable view without them drifting.
- You are about to have an agent edit a shared markdown file at end-of-task. Do not.

## How it works
- **One entry is one line of JSON, appended with `O_APPEND`.** POSIX guarantees
  appends under `PIPE_BUF` are atomic, so two writers interleave as two whole
  lines rather than corrupting each other. No locking, no coordination.
- **Nothing collidable is decided at write time.** The entry carries no session
  number. Numbering is assigned at *render* time, chronologically by `loggedAt`,
  so two simultaneous writers can never pick the same number.
- **The id is date + project + random**, not a sequence, for the same reason.
- **Totals are computed on read, never stored.** `timelog-compute.mjs` sums the
  JSONL every time it regenerates the markdown view. The number in the file is
  output, not state.
- **Two files with one direction of truth.** `<project>.jsonl` is the source and is
  append-only. `timelog_<project>.md` is generated and must never be hand-edited.
  An optional `<project>_archive.md` holds pre-existing history and is passed
  through verbatim, because parsing it would mean trusting it.
- **A config file carries the baseline.** `<project>.config.json` holds
  `priorTotalHours` so an archive's total rolls into the header without being
  re-derived from unparseable prose.
- **The protocol lives in a slash command**, so the agent composing the entry
  follows the same field contract every time.

## Data model
One JSONL file per project. One line per session:

```jsonc
{
  "project": "acme",              // slug -> timelog/<project>.jsonl
  "date": "2026-08-31",           // session date (not loggedAt)
  "title": "short headline",
  "task": "one paragraph of intent",
  "whatChanged": ["..."],
  "userFacing": ["..."],          // what a real user can now see or do
  "businessImpact": ["..."],      // money, reach, capability, a number that moved
  "decisions": ["..."],
  "verified": ["..."],
  "risks": ["..."],
  "next": ["..."],
  "commits": ["abc1234"],
  "hours": 1.5,
  "hoursBreakdown": [{"label": "recon", "hours": 0.3}, {"label": "build", "hours": 1.2}],
  "notes": ""
}
```

Auto-assigned by the append script: `id` (`{date}-{project}-{random}`) and
`loggedAt` (ISO timestamp). **Not** present anywhere: a session number.

## Key decisions & gotchas
- **`O_APPEND` is atomic only for small writes.** This is the load-bearing
  constraint and the reason the whole pattern works. Past roughly `PIPE_BUF`
  (4096 bytes on Linux/macOS) the kernel can split the write and two concurrent
  appends interleave mid-line, corrupting both. The origin caps entries at ~3500
  bytes and puts long narrative in `notes`. **If you let entries grow unbounded,
  you have silently lost the concurrency guarantee** while everything still looks
  like it works.
- **Assign ordinals at render, never at write.** Any "read the max, add one"
  step reintroduces the race the append was designed to avoid.
- **Derived files must be regenerable from scratch**, which means never hand-editing
  them. The moment someone edits the markdown view, the JSONL stops being the
  source of truth and you cannot tell which is right.
- **Do not parse the archive.** Legacy history is opaque text appended verbatim
  under its own heading. Trying to extract structure from it means the totals
  depend on a fragile parser; a single `priorTotalHours` in config is honest and
  cannot silently mis-parse.
- **Pass the JSON via stdin, not an argv flag.** Shell quoting of a JSON blob
  containing prose is a reliable source of corrupted entries.
- **Require consequence fields, not just diff fields.** The origin made
  `userFacing` and `businessImpact` mandatory after logs kept describing the diff
  rather than what changed for anyone. "Nothing changed for users" is a valid
  answer but has to be *proven* in the bullet (a `git diff --name-only` showing
  nothing outside admin paths, a live fetch showing the concept absent), not
  asserted.
- **Attribute parallel sessions explicitly.** When the branch moved underneath you
  because another session shipped, say so and name the commit, or one session's
  user-facing change gets logged as another's.
- **Deliberately not handled:** deletion and editing of entries (append-only is
  the point; corrections are new entries), multi-user identity, and any
  cross-project rollup.

## Code layer

| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/timelog-append.mjs` | Validates and appends one entry via `O_APPEND`, assigns `id` + `loggedAt`, prints the new rolling total. Stdin or `--json`. | `TIMELOG_ROOT` path constant |
| `code/timelog-compute.mjs` | Reads JSONL + optional archive + config, assigns session numbers chronologically, renders the markdown view. `--dry-run` supported. | `MEM_ROOT` / `TIMELOG_ROOT` path constants |
| `code/log-session.md` | The agent-facing protocol: identify project, read prior context, compose the entry, append, recompute, report. Includes the anti-patterns list. | project slug table, field expectations |

## Structure to keep, skin to drop
- **Keep (the idea):** one small `O_APPEND` line per entry, the size cap that
  makes it atomic, ordinals assigned at render time, totals computed never
  stored, source/derived/archive separation, the config baseline, stdin input,
  and the requirement that consequence fields be evidenced.
- **Drop (regenerate natively):** the entire field list (yours will differ), the
  project slug alias table, the markdown rendering and its headings, the hours
  concept if you are logging something else, and the `~/.claude` root path.

## Adaptation notes
- Change `TIMELOG_ROOT` in both scripts. They currently write under
  `~/.claude/timelog/`.
- Redefine the schema for what you are actually tracking. Keep `date`,
  `loggedAt`, and a stable `id`; everything else is yours.
- **Re-derive the size cap for your schema.** Take your largest realistic entry,
  measure it, and keep the documented cap under `PIPE_BUF`. This is the one number
  you cannot afford to get wrong.
- If you need a per-project baseline, keep the config-file approach rather than
  seeding the JSONL with a synthetic entry.
- Wire the protocol into whatever your agent harness uses for repeatable
  procedures (a slash command, a skill, a prompt template).
- Never add an "edit entry" path. Append a correction instead.

## Provenance
- Origin file(s): `~/.claude/scripts/timelog-append.mjs`,
  `~/.claude/scripts/timelog-compute.mjs`, `~/.claude/commands/log-session.md`
  (captured 2026-08-31). Genericized: root paths, project slugs, example values.
- Related features: [[spec-locked-feature-workflow]],
  [[progress-registry-surface-doctor]]
