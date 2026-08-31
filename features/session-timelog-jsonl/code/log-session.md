---
description: Append the current session to the project's JSONL time log. Atomic across concurrent tabs. Recomputes totals automatically.
argument-hint: <project slug> [optional notes, e.g. "acme ~2h auth fixes"]
---

# /log-session

Capture this session's work as a structured JSONL entry so concurrent agent tabs
never overwrite each other's logs and totals are always derived, never hand-summed.

## Brief
$ARGUMENTS

## Protocol, follow in order

### 1. Identify the project

The first word of `$ARGUMENTS` is the project slug. Keep an alias table here
mapping the words a human actually says to the canonical slug, for example:

| User says | Slug |
|---|---|
| acme, acme web/ios, the site, the app | `acme` |
| widgets, widgetco, wc | `widgets` |

Prefer ONE bucket per business. Splitting a project into `<name>_web` /
`<name>_ios` / `<name>_ops` ledgers looks tidy and then has to be merged back;
use an optional `"surface"` field on the entry instead to keep per-surface
granularity without separate ledgers.

If no project is named or it is ambiguous, ASK before writing anything.

### 2. Read prior context

Before composing the entry, check:
- `<timelog root>/<project>.config.json` for a prior baseline / numbering offset
- The last 1-2 entries in `<timelog root>/<project>.jsonl`, to match tone and detail level
- Any project-state notes that may need updating after this session

### 3. Compose the entry

Build a JSON object with these fields (lowercase camelCase keys):

```json
{
  "project": "<slug>",
  "date": "<YYYY-MM-DD of this session>",
  "title": "<short headline, lowercase, no trailing period>",
  "task": "<one paragraph on what you were trying to do>",
  "whatChanged": ["<bullet>"],
  "userFacing": ["<bullet>"],
  "businessImpact": ["<bullet>"],
  "decisions": ["<bullet>"],
  "verified": ["<bullet>"],
  "risks": ["<bullet>"],
  "next": ["<bullet>"],
  "commits": ["<short hash>"],
  "hours": 1.5,
  "hoursBreakdown": [
    {"label": "codebase recon", "hours": 0.3},
    {"label": "build", "hours": 1.2}
  ],
  "notes": "<freeform tail; OK to leave empty>"
}
```

Rules:
- Lowercase prose in `title` and bullets.
- Hours: be honest, do not pad. If `hoursBreakdown` is given, the parts MUST sum
  to `hours` (rounded to one decimal).
- Bullets are short fragments, not full sentences.
- Omit any field you have no content for. The script tolerates missing optional fields.

**`userFacing` and `businessImpact` are NOT optional.** Without them, logs drift
into describing the diff rather than the consequence, and a log that only records
code is useless for deciding what to do next.

- **`userFacing`** = what a real human outside the internal console can now see or
  do differently. An admin-only change is NOT user facing.
  - **"nothing changed for users" is a valid and common answer, but it must be
    PROVEN, not asserted.** Ship the evidence in the bullet. Checks that qualify:
    a `git diff --name-only <baseline> <branch>` showing nothing outside internal
    paths; a grep proving no public file references the new models; confirmation
    that a new field on a shared model is a RELATION not a scalar, since relations
    do not serialize into a DTO unless explicitly included; a live production
    fetch showing the new concepts absent.
  - If the main branch moved during the session because of a PARALLEL session, say
    so and attribute it by commit. Do not let another session's user-facing change
    get logged as yours, and do not let it go unmentioned either.
- **`businessImpact`** = what changed for the business, not the codebase. Money,
  reach, capability, or a number that moves a target. Include hard figures you
  verified, with the source. If the session produced no business change, say that
  plainly rather than inflating a refactor into a win.
- Verified production counts belong in these two fields, not buried in `notes`.
  They are the part of a log still worth reading in three months.

### 4. Append and recompute

```bash
# Append the entry (stdin = JSON). The script returns the new project total.
echo '<JSON>' | ./timelog-append.mjs

# Regenerate the human-readable view from the JSONL + archive.
./timelog-compute.mjs --project <slug>
```

Pass the JSON via stdin (not `--json`) to avoid quoting headaches.

### 5. Report back

Show:
- The session id and the rolling project total returned by the append step
- A one-line confirmation that the markdown view was regenerated
- Anything in the entry that was not obvious from the chat (e.g. risks)

## Anti-patterns (do not)

- Do NOT hand-edit `timelog_<project>.md` or the archive. They are derived / frozen.
- Do NOT compute totals by hand. The script is the source of truth.
- Do NOT assign session numbers in the JSON entry. Numbering happens at render
  time, chronologically by `loggedAt`, so concurrent tabs can never collide.
- Do NOT write entries longer than ~3500 bytes. Append uses POSIX `O_APPEND`,
  which is atomic only for small writes. Long narrative goes in `notes`, tightly.
- Do NOT log a session that was not actually worked on, even if asked. If you are
  unsure what changed, ask.
