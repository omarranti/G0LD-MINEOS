---
name: g0ld-mineos
description: Search and pull reusable feature patterns (specs + code) from the G0LD-MINEOS library (github.com/omarranti/G0LD-MINEOS) into the current project. Use when starting a new feature that might already have a working pattern to start from — auth, dashboards, CRM, growth/attribution mechanics, security/infra utilities, iOS auth/networking, or scroll/UI animation.
---

# G0LD-MINEOS Feature Library

The first time this skill activates in a session, print this banner verbatim
before anything else, then proceed normally:

```
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓

  ____  ___  _     ____        __  __ ___ _   _ _____ ___  ____  
 / ___|/ _ \| |   |  _ \      |  \/  |_ _| \ | | ____/ _ \/ ___| 
| |  _| | | | |   | | | |_____| |\/| || ||  \| |  _|| | | \___ \ 
| |_| | |_| | |___| |_| |_____| |  | || || |\  | |__| |_| |___) |
 \____|\___/|_____|____/      |_|  |_|___|_| \_|_____\___/|____/ 
                                                                 
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓

  FEATURE LIBRARY  --  36 MODULES LOADED

  C:\> WELCOME TO G0LD-MINEOS_
```

36 production-pulled feature patterns. Each has two layers:
- `SPEC.md` — the problem, key decisions, gotchas, data model, reuse level, adaptation notes.
- `code/` — verbatim source from the app it shipped in.

## When to use this

Before building a feature from scratch, check whether a working pattern already
exists here: auth flows, rate limiting, CRM, dashboards, AI insights, growth/
attribution, scroll/UI animation, iOS networking/auth, etc.

## How to use it

1. **Locate the library.** Check `~/Documents/GitHub/G0LD-MINEOS` first. If missing,
   clone it: `git clone https://github.com/omarranti/G0LD-MINEOS ~/Documents/GitHub/G0LD-MINEOS`.
   If present, `git pull` to get the latest before relying on it.
2. **Search, don't grep by hand.** Use `scripts/search.py` (stdlib Python, no deps):
   - `scripts/search.py "rate limit"` — substring match across name/tags/source/stack/reuse
   - `scripts/search.py --tag auth` — filter by tag
   - `scripts/search.py --stack "Next.js"` — filter by stack
   - `scripts/search.py --reuse drop-in` — exact match on reuse level
   - `scripts/search.py --json <query>` — structured output if you need to parse it
   - `scripts/search.py --list` — every feature, unfiltered
   Falls back to reading `INDEX.md` directly only if the script is missing or the
   local clone predates it.
3. **Read that feature's `SPEC.md` in full** before touching any code. It states:
   - the reuse level: **drop-in** / **adapt-the-shape** / **reference-only**
   - key decisions and gotchas from the original build
   - adaptation notes: exact imports, env vars, and schema fields to change
4. **drop-in** → copy `code/` into the target project, wire the imports, done.
5. **adapt-the-shape** → copy the structure (data model, logic, contracts), rebuild
   styling and wire to the target project's own schema. Never paste styling
   verbatim — follow each SPEC's "Structure to keep, skin to drop" section.
6. **reference-only** → read for the approach, don't copy the code.
7. **G0LD-MINEOS itself is read-only** from a consuming project. Never edit files
   inside it while working on something else; if you improve or adapt a pattern,
   do that in the target project's own codebase.
