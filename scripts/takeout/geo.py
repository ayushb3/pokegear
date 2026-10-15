"""Offline reverse geocoding using Natural Earth public-domain GeoJSON.

Downloads ne_10m_populated_places_simple and ne_50m_admin_0_countries ONCE
into a cache directory (default ~/.cache/portfolio-takeout/ne/), then uses:
  - Point-in-polygon (ray casting over MultiPolygons) for country lookup
  - Nearest city within the matched country (Haversine)

No network at runtime after the first download.

Security:
  - URLs are pinned to specific commits in the NE vector repo.
  - Each file is SHA-256 verified against a known hash before use.
  - Downloads are written to a temp file and renamed atomically.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import sys
import tempfile
import urllib.request
from pathlib import Path
from typing import Any

# Natural Earth data — pinned to specific commits (public domain)
# To update: run the pipeline once against the master branch, capture the new
# SHA-256, and update both the URL commit ref and the hash below.
_NE_FILES: list[dict[str, str]] = [
    {
        "name": "ne_10m_populated_places_simple.geojson",
        "url": (
            "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
            "789c9904087846cc3361302857aa2e76b0ae71ff/"
            "geojson/ne_10m_populated_places_simple.geojson"
        ),
        # SHA-256 of the file at the pinned commit
        "sha256": "fd3fa867a320cbd5c5b6bb5bc550afeec2939fb2cef688e508007282a55ac42f",
    },
    {
        "name": "ne_50m_admin_0_countries.geojson",
        "url": (
            "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
            "9380cca83db5f9aef52d5e762765100745f84b27/"
            "geojson/ne_50m_admin_0_countries.geojson"
        ),
        "sha256": "3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb",
    },
]

DEFAULT_CACHE = Path.home() / ".cache" / "portfolio-takeout" / "ne"

_countries: list[dict[str, Any]] | None = None
_cities: list[dict[str, Any]] | None = None


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def _download_verified(url: str, dest: Path, expected_sha256: str) -> None:
    """Download url to dest via a temp file, verifying SHA-256 before rename."""
    print(f"  Downloading {dest.name} ...", flush=True)
    os.makedirs(dest.parent, exist_ok=True)
    # Write to a sibling temp file so dest is never partially written
    fd, tmp_path_str = tempfile.mkstemp(dir=dest.parent, prefix=dest.name + ".tmp")
    tmp_path = Path(tmp_path_str)
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            data = r.read()
        os.write(fd, data)
        os.close(fd)
        fd = -1

        actual = hashlib.sha256(data).hexdigest()
        if actual != expected_sha256:
            raise ValueError(
                f"SHA-256 mismatch for {dest.name}:\n"
                f"  expected: {expected_sha256}\n"
                f"  got:      {actual}\n"
                "The file may have changed at the pinned commit — check geo.py."
            )
        tmp_path.rename(dest)
        print(f"  Verified and saved {dest.name}", flush=True)
    except Exception:
        if fd >= 0:
            try:
                os.close(fd)
            except OSError:
                pass
        tmp_path.unlink(missing_ok=True)
        raise


def ensure_ne_data(ne_dir: Path | None = None) -> Path:
    """Return the cache directory, downloading and verifying files if needed."""
    nd = Path(ne_dir) if ne_dir else DEFAULT_CACHE
    nd.mkdir(parents=True, exist_ok=True)

    needs_download = any(not (nd / spec["name"]).exists() for spec in _NE_FILES)
    if needs_download:
        print("Natural Earth data not found in cache. Downloading once (public domain, pinned commit)...")
        print(f"  Cache directory: {nd}")

    for spec in _NE_FILES:
        dest = nd / spec["name"]
        if not dest.exists():
            _download_verified(spec["url"], dest, spec["sha256"])
        else:
            # Verify existing file integrity (detect corruption / manual edits)
            actual = _sha256_file(dest)
            if actual != spec["sha256"]:
                print(
                    f"  Warning: {spec['name']} SHA-256 mismatch — re-downloading.",
                    flush=True,
                )
                _download_verified(spec["url"], dest, spec["sha256"])

    return nd


def _load_data(ne_dir: Path) -> None:
    global _countries, _cities
    if _countries is not None:
        return
    places_file = ne_dir / "ne_10m_populated_places_simple.geojson"
    countries_file = ne_dir / "ne_50m_admin_0_countries.geojson"
    with open(places_file, encoding="utf-8") as f:
        pdata = json.load(f)
    with open(countries_file, encoding="utf-8") as f:
        cdata = json.load(f)
    _cities = pdata["features"]
    _countries = cdata["features"]


def _ray_cast(point: tuple[float, float], polygon: list[list[float]]) -> bool:
    """Ray casting: does the point lie inside the ring?"""
    px, py = point
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _point_in_geometry(lon: float, lat: float, geometry: dict[str, Any]) -> bool:
    """Test whether (lon, lat) lies within a GeoJSON geometry (Polygon or MultiPolygon)."""
    gtype = geometry["type"]
    coords = geometry["coordinates"]
    point = (lon, lat)
    if gtype == "Polygon":
        if not _ray_cast(point, coords[0]):
            return False
        for hole in coords[1:]:
            if _ray_cast(point, hole):
                return False
        return True
    elif gtype == "MultiPolygon":
        for poly in coords:
            outer = poly[0]
            if _ray_cast(point, outer):
                in_hole = any(_ray_cast(point, hole) for hole in poly[1:])
                if not in_hole:
                    return True
        return False
    return False


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def reverse_geocode(lat: float, lon: float, ne_dir: Path) -> dict[str, Any] | None:
    """Return geocoding result or None.

    Return dict keys:
      country   : str   — country name from NE admin-0 dataset
      city      : str   — nearest populated place name
      city_lat  : float — NE centroid lat, rounded to 2 dp
      city_lon  : float — NE centroid lon, rounded to 2 dp
      region    : str   — first-level admin region (adm1name, e.g. "Illinois")

    region comes from the nearest city's adm1name property in
    ne_10m_populated_places_simple, which carries the province/state name directly.
    """
    _load_data(ne_dir)
    assert _countries is not None and _cities is not None

    # 1. Find country via point-in-polygon
    country_name: str | None = None
    country_iso: str | None = None
    for feat in _countries:
        geom = feat.get("geometry")
        if not geom:
            continue
        if _point_in_geometry(lon, lat, geom):
            props = feat.get("properties", {})
            country_name = props.get("ADMIN") or props.get("NAME") or props.get("name")
            country_iso = props.get("ISO_A2") or props.get("iso_a2")
            break

    if not country_name:
        best_city = _nearest_city(lat, lon, None)
        if best_city and _haversine_km(lat, lon, best_city["lat"], best_city["lon"]) < 100:
            return {
                "country": best_city["country"],
                "country_iso": best_city.get("iso_a3", ""),
                "city": best_city["name"],
                "city_lat": round(best_city["lat"], 2),
                "city_lon": round(best_city["lon"], 2),
                "region": best_city.get("region", ""),
            }
        return None

    # Retrieve ISO-A3 for the matched country.
    # NE uses '-99' as a placeholder for disputed/special territories; skip those.
    country_iso_a3 = ""
    for feat in _countries:  # type: ignore[union-attr]
        geom = feat.get("geometry")
        if not geom:
            continue
        if _point_in_geometry(lon, lat, geom):
            props = feat.get("properties", {})
            for key in ("ADM0_ISO", "ISO_A3_EH", "ISO_A3", "iso_a3"):
                val = props.get(key, "")
                if val and val != "-99":
                    country_iso_a3 = val
                    break
            break

    best_city = _nearest_city(lat, lon, country_iso)
    if best_city:
        return {
            "country": country_name,
            "country_iso": country_iso_a3,
            "city": best_city["name"],
            "city_lat": round(best_city["lat"], 2),
            "city_lon": round(best_city["lon"], 2),
            "region": best_city.get("region", ""),
        }
    best_city = _nearest_city(lat, lon, None)
    if best_city:
        return {
            "country": country_name,
            "country_iso": country_iso_a3,
            "city": best_city["name"],
            "city_lat": round(best_city["lat"], 2),
            "city_lon": round(best_city["lon"], 2),
            "region": best_city.get("region", ""),
        }
    return None


def _nearest_city(lat: float, lon: float, iso: str | None) -> dict[str, Any] | None:
    """Find nearest city, optionally filtering by country ISO-A2.

    Returns dict with keys: name, lat, lon, country, iso, iso_a3, region (adm1name).
    """
    assert _cities is not None
    best_dist = float("inf")
    best: dict[str, Any] | None = None
    for feat in _cities:
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})
        if geom.get("type") != "Point":
            continue
        city_lon, city_lat = geom["coordinates"][:2]
        if iso:
            feat_iso2 = props.get("iso_a2", "")
            if feat_iso2 and feat_iso2 != iso:
                pass
        d = _haversine_km(lat, lon, city_lat, city_lon)
        if d < best_dist:
            best_dist = d
            country_prop = props.get("adm0name") or props.get("sov0name") or props.get("SOV0NAME", "")
            best = {
                "name": props.get("name") or props.get("NAME", ""),
                "lat": city_lat,
                "lon": city_lon,
                "country": country_prop,
                "iso": props.get("iso_a2", ""),
                "iso_a3": props.get("adm0_a3") or props.get("adm0_a3_is") or props.get("iso_a3", ""),
                "region": props.get("adm1name", ""),
            }
    return best
