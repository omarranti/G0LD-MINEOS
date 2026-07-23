#!/usr/bin/env python3
"""Search the G0LD-MINEOS catalog (INDEX.md) by keyword, tag, source, stack, or reuse level.

Stdlib only, no dependencies.

Usage:
  scripts/search.py <query>                 substring match across all columns
  scripts/search.py --tag auth              match against the Tags column only
  scripts/search.py --stack "Next.js"       match against the Stack column only
  scripts/search.py --source ios            match against the Source column only
  scripts/search.py --reuse drop-in         exact match on Reuse column
  scripts/search.py --json <query>          machine-readable output
  scripts/search.py --list                  list every feature (no filter)
"""

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
INDEX_PATH = REPO_ROOT / "INDEX.md"

ROW_RE = re.compile(
    r"^\|\s*\[(?P<name>[^\]]+)\]\((?P<link>[^)]+)\)\s*\|"
    r"\s*(?P<tags>[^|]*?)\s*\|"
    r"\s*(?P<source>[^|]*?)\s*\|"
    r"\s*(?P<stack>[^|]*?)\s*\|"
    r"\s*(?P<reuse>[^|]*?)\s*\|\s*$"
)


def parse_index():
    rows = []
    for line in INDEX_PATH.read_text().splitlines():
        m = ROW_RE.match(line.strip())
        if not m:
            continue
        rows.append({
            "name": m.group("name").strip(),
            "spec": m.group("link").strip(),
            "tags": [t.strip() for t in m.group("tags").split(",") if t.strip()],
            "source": m.group("source").strip(),
            "stack": m.group("stack").strip(),
            "reuse": m.group("reuse").strip(),
        })
    return rows


def matches(row, args):
    if args.tag:
        needle = args.tag.lower()
        if not any(needle in t.lower() for t in row["tags"]):
            return False
    if args.source:
        if args.source.lower() not in row["source"].lower():
            return False
    if args.stack:
        if args.stack.lower() not in row["stack"].lower():
            return False
    if args.reuse:
        if args.reuse.lower() != row["reuse"].lower():
            return False
    if args.query:
        needle = args.query.lower()
        haystack = " ".join([
            row["name"], row["source"], row["stack"], row["reuse"], " ".join(row["tags"])
        ]).lower()
        if needle not in haystack:
            return False
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("query", nargs="?", help="substring match across all columns")
    parser.add_argument("--tag", help="filter by tag (substring match)")
    parser.add_argument("--source", help="filter by source (substring match)")
    parser.add_argument("--stack", help="filter by stack (substring match)")
    parser.add_argument("--reuse", help="filter by reuse level (exact: drop-in / adapt-the-shape / reference-only)")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--list", action="store_true", help="list every feature, ignore filters")
    args = parser.parse_args()

    if not INDEX_PATH.exists():
        print(f"INDEX.md not found at {INDEX_PATH}", file=sys.stderr)
        sys.exit(1)

    rows = parse_index()

    if args.list:
        results = rows
    else:
        if not any([args.query, args.tag, args.source, args.stack, args.reuse]):
            parser.print_help()
            sys.exit(1)
        results = [r for r in rows if matches(r, args)]

    if args.json:
        print(json.dumps(results, indent=2))
        return

    if not results:
        print("No matches.")
        return

    for r in results:
        print(f"{r['name']}  [{r['reuse']}]")
        print(f"  spec:   {r['spec']}")
        print(f"  source: {r['source']}  |  stack: {r['stack']}")
        print(f"  tags:   {', '.join(r['tags'])}")
        print()


if __name__ == "__main__":
    main()
