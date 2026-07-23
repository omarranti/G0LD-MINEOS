```
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓

  ____  ___  _     ____        __  __ ___ _   _ _____ ___  ____  
 / ___|/ _ \| |   |  _ \      |  \/  |_ _| \ | | ____/ _ \/ ___| 
| |  _| | | | |   | | | |_____| |\/| || ||  \| |  _|| | | \___ \ 
| |_| | |_| | |___| |_| |_____| |  | || || |\  | |__| |_| |___) |
 \____|\___/|_____|____/      |_|  |_|___|_| \_|_____\___/|____/ 
                                                                 
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓

  FEATURE LIBRARY  --  36 MODULES LOADED

  [ SYSTEM CHECK ]......................................... OK
  [ MEMORY TEST  ] 640K CONVENTIONAL + 36 FEATURES......... OK
  [ CATALOG      ] INDEX.md................................ FOUND
  [ SEARCH       ] scripts/search.py....................... ONLINE
  [ SKILL        ] g0ld-mineos............................. READY

  C:\> WELCOME TO G0LD-MINEOS_
```

A library of 36 reusable, production-pulled feature patterns for SaaS, dashboard, and mobile apps. Each feature has two layers:

- **Knowledge** — `SPEC.md`: the problem, the key decisions, the gotchas, the data model, and what to change when you adapt it.
- **Code** — `code/`: verbatim source from the app it shipped in.

Browse [`INDEX.md`](INDEX.md) for the full catalog, tagged and sorted by problem, not by name. Or search it directly:

```bash
scripts/search.py "rate limit"        # substring match across all columns
scripts/search.py --tag auth          # filter by tag
scripts/search.py --reuse drop-in     # exact match on reuse level
scripts/search.py --json --tag ios    # structured output
```

Stdlib Python 3, no dependencies.

## Why this exists

Most starter kits give you a blank scaffold. This gives you *decisions already made* — auth flows, dashboards, CRMs, growth mechanics, and infra utilities that were built, shipped, and debugged in real apps. Copy the ones that fit, adapt the shape, drop the skin.

## Reuse levels

Each entry is tagged with how much trust to put in it:

- **drop-in** — copy it, wire the imports, done.
- **adapt-the-shape** — the structure (data model, logic, contracts) is sound; rebuild the styling and wire it to your own schema.
- **reference-only** — read it to understand the approach; don't copy verbatim.

## Stack

Most entries are Next.js 15 + TypeScript, several use Neon Postgres + Server Actions, a handful are Swift/SwiftUI for iOS. Each `SPEC.md` states its exact stack and dependencies.

## Install into Claude Code

This repo ships a Claude Code skill so a session can search and pull features
without you manually browsing files.

**One-liner** (clones/updates the repo to `~/Documents/GitHub/G0LD-MINEOS` and
installs the skill to `~/.claude/skills/g0ld-mineos`):

```bash
curl -fsSL https://raw.githubusercontent.com/omarranti/G0LD-MINEOS/main/install.sh | bash
```

**Manual:**

```bash
git clone https://github.com/omarranti/G0LD-MINEOS ~/Documents/GitHub/G0LD-MINEOS
mkdir -p ~/.claude/skills/g0ld-mineos
cp ~/Documents/GitHub/G0LD-MINEOS/skills/g0ld-mineos/SKILL.md ~/.claude/skills/g0ld-mineos/SKILL.md
```

Start a new Claude Code session (or `/clear`) afterward. Then just ask Claude to
build a feature that might already exist here — auth, dashboards, CRM, rate
limiting, iOS auth, etc. — and it will check this library first.

## Adding a feature

See [`CAPTURE.md`](CAPTURE.md) for the process, and `_template/SPEC.md` for the spec skeleton.

## License

MIT — see [`LICENSE`](LICENSE). Adapt freely; attribution appreciated but not required.
