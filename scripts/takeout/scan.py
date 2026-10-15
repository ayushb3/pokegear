#!/usr/bin/env python3
"""scan.py — Walk Google Takeout exports and build a privacy-first review page.

Usage:
  # Full scan of a directory or archive:
  python3 scripts/takeout/scan.py <source> --out <review_dir>

  # Multiple sources (zip-by-zip incremental):
  python3 scripts/takeout/scan.py takeout-001.zip takeout-002.zip --out /tmp/review --state /tmp/review/state.json

  # Timeline only (MBs, fastest path):
  python3 scripts/takeout/scan.py --timeline Timeline.json --out /tmp/review

  # Natural Earth cache override:
  python3 scripts/takeout/scan.py ... --ne-dir /data/ne_cache

Privacy:
  - Never uploads anything.
  - Never prints raw coordinates, filenames or personal data in bulk.
  - review_dir must be OUTSIDE this repo (refused if inside).
  - Thumbnails are EXIF-stripped copies.
  - Raw Takeout data is never written to this repo.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Resolve imports relative to this file (so it can be run as a script)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from takeout.parse import (
    GeoPoint,
    scan_source,
    scan_timeline_file,
    scan_apple_photos,
    load_state,
    save_state,
    merge_points,
)
from takeout.geo import ensure_ne_data
from takeout.cluster import cluster
from takeout.thumbs import extract_thumbs
from takeout.review import write_review


REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def _refuse_inside_repo(path: Path) -> None:
    """Abort if the given path is inside or equal to the repo root."""
    try:
        path.resolve().relative_to(REPO_ROOT.resolve())
        print(
            f"Error: review_dir must be OUTSIDE the repo.\n"
            f"  Given:    {path}\n"
            f"  Repo root: {REPO_ROOT}\n"
            "Choose a directory outside the repository (e.g. ~/takeout-review/).",
            file=sys.stderr,
        )
        sys.exit(1)
    except ValueError:
        pass  # not inside repo — OK


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scan Google Takeout exports and produce a privacy-safe review page.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Fastest path — Timeline.json only (a few MB):
  python3 scripts/takeout/scan.py --timeline ~/Downloads/Timeline.json --out ~/takeout-review/

  # One zip at a time (incremental):
  python3 scripts/takeout/scan.py ~/Downloads/takeout-001.zip --out ~/takeout-review/ --state ~/takeout-review/state.json
  python3 scripts/takeout/scan.py ~/Downloads/takeout-002.zip --out ~/takeout-review/ --state ~/takeout-review/state.json

  # Directory of extracted Takeout:
  python3 scripts/takeout/scan.py ~/Downloads/Takeout/ --out ~/takeout-review/
""",
    )
    parser.add_argument(
        "sources",
        metavar="SOURCE",
        nargs="*",
        help="Takeout directory, .zip, or .tgz archive(s). Can be mixed.",
    )
    parser.add_argument(
        "--timeline",
        metavar="FILE",
        help="Path to a standalone Timeline.json (faster: no photo scan).",
    )
    parser.add_argument(
        "--out",
        required=True,
        metavar="REVIEW_DIR",
        help="Output directory for the review page (must be outside the repo).",
    )
    parser.add_argument(
        "--state",
        metavar="FILE",
        default=None,
        help="Path to state.json for incremental scanning across multiple runs.",
    )
    parser.add_argument(
        "--ne-dir",
        metavar="DIR",
        default=None,
        help="Natural Earth cache directory (default: ~/.cache/portfolio-takeout/ne/).",
    )
    parser.add_argument(
        "--home-days",
        type=int,
        default=30,
        metavar="N",
        help="Cities averaging more than N days/year are flagged as home/work (default: 30).",
    )
    parser.add_argument(
        "--home-city",
        action="append",
        metavar="CITY",
        default=[],
        help="City name to always flag as home (can repeat: --home-city Tokyo --home-city Paris).",
    )
    parser.add_argument(
        "--apple-photos",
        action="store_true",
        help="Include Apple Photos library metadata (requires osxphotos; gracefully skipped if absent).",
    )
    parser.add_argument(
        "--no-thumbs",
        action="store_true",
        help="Skip thumbnail extraction (review page lists cities without photos).",
    )
    args = parser.parse_args()

    if not args.sources and not args.timeline and not args.apple_photos:
        parser.error("Provide at least one SOURCE, --timeline, or --apple-photos.")

    review_dir = Path(args.out).expanduser().resolve()
    _refuse_inside_repo(review_dir)
    review_dir.mkdir(parents=True, exist_ok=True)

    ne_dir = ensure_ne_data(Path(args.ne_dir).expanduser() if args.ne_dir else None)

    # ── Load incremental state ──
    state_path = Path(args.state).expanduser() if args.state else None
    existing_points: list[GeoPoint] = []
    if state_path:
        existing_points = load_state(state_path)
        if existing_points:
            print(f"Loaded {len(existing_points)} points from state: {state_path}")

    # ── Scan sources ──
    all_new_photos: list[GeoPoint] = []
    all_new_timeline: list[GeoPoint] = []

    if args.timeline:
        tl_path = Path(args.timeline).expanduser()
        if not tl_path.exists():
            print(f"Error: --timeline file not found: {tl_path}", file=sys.stderr)
            sys.exit(1)
        pts = list(scan_timeline_file(tl_path))
        all_new_timeline.extend(pts)
        print(f"Timeline scan: {len(pts)} points from {tl_path.name}")

    for src_str in args.sources:
        src = Path(src_str).expanduser()
        if not src.exists():
            print(f"Warning: source not found, skipping: {src}", file=sys.stderr)
            continue
        print(f"Scanning: {src.name} ...")
        photos, timeline = scan_source(src)
        all_new_photos.extend(photos)
        all_new_timeline.extend(timeline)

    if args.apple_photos:
        print("Scanning Apple Photos library ...")
        apple_pts = list(scan_apple_photos())
        print(f"  Apple Photos: {len(apple_pts)} geotagged items")
        all_new_timeline.extend(apple_pts)

    # ── Merge ──
    all_points = merge_points(existing_points, all_new_photos, all_new_timeline)

    if not all_points:
        print("No geotagged points found. Check your Takeout selection (see README).")
        sys.exit(0)

    # ── Save incremental state ──
    if state_path:
        save_state(state_path, all_points)
        print(f"Saved state ({len(all_points)} total points) → {state_path}")

    # ── Cluster into visits ──
    visits = cluster(
        all_points,
        ne_dir=ne_dir,
        home_days_per_year=args.home_days,
        home_cities=set(args.home_city),
    )

    # ── Extract thumbnails ──
    city_thumbs: dict[str, list] = {}
    if not args.no_thumbs:
        # Only process non-home visits
        travel_visits = [v for v in visits if not v.home_flagged]
        thumb_count = 0
        for visit in travel_visits:
            city_id = _city_id(visit.country, visit.city)
            thumbs = extract_thumbs(city_id, visit.sample_refs, review_dir)
            city_thumbs[city_id] = thumbs
            thumb_count += len(thumbs)
        if thumb_count:
            print(f"Thumbnails: {thumb_count} extracted → {review_dir / 'thumbs'}/")

    # ── Write review page ──
    write_review(visits, city_thumbs, review_dir)
    print(f"\nReview page → {review_dir / 'review.html'}")
    print(f"Edit approve.json → {review_dir / 'approve.json'}")
    print("\nNext steps:")
    print("  1. Open review.html in a browser")
    print("  2. Select cities and photos to include")
    print("  3. Use 'Copy selection as JSON' → paste into approve.json")
    print("  4. Run: python3 scripts/takeout/apply.py <review_dir>/approve.json")


def _city_id(country: str, city: str) -> str:
    """Make a filesystem-safe city id from country + city name."""
    import re
    raw = f"{country}-{city}".lower()
    return re.sub(r"[^a-z0-9]+", "-", raw).strip("-")[:40]


if __name__ == "__main__":
    main()
