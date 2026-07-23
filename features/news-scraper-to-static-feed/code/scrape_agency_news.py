#!/usr/bin/env python3
"""
Fetch Meridian (Meridian Talent Group) news from public sources and write a JS
payload the static dashboard can load over file:// via a <script> tag.

Sources (all public, all RSS-friendly):
  - Google News RSS (broad "Meridian Talent Group" / "Meridian agency" search)
  - Deadline tag feed
  - Variety tag feed
  - The Hollywood Reporter tag feed
  - The Ankler (Substack feed, filtered by Meridian mention)
  - Puck (via Google News site-filter)
  - Meridian's own press page (best-effort HTML scrape)

Each item is auto-categorized into opp/risk/gtk/know using keyword rules.
The dashboard lets the user override any suggestion.

Usage:
    python scrape_agency_news.py
    python scrape_agency_news.py --max-days 60 --out dashboard/data/agency-news.js
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import feedparser  # type: ignore
import requests
from bs4 import BeautifulSoup

UA = (
    "Mozilla/5.0 (compatible; demo-dashboard-agency-news/1.0; "
    "respecting robots; low-volume daily scrape)"
)

# ──────────────────────────────────────────────────────────────────────────────
# SOURCES
# ──────────────────────────────────────────────────────────────────────────────
FEEDS: list[dict] = [
    {
        "source": "Google News",
        "url": (
            "https://news.google.com/rss/search"
            "?q=%22Meridian+Talent+Group%22+OR+%22Meridian+agency%22"
            "&hl=en-US&gl=US&ceid=US:en"
        ),
        "filter_wme": False,
    },
    {
        "source": "Deadline",
        "url": "https://deadline.com/tag/meridian/feed/",
        "filter_wme": False,
    },
    {
        "source": "Variety",
        "url": "https://variety.com/t/wme/feed/",
        "filter_wme": False,
    },
    {
        "source": "The Hollywood Reporter",
        "url": "https://www.hollywoodreporter.com/t/wme/feed/",
        "filter_wme": False,
    },
    {
        "source": "The Ankler",
        "url": "https://theankler.com/feed",
        "filter_wme": True,
    },
    {
        "source": "Puck",
        "url": (
            "https://news.google.com/rss/search"
            "?q=site:example.com+%22Meridian%22"
            "&hl=en-US&gl=US&ceid=US:en"
        ),
        "filter_wme": False,
    },
]

Meridian_PRESS_URL = "https://www.meridiantalent.com/news"

# ──────────────────────────────────────────────────────────────────────────────
# HARD EXCLUSIONS
# The Meridian Pulse feed is strictly industry intel about Meridian Talent Group.
# It must NEVER surface items about the AURA brand / Priya — those belong in
# the personal brand views of the dashboard, not the industry ticker. Any item
# whose title OR summary matches one of these terms is dropped before bucketing.
# Match is case-insensitive and whole-word to avoid accidental overlap
# (e.g. "phoebe" the name, not "phoebes" the birds).
# ──────────────────────────────────────────────────────────────────────────────
EXCLUDE_TERMS: list[str] = [
    "phoebe",
    "phoebe juanita",
    "juanita",
    "aura",
    "minx tatu",
    "aura tatu",
]

_EXCLUDE_RE = re.compile(
    r"\b(" + "|".join(re.escape(t) for t in EXCLUDE_TERMS) + r")\b",
    re.IGNORECASE,
)


def is_excluded(title: str, summary: str) -> bool:
    """Drop anything tied to the AURA brand — this feed is Meridian-industry-only."""
    return bool(_EXCLUDE_RE.search(f"{title} {summary or ''}"))


# ──────────────────────────────────────────────────────────────────────────────
# CATEGORIZATION
# Ordered — first match wins. Earlier buckets take priority.
# ──────────────────────────────────────────────────────────────────────────────
BUCKET_RULES: list[tuple[str, list[str]]] = [
    (
        "risk",  # check risks first — "signs with" + "lawsuit" → risk
        [
            "layoff", "layoffs", "lawsuit", "sues", "sued", "suing",
            "drops client", "parts ways", "exits", "departs", "departing",
            "scandal", "fired", "union dispute", "strike", "antitrust",
            "investigation", "controversy", "resigns", "steps down",
            "cuts staff", "restructures out", "loses client", "fallout",
            "allegations", "settlement",
        ],
    ),
    (
        "opp",
        [
            "signs with", "signs ", "joins roster", "inks deal", "first-look",
            "launches fund", "opens submissions", "open call",
            "packaging deal", "partners with", "new partnership",
            "represents ", "invests in", "adds to roster", "new division",
            "discovery program", "launches initiative", "launches program",
            "accepting submissions", "accepting applications",
            "announces fellowship", "mentorship", "new agency",
        ],
    ),
    (
        "gtk",
        [
            "promotes", "names ", "expands", "opens office", "relocates",
            "restructure", "reorganizes", "merges", "joins board",
            "hires ", "endeavor group", "ipo", "acquired", "sale of",
            "private equity", "new co-head", "elevates", "appoints",
            "new ceo", "new president", "takeover",
        ],
    ),
]


def classify(title: str, summary: str) -> tuple[str, str]:
    """Return (bucket, matched_keyword). Defaults to 'know' with empty keyword."""
    text = f"{title} {summary or ''}".lower()
    for bucket, kws in BUCKET_RULES:
        for kw in kws:
            if kw in text:
                return bucket, kw.strip()
    return "know", ""


def is_wme_related(title: str, summary: str) -> bool:
    text = f"{title} {summary or ''}".lower()
    return any(
        term in text
        for term in ("wme", "william morris endeavor", "endeavor agency")
    )


def clean_summary(html: str | None) -> str:
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", text)
    # Strip "The post X appeared first on Y" tails common in WP feeds
    text = re.sub(r"\s*The post .+? appeared first on .+?\.?$", "", text)
    if len(text) > 240:
        cut = text.rfind(" ", 0, 240)
        text = text[: cut if cut > 160 else 240].rstrip() + "…"
    return text


def item_id(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]


def parse_entry(entry, source: str, filter_wme: bool) -> dict | None:
    title = (entry.get("title") or "").strip()
    link = (entry.get("link") or "").strip()
    summary_html = entry.get("summary") or entry.get("description") or ""
    summary = clean_summary(summary_html)

    if not title or not link:
        return None
    if filter_wme and not is_wme_related(title, summary):
        return None
    # Hard-drop anything tied to the AURA brand / Priya — strict isolation.
    if is_excluded(title, summary):
        return None

    date_struct = entry.get("published_parsed") or entry.get("updated_parsed")
    if date_struct:
        dt = datetime(*date_struct[:6], tzinfo=timezone.utc)
    else:
        dt = datetime.now(timezone.utc)

    bucket, matched = classify(title, summary)

    return {
        "id": item_id(link),
        "title": title,
        "url": link,
        "source": source,
        "date": dt.isoformat(),
        "summary": summary,
        "suggested": bucket,
        "matched": matched,
    }


def fetch_feed(url: str, timeout: float = 30.0):
    resp = requests.get(
        url,
        headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, */*"},
        timeout=timeout,
    )
    resp.raise_for_status()
    return feedparser.parse(resp.content)


def scrape_press_page(timeout: float = 30.0) -> list[dict]:
    """Best-effort scrape of meridiantalent.com/news. JS-rendered, so low hopes."""
    try:
        resp = requests.get(
            Meridian_PRESS_URL,
            headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"},
            timeout=timeout,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  Meridian press page failed: {e}", file=sys.stderr)
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    items: list[dict] = []
    seen_urls: set[str] = set()

    for a in soup.select("a"):
        href = (a.get("href") or "").strip()
        text = a.get_text(" ", strip=True)
        if not href or not text or len(text) < 25:
            continue
        # Filter to news-looking links
        if "/news" not in href and "/press" not in href:
            continue
        if not href.startswith("http"):
            href = "https://www.meridiantalent.com" + ("" if href.startswith("/") else "/") + href.lstrip("/")
        if href in seen_urls:
            continue
        # Hard-drop AURA / Priya mentions — strict isolation.
        if is_excluded(text, ""):
            continue
        seen_urls.add(href)

        bucket, matched = classify(text, "")
        items.append(
            {
                "id": item_id(href),
                "title": text[:240],
                "url": href,
                "source": "Meridian Press",
                "date": datetime.now(timezone.utc).isoformat(),
                "summary": "",
                "suggested": bucket,
                "matched": matched,
            }
        )
        if len(items) >= 15:
            break

    return items


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape Meridian public news.")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("dashboard/data/agency-news.js"),
        help="Output JS file (sets window.__Meridian_NEWS)",
    )
    parser.add_argument(
        "--max-days",
        type=int,
        default=90,
        help="Drop items older than this many days",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="Seconds between feed requests (be polite)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="Per-request timeout in seconds",
    )
    args = parser.parse_args()

    items: list[dict] = []
    seen: set[str] = set()
    errors: list[str] = []

    for i, feed in enumerate(FEEDS):
        if i > 0:
            time.sleep(args.delay)
        try:
            print(f"Fetching {feed['source']}...", file=sys.stderr)
            data = fetch_feed(feed["url"], timeout=args.timeout)
            added = 0
            for entry in getattr(data, "entries", []):
                parsed = parse_entry(entry, feed["source"], feed["filter_wme"])
                if parsed and parsed["id"] not in seen:
                    seen.add(parsed["id"])
                    items.append(parsed)
                    added += 1
            print(f"  {feed['source']}: +{added}", file=sys.stderr)
        except Exception as e:
            msg = f"{feed['source']}: {type(e).__name__}: {e}"
            print(f"  {msg}", file=sys.stderr)
            errors.append(msg)

    # Meridian press page (best effort)
    time.sleep(args.delay)
    print("Fetching Meridian press page...", file=sys.stderr)
    press_items = scrape_press_page(timeout=args.timeout)
    added = 0
    for it in press_items:
        if it["id"] not in seen:
            seen.add(it["id"])
            items.append(it)
            added += 1
    print(f"  Meridian Press: +{added}", file=sys.stderr)

    # Filter by age
    cutoff = datetime.now(timezone.utc) - timedelta(days=args.max_days)
    fresh: list[dict] = []
    for it in items:
        try:
            dt = datetime.fromisoformat(it["date"])
        except ValueError:
            continue
        if dt >= cutoff:
            fresh.append(it)

    # Sort newest first
    fresh.sort(key=lambda x: x["date"], reverse=True)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(fresh),
        "errors": errors,
        "items": fresh,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    js = (
        "// Auto-generated by scrape_agency_news.py — do not edit by hand.\n"
        "window.__Meridian_NEWS = "
        + json.dumps(payload, indent=2, ensure_ascii=False)
        + ";\n"
    )
    args.out.write_text(js, encoding="utf-8")
    print(f"Wrote {len(fresh)} items to {args.out}", file=sys.stderr)
    return 0 if fresh or not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
