"""Cluster geopoints into city visits with date ranges.

Algorithm:
  1. Reverse-geocode each point to (country, city)
  2. Group by (country, city)
  3. Within each (country, city), collect distinct calendar days
  4. Split into visit spans: a gap of > VISIT_GAP_DAYS between consecutive days
     breaks the sequence into separate visits
  5. Rank cities by number of distinct days across all visits
  6. Flag "home" cities: cities averaging > home_days_per_year distinct days/year

Never prints lat/lon or filenames in bulk; prints summaries only.
"""
from __future__ import annotations

import collections
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple

from .geo import ensure_ne_data, reverse_geocode
from .parse import GeoPoint, SourceRef

# A gap longer than this (days) splits one city visit into two
VISIT_GAP_DAYS = 14

# Cities averaging more than this many distinct days per year are flagged home/work
DEFAULT_HOME_DAYS_PER_YEAR = 30


class Visit(NamedTuple):
    country: str
    city: str
    city_lat: float           # NE-resolved city centroid lat (rounded to 2 dp)
    city_lon: float           # NE-resolved city centroid lon (rounded to 2 dp)
    days: list[str]           # sorted YYYY-MM-DD strings, distinct days
    start: str                # earliest day
    end: str                  # latest day
    home_flagged: bool        # True if this city is flagged as home/work
    sample_refs: list[SourceRef]  # up to ~20 source refs for thumbnail candidates


def _day_str(ts: int) -> str:
    """Unix timestamp → 'YYYY-MM-DD' UTC."""
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


def cluster(
    points: list[GeoPoint],
    ne_dir: Path,
    home_days_per_year: int = DEFAULT_HOME_DAYS_PER_YEAR,
    home_cities: set[str] | None = None,
) -> list[Visit]:
    """
    Geocode every point and cluster into city visits.

    Args:
        points: raw GeoPoints from parse.scan_all()
        ne_dir: path to Natural Earth cache directory
        home_days_per_year: cities with > this avg distinct days/year are flagged home
        home_cities: explicit city names to always flag as home (case-insensitive)
    Returns:
        List of Visit objects, sorted by total_days desc (most-visited first).
    """
    ensure_ne_data(ne_dir)  # download if needed; no-op if cached

    # --- Step 1: geocode ---
    city_days: dict[tuple[str, str], list[tuple[str, SourceRef]]] = collections.defaultdict(list)
    # Store the NE-resolved city centroid coords (use the first resolved value; stable)
    city_coords: dict[tuple[str, str], tuple[float, float]] = {}
    geocode_ok = 0
    geocode_fail = 0
    for gp in points:
        result = reverse_geocode(gp.lat, gp.lon, ne_dir)
        if not result:
            geocode_fail += 1
            continue
        geocode_ok += 1
        key = (result["country"], result["city"])
        city_days[key].append((_day_str(gp.ts), gp.ref))
        if key not in city_coords:
            city_coords[key] = (result.get("city_lat", 0.0), result.get("city_lon", 0.0))

    print(f"Geocoded: {geocode_ok} ok, {geocode_fail} failed (ocean/border edge)")

    # --- Step 2+3: group by day, split into visit spans ---
    home_set = {c.lower() for c in (home_cities or set())}
    all_visits: list[Visit] = []

    for (country, city), entries in city_days.items():
        # Collect distinct days and a representative SourceRef per day
        day_refs: dict[str, list[SourceRef]] = collections.defaultdict(list)
        for day, ref in entries:
            day_refs[day].append(ref)

        sorted_days = sorted(day_refs.keys())

        # Split by gap
        spans: list[list[str]] = []
        current: list[str] = [sorted_days[0]]
        for prev_d, cur_d in zip(sorted_days, sorted_days[1:]):
            prev_dt = datetime.strptime(prev_d, "%Y-%m-%d")
            cur_dt = datetime.strptime(cur_d, "%Y-%m-%d")
            if (cur_dt - prev_dt).days > VISIT_GAP_DAYS:
                spans.append(current)
                current = [cur_d]
            else:
                current.append(cur_d)
        spans.append(current)

        for span in spans:
            sample: list[SourceRef] = []
            for d in span:
                # Only include photo refs (not timeline synthetic refs) when possible
                for ref in day_refs[d]:
                    if len(sample) >= 20:
                        break
                    sample.append(ref)
                if len(sample) >= 20:
                    break

            clat, clon = city_coords.get((country, city), (0.0, 0.0))
            all_visits.append(
                Visit(
                    country=country,
                    city=city,
                    city_lat=clat,
                    city_lon=clon,
                    days=span,
                    start=span[0],
                    end=span[-1],
                    home_flagged=False,  # filled in below
                    sample_refs=sample[:20],
                )
            )

    # --- Step 4: flag home/work cities ---
    city_total: dict[tuple[str, str], int] = collections.defaultdict(int)
    city_year_range: dict[tuple[str, str], tuple[int, int]] = {}
    for v in all_visits:
        key = (v.country, v.city)
        city_total[key] += len(v.days)
        years = [int(d[:4]) for d in v.days]
        prev = city_year_range.get(key, (years[0], years[-1]))
        city_year_range[key] = (min(prev[0], min(years)), max(prev[1], max(years)))

    flagged_keys: set[tuple[str, str]] = set()
    for key, total in city_total.items():
        if key[1].lower() in home_set:
            flagged_keys.add(key)
            continue
        min_yr, max_yr = city_year_range[key]
        years_span = max(1, max_yr - min_yr + 1)
        if total / years_span > home_days_per_year:
            flagged_keys.add(key)

    final_visits = [
        Visit(
            country=v.country,
            city=v.city,
            city_lat=v.city_lat,
            city_lon=v.city_lon,
            days=v.days,
            start=v.start,
            end=v.end,
            home_flagged=(v.country, v.city) in flagged_keys,
            sample_refs=v.sample_refs,
        )
        for v in all_visits
    ]

    # Sort: most distinct days first
    final_visits.sort(key=lambda v: len(v.days), reverse=True)

    n_home = sum(1 for v in final_visits if v.home_flagged)
    n_travel = len(final_visits) - n_home
    countries = {v.country for v in final_visits if not v.home_flagged}
    print(f"Clustered: {n_travel} travel visits across {len(countries)} countries, {n_home} home/work visits flagged")

    return final_visits
