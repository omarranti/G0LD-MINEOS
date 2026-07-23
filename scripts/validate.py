#!/usr/bin/env python3
"""Validate the G0LD-MINEOS catalog. Stdlib only, no dependencies.

Checks that the library stays honest as features are added:
  1. Every INDEX.md row links to a SPEC.md that actually exists.
  2. Every features/<slug>/ has a SPEC.md and a non-empty code/ dir.
  3. Every feature folder appears in INDEX.md (nothing orphaned).
  4. No stray build artifacts are committed (__pycache__, *.pyc, .DS_Store).

Exit code is non-zero if anything fails, so CI can gate on it.

Usage:
  scripts/validate.py            human-readable report
  scripts/validate.py --json     machine-readable output
"""

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
INDEX_PATH = REPO_ROOT / "INDEX.md"
FEATURES_DIR = REPO_ROOT / "features"

ROW_RE = re.compile(r"^\|\s*\[[^\]]+\]\((?P<link>[^)]+)\)\s*\|")
ARTIFACT_GLOBS = ["**/__pycache__", "**/*.pyc", "**/.DS_Store"]


def index_spec_links():
    links = []
    for line in INDEX_PATH.read_text().splitlines():
        m = ROW_RE.match(line.strip())
        if m:
            links.append(m.group("link").strip())
    return links


def run_checks():
    errors, warnings = [], []

    links = index_spec_links()
    linked_slugs = set()
    for link in links:
        spec = (REPO_ROOT / link).resolve()
        if not spec.exists():
            errors.append(f"INDEX row links to missing SPEC: {link}")
        # features/<slug>/SPEC.md -> <slug>
        parts = Path(link).parts
        if len(parts) >= 2 and parts[0] == "features":
            linked_slugs.add(parts[1])

    for feature in sorted(p for p in FEATURES_DIR.iterdir() if p.is_dir()):
        slug = feature.name
        if not (feature / "SPEC.md").exists():
            errors.append(f"feature '{slug}' has no SPEC.md")
        code = feature / "code"
        if not code.is_dir() or not any(code.iterdir()):
            warnings.append(f"feature '{slug}' has no code/ files (reference-only?)")
        if slug not in linked_slugs:
            errors.append(f"feature '{slug}' is not listed in INDEX.md")

    for pattern in ARTIFACT_GLOBS:
        for hit in REPO_ROOT.glob(pattern):
            if ".git" in hit.parts:
                continue
            errors.append(f"stray build artifact committed: {hit.relative_to(REPO_ROOT)}")

    return errors, warnings


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args()

    errors, warnings = run_checks()

    if args.json:
        print(json.dumps({"errors": errors, "warnings": warnings}, indent=2))
    else:
        for w in warnings:
            print(f"WARN  {w}")
        for e in errors:
            print(f"FAIL  {e}")
        n_features = sum(1 for p in FEATURES_DIR.iterdir() if p.is_dir())
        if not errors:
            print(f"OK    {n_features} features, catalog consistent"
                  + (f" ({len(warnings)} warning(s))" if warnings else ""))

    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
