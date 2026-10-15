#!/usr/bin/env python3
"""trips.py — Parse Timeline.json → detect trips → write review page.

This is the PRIMARY path (fastest): Timeline.json is a few MB from Google Maps,
no photos needed. Produces trips.json and review.html for Ayush to approve.

Timeline.json sources:
  - Newer on-device export: semanticSegments with visit.topCandidate.placeLocation
    where placeLocation is either {latE7, lngE7} or {"latLng": "lat°, lng°"}
  - Older Takeout: Semantic Location History / *.json with placeVisit blocks

Algorithm:
  1. Parse all visit/place points from Timeline (same as parse.py but visit-aware)
  2. Reverse-geocode to (country, city) using Natural Earth
  3. Detect home cities: those with > HOME_DAYS_PER_YEAR distinct days on average
  4. Build trips: contiguous spans of non-home days, split by gap > TRIP_GAP_DAYS
     Each trip has a list of (country, city, days) sorted by days desc
  5. Write review_dir/trips.json + review_dir/review.html

Usage:
  python3 scripts/takeout/trips.py --timeline Timeline.json --out ~/review/
  python3 scripts/takeout/trips.py --timeline ~/Downloads/Timeline.json --out ~/review/ --home-city "San Francisco" --home-city "New York"
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from takeout.parse import (
    GeoPoint,
    SourceRef,
    _parse_timeline_data,
    _parse_semantic_data,
    _parse_iso,
    _is_zero,
)
from takeout.geo import ensure_ne_data, reverse_geocode

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

# Minimum days gap that splits a trip into two separate trips
TRIP_GAP_DAYS = 2
# Cities averaging more than this many distinct days/year are classified as home/work
HOME_DAYS_PER_YEAR = 30


class CityVisit(NamedTuple):
    country: str
    city: str
    city_lat: float    # NE-resolved centroid lat (rounded to 2 dp)
    city_lon: float    # NE-resolved centroid lon (rounded to 2 dp)
    days: list[str]    # sorted YYYY-MM-DD
    country_iso: str = ""  # ISO-A3 (e.g. "FRA"), empty if unknown


class Trip(NamedTuple):
    id: str
    start: str
    end: str
    city_visits: list[CityVisit]  # sorted by days desc
    total_days: int


def _refuse_inside_repo(path: Path) -> None:
    try:
        path.resolve().relative_to(REPO_ROOT.resolve())
        print(
            f"Error: review_dir must be OUTSIDE the repo.\n"
            f"  Given:    {path}\n"
            f"  Repo root: {REPO_ROOT}",
            file=sys.stderr,
        )
        sys.exit(1)
    except ValueError:
        pass


def _make_id(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


def _day_str(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


# ──────────────────────────────────────────────────────────────────────────────
# Timeline parsing: extract (lat, lon, ts) from visits
# ──────────────────────────────────────────────────────────────────────────────

def _parse_latlng_str(s: str) -> tuple[float, float] | None:
    """Parse "lat°, lng°" or "48.85, 2.35" format."""
    s = s.strip()
    # Remove degree symbols and trailing characters
    s = s.replace("°", "").replace(",", " ")
    parts = s.split()
    if len(parts) >= 2:
        try:
            return float(parts[0]), float(parts[1])
        except ValueError:
            pass
    return None


def parse_timeline_visits(timeline_path: Path) -> list[GeoPoint]:
    """Parse a Timeline.json and return GeoPoints from visit segments only."""
    try:
        with open(timeline_path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error reading {timeline_path}: {e}", file=sys.stderr)
        return []

    points: list[GeoPoint] = []
    ref = SourceRef(archive=None, member=str(timeline_path), path_hint=timeline_path)

    # Handle newer format
    for seg in data.get("semanticSegments", []):
        visit = seg.get("visit") or {}
        loc: dict[str, Any] = {}

        # topCandidate.placeLocation
        tc = visit.get("topCandidate", {})
        loc = tc.get("placeLocation", {}) or {}

        # Fallback: direct placeLocation on visit
        if not loc:
            loc = visit.get("placeLocation", {})

        lat, lon = 0.0, 0.0
        if loc:
            # latE7/lngE7 integer format
            if "latE7" in loc:
                lat = float(loc.get("latE7", 0)) / 1e7
                lon = float(loc.get("lngE7", 0)) / 1e7
            # "latLng": "48.85°, 2.35°" string format
            elif "latLng" in loc:
                parsed = _parse_latlng_str(str(loc["latLng"]))
                if parsed:
                    lat, lon = parsed

        if not _is_zero(lat, lon):
            ts = _parse_iso(seg.get("startTime") or "")
            if ts > 0:
                points.append(GeoPoint(lat=lat, lon=lon, ts=ts, ref=ref))

    # Handle older Semantic Location History format
    for obj in data.get("timelineObjects", []):
        visit = obj.get("placeVisit")
        if not visit:
            continue
        loc = visit.get("location", {})
        lat = float(loc.get("latitudeE7", 0) or 0) / 1e7
        lon = float(loc.get("longitudeE7", 0) or 0) / 1e7
        if _is_zero(lat, lon):
            continue
        dur = visit.get("duration", {})
        ts_str = dur.get("startTimestamp") or dur.get("startTimestampMs") or ""
        ts = int(ts_str) // 1000 if str(ts_str).isdigit() else _parse_iso(str(ts_str))
        if ts > 0:
            points.append(GeoPoint(lat=lat, lon=lon, ts=ts, ref=ref))

    print(f"Parsed {len(points)} visit points from {timeline_path.name}")
    return points


# ──────────────────────────────────────────────────────────────────────────────
# Trip detection
# ──────────────────────────────────────────────────────────────────────────────

def load_excludes(review_dir: Path, extra_regions: list[str] | None = None) -> dict[str, set[str]]:
    """Load exclusion lists from <review_dir>/excludes.json and CLI args.

    Returns dict with lower-cased sets:
      { 'regions': {'illinois', ...}, 'countries': {...}, 'cities': {...} }

    excludes.json schema:
      { "regions": ["Illinois", ...], "countries": [], "cities": [] }
    """
    excludes: dict[str, set[str]] = {"regions": set(), "countries": set(), "cities": set()}
    excludes_path = review_dir / "excludes.json"
    if excludes_path.exists():
        try:
            with open(excludes_path, encoding="utf-8") as f:
                data = json.load(f)
            for key in ("regions", "countries", "cities"):
                for v in data.get(key, []):
                    excludes[key].add(v.lower().strip())
        except (json.JSONDecodeError, OSError) as e:
            print(f"Warning: could not read excludes.json: {e}", file=sys.stderr)
    for r in (extra_regions or []):
        excludes["regions"].add(r.lower().strip())
    return excludes


def build_trips(
    points: list[GeoPoint],
    ne_dir: Path,
    home_days_per_year: int = HOME_DAYS_PER_YEAR,
    home_cities: set[str] | None = None,
    excludes: dict[str, set[str]] | None = None,
) -> tuple[list[Trip], list[tuple[str, str, int]]]:
    """
    Geocode points, detect home cities, build trips.

    Args:
        points: raw GeoPoints from parse_timeline_visits()
        ne_dir: Natural Earth cache directory
        home_days_per_year: cities averaging > this many distinct days/year are flagged home
        home_cities: explicit city names to always flag as home (case-insensitive)
        excludes: dict with lower-cased sets for 'regions', 'countries', 'cities'.
                  Points matching any excluded region/country/city are silently dropped
                  before home detection and trip building.

    Returns:
        (trips, home_list) where home_list is [(country, city, total_days)]
    """
    ensure_ne_data(ne_dir)
    ex_regions = {r for r in (excludes or {}).get("regions", set())}
    ex_countries = {c for c in (excludes or {}).get("countries", set())}
    ex_cities = {c for c in (excludes or {}).get("cities", set())}

    # Geocode
    city_days: dict[tuple[str, str], set[str]] = defaultdict(set)
    # NE-resolved city centroid coordinates (first resolved value per key; stable)
    city_coords: dict[tuple[str, str], tuple[float, float]] = {}
    # ISO-A3 per (country, city) key (first resolved; stable)
    city_iso: dict[tuple[str, str], str] = {}
    geocode_ok = 0
    geocode_fail = 0
    geocode_excluded = 0
    day_city: dict[str, list[tuple[str, str]]] = defaultdict(list)  # day -> cities visited

    for gp in points:
        result = reverse_geocode(gp.lat, gp.lon, ne_dir)
        if not result:
            geocode_fail += 1
            continue
        # Apply exclusions: region (adm1name), country, city — all case-insensitive
        region = result.get("region", "").lower()
        country = result["country"]
        city = result["city"]
        if (
            (ex_regions and region and region in ex_regions)
            or (ex_countries and country.lower() in ex_countries)
            or (ex_cities and city.lower() in ex_cities)
        ):
            geocode_excluded += 1
            continue
        geocode_ok += 1
        day = _day_str(gp.ts)
        key = (country, city)
        city_days[key].add(day)
        if key not in city_coords:
            city_coords[key] = (result.get("city_lat", 0.0), result.get("city_lon", 0.0))
        if key not in city_iso:
            city_iso[key] = result.get("country_iso", "")
        if key not in day_city[day]:
            day_city[day].append(key)

    excl_msg = f", {geocode_excluded} excluded by region/country/city filter" if geocode_excluded else ""
    print(f"Geocoded: {geocode_ok} ok, {geocode_fail} failed{excl_msg}")

    # Identify home cities
    home_set_names = {c.lower() for c in (home_cities or set())}
    home_keys: set[tuple[str, str]] = set()
    city_year_range: dict[tuple[str, str], tuple[int, int]] = {}

    for key, days in city_days.items():
        years = [int(d[:4]) for d in days]
        city_year_range[key] = (min(years), max(years))

    for key, days in city_days.items():
        if key[1].lower() in home_set_names:
            home_keys.add(key)
            continue
        min_yr, max_yr = city_year_range[key]
        years_span = max(1, max_yr - min_yr + 1)
        if len(days) / years_span > home_days_per_year:
            home_keys.add(key)

    home_list = sorted(
        [(k[0], k[1], len(city_days[k])) for k in home_keys],
        key=lambda x: x[2],
        reverse=True,
    )
    if home_list:
        home_names = ", ".join(f"{c} ({n}d)" for _, c, n in home_list)
        print(f"Home/work cities detected: {home_names}")

    # Build trips: find all non-home days
    all_non_home_days: dict[str, set[tuple[str, str]]] = defaultdict(set)  # day -> set of (country,city)
    for day, cities in day_city.items():
        non_home = [(c, ci) for c, ci in cities if (c, ci) not in home_keys]
        if non_home:
            all_non_home_days[day] = set(non_home)

    # Sort days and group into contiguous spans (gap > TRIP_GAP_DAYS splits)
    sorted_days = sorted(all_non_home_days.keys())
    if not sorted_days:
        return [], home_list

    spans: list[list[str]] = []
    current = [sorted_days[0]]
    for prev_d, cur_d in zip(sorted_days, sorted_days[1:]):
        prev_dt = datetime.strptime(prev_d, "%Y-%m-%d")
        cur_dt = datetime.strptime(cur_d, "%Y-%m-%d")
        gap = (cur_dt - prev_dt).days
        if gap > TRIP_GAP_DAYS:
            spans.append(current)
            current = [cur_d]
        else:
            current.append(cur_d)
    spans.append(current)

    # Build Trip objects
    trips: list[Trip] = []
    span_set_cache: dict[int, set[str]] = {}
    for span in spans:
        span_set = set(span)
        # Collect city days in this span; track first appearance day per city
        city_first_day: dict[tuple[str, str], str] = {}
        for day in span:
            for key in all_non_home_days.get(day, set()):
                if key not in city_first_day:
                    city_first_day[key] = day

        # Cities in visit order: sorted by the first day they appear in the span
        city_visits = [
            CityVisit(
                country=k[0],
                city=k[1],
                city_lat=city_coords.get(k, (0.0, 0.0))[0],
                city_lon=city_coords.get(k, (0.0, 0.0))[1],
                days=sorted(d for d in city_days[k] if d in span_set),
                country_iso=city_iso.get(k, ""),
            )
            for k in sorted(city_first_day.keys(), key=lambda k: city_first_day[k])
        ]

        trip_id = _make_id(f"{span[0]}-{city_visits[0].city if city_visits else 'trip'}")
        trips.append(Trip(
            id=trip_id,
            start=span[0],
            end=span[-1],
            city_visits=city_visits,
            total_days=len(span),
        ))

    # Newest trip first (reverse chronological)
    trips.sort(key=lambda t: t.start, reverse=True)

    print(f"Built {len(trips)} trips")
    return trips, home_list


# ──────────────────────────────────────────────────────────────────────────────
# trips.json and review.html
# ──────────────────────────────────────────────────────────────────────────────

def write_trips_review(
    trips: list[Trip],
    home_list: list[tuple[str, str, int]],
    review_dir: Path,
) -> None:
    """Write trips.json template and review.html."""
    # trips.json: template for approval
    trips_data: dict[str, Any] = {
        "_comment": (
            "Edit this file: set 'approved': true for each trip you want. "
            "Set 'name' to override the trip name. Set per-city 'line' for the Town Map label. "
            "Then run: python3 scripts/takeout/apply.py <this file>"
        ),
        "home_cities": [{"country": c, "city": ci, "days": n} for c, ci, n in home_list],
        "trips": [],
    }

    for trip in trips:
        primary_city = trip.city_visits[0] if trip.city_visits else None
        trip_name = primary_city.city if primary_city else "Trip"
        if len(trip.city_visits) > 1:
            trip_name += f" + {len(trip.city_visits) - 1} more"

        cities_data = []
        for cv in trip.city_visits:
            city_id = _make_id(f"{cv.country}-{cv.city}")
            entry: dict[str, Any] = {
                "id": city_id,
                "country": cv.country,
                "country_iso": cv.country_iso,  # ISO-A3 for apply.py iso-match
                "city": cv.city,
                # NE-resolved city centroid coordinates (rounded to 2 dp)
                "lat": round(cv.city_lat, 2),
                "lon": round(cv.city_lon, 2),
                "days": len(cv.days),
                "start": cv.days[0] if cv.days else trip.start,
                "end": cv.days[-1] if cv.days else trip.end,
                "line": "Visited",
                "photos": [],
                "approved": False,
            }
            cities_data.append(entry)

        trips_data["trips"].append({
            "id": trip.id,
            "name": trip_name,
            "start": trip.start,
            "end": trip.end,
            "total_days": trip.total_days,
            "approved": False,
            "cities": cities_data,
        })

    trips_json_path = review_dir / "trips.json"
    with open(trips_json_path, "w", encoding="utf-8") as f:
        json.dump(trips_data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    # Also write approve.json in apply.py-compatible format
    approve_data = _trips_to_approve(trips_data)
    approve_path = review_dir / "approve.json"
    with open(approve_path, "w", encoding="utf-8") as f:
        json.dump(approve_data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    # review.html
    html = _build_trips_html(trips_data, trips)
    (review_dir / "review.html").write_text(html, encoding="utf-8")

    print(f"trips.json   → {trips_json_path}")
    print(f"approve.json → {approve_path}")
    print(f"review.html  → {review_dir / 'review.html'}")


def _trips_to_approve(trips_data: dict) -> dict:
    """Convert trips.json structure to the apply.py approve.json format.

    Country entries include 'iso' (ISO-A3) so apply.py matches existing places
    by iso rather than by the id slug (Italy/Spain/France etc. exist on master).
    Country lat/lon is taken from the first city of that country (NE centroid);
    this is needed when a country is new (not yet in places.json).
    """
    countries: dict[str, dict] = {}
    for trip in trips_data.get("trips", []):
        for city in trip.get("cities", []):
            cname = city["country"]
            ciso = city.get("country_iso", "")
            # Key by ISO-A3 when available (stable across renames), else by name slug
            ckey = ciso if ciso else _make_id(cname)
            if ckey not in countries:
                # Use first city's lat/lon as a rough country centroid placeholder
                # (apply.py only needs this if the country isn't in places.json yet)
                countries[ckey] = {
                    "id": ckey.lower(),
                    "name": cname,
                    "iso": ciso,
                    # NE city centroid as country-level placeholder coords
                    "lat": round(city.get("lat", 0.0), 2),
                    "lon": round(city.get("lon", 0.0), 2),
                    "cities": [],
                }
            # Avoid duplicate cities across trips
            existing_ids = {c["id"] for c in countries[ckey]["cities"]}
            if city["id"] not in existing_ids:
                countries[ckey]["cities"].append({
                    "id": city["id"],
                    "name": city["city"],
                    # NE-resolved city centroid coordinates; 0.0 if geocoding failed
                    "lat": round(city.get("lat", 0.0), 2),
                    "lon": round(city.get("lon", 0.0), 2),
                    "approved": city.get("approved", False),
                    "line": city.get("line", "Visited"),
                    "visits": [{"start": city["start"], "end": city["end"], "days": city["days"]}],
                    "photos": city.get("photos", []),
                })
    return {
        "_comment": "Paste this into approve.json after editing trips.json in review.html.",
        "countries": list(countries.values()),
    }


def _build_trips_html(trips_data: dict, trips: list[Trip]) -> str:
    """Build the review HTML page for trips."""
    import html as _html

    js_trips = json.dumps(trips_data, indent=2).replace("</", "<\\/")

    style = """
body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:1rem 1rem 6rem;background:#f8f8f8;color:#222}
h1{border-bottom:2px solid #333;padding-bottom:.5rem}
.trip{background:#fff;border-radius:8px;padding:1rem;margin-bottom:1.5rem;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.trip-header{display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem;flex-wrap:wrap}
.trip-check{width:1.2em;height:1.2em;cursor:pointer;flex-shrink:0}
.trip-name-input{font-size:1rem;font-weight:600;border:1px solid #ddd;border-radius:4px;padding:.2rem .4rem;width:280px}
.date-range{color:#666;font-size:.85rem}
.days-badge{background:#e8f0fe;color:#1a56db;font-size:.75rem;font-weight:600;padding:.1rem .4rem;border-radius:10px}
.cities{margin:.5rem 0 0 1.8rem}
.city-row{display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem;flex-wrap:wrap}
.city-check{width:1em;height:1em;cursor:pointer;flex-shrink:0}
.city-name{font-weight:500;min-width:120px}
.city-date{color:#888;font-size:.8rem}
.city-days{color:#888;font-size:.75rem}
.line-input{font-size:.8rem;padding:.15rem .3rem;border:1px solid #ccc;border-radius:4px;width:160px}
.home-section{background:#fff8e6;border-radius:8px;padding:1rem;margin-bottom:1.5rem}
.home-section h2{font-size:1rem;color:#7a5a00;margin:0 0 .5rem}
.home-section ul{margin:0;padding-left:1.2rem;font-size:.9rem;color:#555}
.actions{position:fixed;bottom:0;left:0;right:0;background:rgba(255,255,255,.95);border-top:1px solid #ddd;padding:.75rem 1rem;display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap;backdrop-filter:blur(4px)}
.btn{padding:.5rem 1.2rem;border-radius:6px;border:none;cursor:pointer;font-size:.95rem;font-weight:600}
.btn-primary{background:#2563eb;color:#fff}
.btn-primary:hover{background:#1d4ed8}
.btn-secondary{background:#f0f0f0;color:#333;border:1px solid #ccc}
.fallback{margin-top:1.5rem;display:none}
.fallback label{font-weight:600;font-size:.9rem;display:block;margin-bottom:.3rem}
.fallback textarea{width:100%;height:240px;font-family:monospace;font-size:.78rem;border:1px solid #ccc;border-radius:6px;padding:.5rem;box-sizing:border-box;background:#1e1e1e;color:#d4d4d4}
.fallback .btn-small{font-size:.8rem;padding:.25rem .7rem;margin-top:.4rem}
""".strip()

    home_html = ""
    home_cities = trips_data.get("home_cities", [])
    if home_cities:
        items = "".join(
            f"<li>{_html.escape(c['city'])}, {_html.escape(c['country'])} — {c['days']} days</li>"
            for c in home_cities
        )
        home_html = f'<section class="home-section"><h2>Home / Work cities (auto-detected, excluded from trips)</h2><ul>{items}</ul></section>\n'

    trips_html = ""
    for td in trips_data.get("trips", []):
        tid = _html.escape(td["id"])
        start = _html.escape(td["start"])
        end = _html.escape(td["end"])
        total = td["total_days"]
        name = _html.escape(td["name"])
        date_range = f"{start} – {end}" if start != end else start

        cities_rows = ""
        for city in td.get("cities", []):
            cid = _html.escape(city["id"])
            cname = _html.escape(city["city"])
            cdays = city["days"]
            cstart = _html.escape(city["start"])
            cend = _html.escape(city["end"])
            cdate = f"{cstart} – {cend}" if cstart != cend else cstart
            # City checkboxes are UNCHECKED by default; JS will check them when the
            # trip box is ticked, and restore from localStorage on reload.
            cities_rows += (
                f'<div class="city-row">'
                f'<input type="checkbox" class="city-check" data-trip-id="{tid}" data-city-id="{cid}" />'
                f'<span class="city-name">{cname}</span>'
                f'<span class="city-date">{cdate}</span>'
                f'<span class="city-days">{cdays}d</span>'
                f'<input type="text" class="line-input" data-trip-id="{tid}" data-city-id="{cid}" placeholder="Visited" maxlength="40" />'
                f'</div>\n'
            )

        trips_html += (
            f'<div class="trip" id="trip-{tid}">'
            f'<div class="trip-header">'
            f'<input type="checkbox" class="trip-check" data-trip-id="{tid}" />'
            f'<input type="text" class="trip-name-input" data-trip-id="{tid}" value="{name}" maxlength="60" />'
            f'<span class="date-range">{date_range}</span>'
            f'<span class="days-badge">{total}d</span>'
            f'</div>'
            f'<div class="cities">{cities_rows}</div>'
            f'</div>\n'
        )

    # The JS below is written in plain ES2020, no build step.
    # Key fixes vs the old version:
    #   1. buildApprove() reads lat/lon/iso/country_iso from DATA (not hard-coded 0,0).
    #   2. Country keying uses country_iso (ISO-A3) when present, else country name.
    #   3. Ticking a trip → all its city boxes default to checked.
    #      Unticking all city boxes in a trip → the trip box unticks.
    #   4. Download button (primary). Copy button (secondary, clipboard API).
    #      textarea fallback with select-all, shown when clipboard is unavailable.
    #   5. localStorage persists checkbox state and label values per trip id so
    #      a page reload or re-generation keeps Ayush's selections.
    script = r"""
const DATA = """ + js_trips + r""";
const LS_KEY = 'trips-review-v1';

// ── localStorage persistence ──────────────────────────────────────────────────
function saveState() {
  const state = {};
  document.querySelectorAll('.trip-check').forEach(tc => {
    const tid = tc.dataset.tripId;
    const nameEl = document.querySelector(`.trip-name-input[data-trip-id="${tid}"]`);
    state[tid] = {
      trip: tc.checked,
      name: nameEl ? nameEl.value : '',
      cities: {},
    };
    document.querySelectorAll(`.city-check[data-trip-id="${tid}"]`).forEach(cc => {
      const lineEl = document.querySelector(`.line-input[data-trip-id="${tid}"][data-city-id="${cc.dataset.cityId}"]`);
      state[tid].cities[cc.dataset.cityId] = {
        checked: cc.checked,
        line: lineEl ? lineEl.value : '',
      };
    });
  });
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_) {}
}

function restoreState() {
  let state;
  try { state = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (_) { state = null; }
  if (!state) return;
  for (const [tid, ts] of Object.entries(state)) {
    const tc = document.querySelector(`.trip-check[data-trip-id="${tid}"]`);
    if (!tc) continue;
    tc.checked = !!ts.trip;
    const nameEl = document.querySelector(`.trip-name-input[data-trip-id="${tid}"]`);
    if (nameEl && ts.name) nameEl.value = ts.name;
    for (const [cid, cs] of Object.entries(ts.cities || {})) {
      const cc = document.querySelector(`.city-check[data-trip-id="${tid}"][data-city-id="${cid}"]`);
      if (cc) cc.checked = !!cs.checked;
      const lineEl = document.querySelector(`.line-input[data-trip-id="${tid}"][data-city-id="${cid}"]`);
      if (lineEl && cs.line) lineEl.value = cs.line;
    }
  }
}

// ── Trip ↔ city checkbox sync ─────────────────────────────────────────────────
function syncCitiesToTrip(tid, checked) {
  document.querySelectorAll(`.city-check[data-trip-id="${tid}"]`).forEach(cc => {
    cc.checked = checked;
  });
}

function syncTripFromCities(tid) {
  const cities = Array.from(document.querySelectorAll(`.city-check[data-trip-id="${tid}"]`));
  const allUnchecked = cities.length > 0 && cities.every(c => !c.checked);
  const tc = document.querySelector(`.trip-check[data-trip-id="${tid}"]`);
  if (tc && allUnchecked) tc.checked = false;
}

document.querySelectorAll('.trip-check').forEach(tc => {
  tc.addEventListener('change', () => {
    syncCitiesToTrip(tc.dataset.tripId, tc.checked);
    saveState();
  });
});

document.querySelectorAll('.city-check').forEach(cc => {
  cc.addEventListener('change', () => {
    syncTripFromCities(cc.dataset.tripId);
    saveState();
  });
});

document.querySelectorAll('.trip-name-input, .line-input').forEach(el => {
  el.addEventListener('input', saveState);
});

// Restore from localStorage on load
restoreState();

// ── buildApprove: produce approve.json structure from current UI state ────────
function buildApprove() {
  // countries keyed by ISO-A3 when known, else by country name
  const countries = {};
  for (const trip of DATA.trips) {
    const tc = document.querySelector(`.trip-check[data-trip-id="${trip.id}"]`);
    const tripChecked = tc ? tc.checked : false;
    const nameInput = document.querySelector(`.trip-name-input[data-trip-id="${trip.id}"]`);
    const tripName = nameInput ? (nameInput.value.trim() || trip.name) : trip.name;

    for (const city of trip.cities) {
      const cc = document.querySelector(`.city-check[data-trip-id="${trip.id}"][data-city-id="${city.id}"]`);
      const cityApproved = cc ? cc.checked : false;
      const lineInput = document.querySelector(`.line-input[data-trip-id="${trip.id}"][data-city-id="${city.id}"]`);
      const cityLine = (lineInput && lineInput.value.trim()) ? lineInput.value.trim() : (city.line || 'Visited');

      // Key by ISO-A3 if present, else country name (mirrors _trips_to_approve in Python)
      const ciso = city.country_iso || '';
      const ckey = ciso || city.country;

      if (!countries[ckey]) {
        countries[ckey] = {
          // Use ISO-lowercase as id when iso available (matches apply.py _create_place)
          id: ciso ? ciso.toLowerCase() : city.id.split('-')[0],
          name: city.country,
          iso: ciso,
          // Country-level centroid from first city (apply.py needs this for new countries)
          lat: city.lat,
          lon: city.lon,
          cities: [],
        };
      }

      const existingIds = new Set(countries[ckey].cities.map(c => c.id));
      if (!existingIds.has(city.id)) {
        countries[ckey].cities.push({
          id: city.id,
          name: city.city,
          // lat/lon come from DATA (NE-resolved), never hard-coded 0,0
          lat: city.lat,
          lon: city.lon,
          approved: cityApproved,
          line: cityLine,
          visits: [{ start: city.start, end: city.end, days: city.days }],
          photos: city.photos || [],
        });
      } else {
        // Update approved/line if city appears in multiple trips
        const existing = countries[ckey].cities.find(c => c.id === city.id);
        if (existing) {
          existing.approved = existing.approved || cityApproved;
          if (lineInput && lineInput.value.trim()) existing.line = cityLine;
        }
      }
    }
  }
  return {
    _comment: "Generated by review.html — run: python3 scripts/takeout/apply.py approve.json",
    countries: Object.values(countries),
  };
}

// ── Download (primary action) ─────────────────────────────────────────────────
document.getElementById('btn-download').addEventListener('click', () => {
  const text = JSON.stringify(buildApprove(), null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'approve.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ── Copy (secondary) ─────────────────────────────────────────────────────────
document.getElementById('btn-copy').addEventListener('click', async () => {
  const text = JSON.stringify(buildApprove(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('btn-copy');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  } catch (_) {
    showFallback(text);
  }
});

// ── Textarea fallback ─────────────────────────────────────────────────────────
function showFallback(text) {
  const fb = document.getElementById('fallback');
  const ta = document.getElementById('fallback-ta');
  fb.style.display = 'block';
  ta.value = text;
  ta.focus();
  ta.select();
  fb.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('btn-select-text').addEventListener('click', () => {
  const ta = document.getElementById('fallback-ta');
  ta.focus();
  ta.select();
});

// ── Select / clear all ────────────────────────────────────────────────────────
document.getElementById('btn-select-all').addEventListener('click', () => {
  document.querySelectorAll('.trip-check').forEach(tc => {
    tc.checked = true;
    syncCitiesToTrip(tc.dataset.tripId, true);
  });
  saveState();
});

document.getElementById('btn-clear').addEventListener('click', () => {
  document.querySelectorAll('.trip-check, .city-check').forEach(c => c.checked = false);
  saveState();
});
""".strip()

    n_trips = len(trips)
    n_countries = len({cv.country for t in trips for cv in t.city_visits})

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Trips Review — Town Map places</title>
<style>{style}</style>
</head>
<body>
<h1>Town Map — Trips Review</h1>
<p>
  Found <strong>{n_trips} trips</strong> across <strong>{n_countries} countries</strong>.
  Tick each trip (cities default to checked). Edit labels. Click <strong>Download approve.json</strong>,
  then run <code>python3 scripts/takeout/apply.py approve.json</code>.
</p>
<p><em>This page is offline. No data leaves your machine. Selections are saved in localStorage.</em></p>

{home_html}
{trips_html}

<div class="fallback" id="fallback">
  <label for="fallback-ta">approve.json — select all and copy manually:</label>
  <textarea id="fallback-ta" readonly spellcheck="false"></textarea>
  <button class="btn btn-secondary btn-small" id="btn-select-text">Select all</button>
</div>

<div class="actions">
  <button class="btn btn-secondary" id="btn-select-all">Select all</button>
  <button class="btn btn-secondary" id="btn-clear">Clear all</button>
  <button class="btn btn-secondary" id="btn-copy">Copy</button>
  <button class="btn btn-primary" id="btn-download">Download approve.json</button>
</div>

<script>{script}</script>
</body>
</html>
"""


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Parse Timeline.json → detect trips → write review page.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Fastest path (Timeline.json is a few MB):
  python3 scripts/takeout/trips.py --timeline ~/Downloads/Timeline.json --out ~/review/

  # Exclude a state/province from output:
  python3 scripts/takeout/trips.py --timeline Timeline.json --out ~/review/ --exclude-region Illinois

  # Persist exclusions in review_dir/excludes.json (read automatically on every run):
  echo '{"regions":["Illinois"],"countries":[],"cities":[]}' > ~/review/excludes.json

  # With explicit home cities:
  python3 scripts/takeout/trips.py --timeline Timeline.json --out ~/review/ --home-city "San Francisco"
""",
    )
    parser.add_argument("--timeline", required=True, metavar="FILE",
                        help="Path to Timeline.json (on-device export or Takeout).")
    parser.add_argument("--out", required=True, metavar="REVIEW_DIR",
                        help="Output directory (must be OUTSIDE the repo).")
    parser.add_argument("--ne-dir", metavar="DIR", default=None,
                        help="Natural Earth cache dir (default: ~/.cache/portfolio-takeout/ne/).")
    parser.add_argument("--home-days", type=int, default=HOME_DAYS_PER_YEAR, metavar="N",
                        help=f"Cities with > N avg days/year are home (default: {HOME_DAYS_PER_YEAR}).")
    parser.add_argument("--home-city", action="append", metavar="CITY", default=[],
                        help="City name to always flag as home (repeatable).")
    parser.add_argument("--exclude-region", action="append", metavar="REGION", default=[],
                        help=(
                            "Exclude all points in this first-level admin region "
                            "(state/province, e.g. 'Illinois'). Repeatable. "
                            "Persisted exclusions go in <REVIEW_DIR>/excludes.json."
                        ))
    args = parser.parse_args()

    review_dir = Path(args.out).expanduser().resolve()
    _refuse_inside_repo(review_dir)
    review_dir.mkdir(parents=True, exist_ok=True)

    timeline_path = Path(args.timeline).expanduser()
    if not timeline_path.exists():
        print(f"Error: --timeline file not found: {timeline_path}", file=sys.stderr)
        sys.exit(1)

    ne_dir = ensure_ne_data(Path(args.ne_dir).expanduser() if args.ne_dir else None)

    # Load exclusions: excludes.json in review_dir (if present) + CLI --exclude-region args
    excludes = load_excludes(review_dir, extra_regions=args.exclude_region)
    if excludes["regions"] or excludes["countries"] or excludes["cities"]:
        region_list = ", ".join(sorted(excludes["regions"])) or "none"
        print(f"Exclusions active — regions: {region_list}")

    points = parse_timeline_visits(timeline_path)
    if not points:
        print("No visit points found. Is this a valid Timeline.json?")
        sys.exit(0)

    trips, home_list = build_trips(
        points,
        ne_dir=ne_dir,
        home_days_per_year=args.home_days,
        home_cities=set(args.home_city),
        excludes=excludes,
    )

    if not trips:
        print("No trips detected (all days appear to be home/work).")
        print("Try --home-days with a higher value, or --home-city to name your city.")
        sys.exit(0)

    write_trips_review(trips, home_list, review_dir)

    print("\nNext steps:")
    print("  1. Open review.html in a browser")
    print("  2. Check trips/cities, set line labels, click 'Copy approve.json'")
    print("  3. Paste into approve.json (already written as a template)")
    print("  4. For photos: python3 scripts/takeout/pick.py approve.json")
    print("  5. Or skip photos: python3 scripts/takeout/apply.py approve.json")


if __name__ == "__main__":
    main()
