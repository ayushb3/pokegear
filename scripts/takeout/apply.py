#!/usr/bin/env python3
"""apply.py — Apply an approved places selection to the portfolio repo.

Usage (approve.json mode):
  python3 scripts/takeout/apply.py <review_dir>/approve.json

Usage (local photos mode):
  python3 scripts/takeout/apply.py --photos-dir <dir> [--dry-run] [--ne-dir <dir>]
                                   [--excludes <review_dir>]

  <dir> is a flat folder (or has subfolders named after city/place ids or names).
  Each JPEG/PNG/HEIC is reverse-geocoded, matched to places.json, resized,
  stripped of all EXIF, and published to public/assets/photos/<place>-<n>.jpg
  with an entry in src/content/photos.json (the photo board's data) and a
  `photo.<place>-<n>` slot appended to assets.json. places.json only receives
  places/cities, never photo references.
  A manifest at <dir>/.portfolio-applied.json tracks processed hashes so a
  second run adds nothing for already-published files (idempotent).

What the approve.json mode does:
  1. Reads approve.json (produced by trips.py / scan.py, edited in review.html)
  2. For each approved city: adds it to src/content/places.json
     under the matching country place's `cities` array.
     - If the country place exists, it is found by `iso` first, then `id`.
     - If the country does not exist in places.json, it is NOT auto-created
       unless the approve.json entry supplies `iso` and `lat`/`lon` (NE centroid).
       A new entry uses the ISO code as its id (lowercase), never 0,0 lat/lon.
     - Existing places and cities are NEVER removed; existing fields are preserved.
  3. For each approved photo (ref_id from approved_512/): resizes to ≤512px,
     strips ALL EXIF/GPS, writes to public/assets/places/<city_id>-<n>.jpg.
     Numbering continues from the city's existing photo count; never overwrites.
     Photo slot keys are attached to City.photos[] in places.json.
  4. Appends new `place.photo.<city_id>-<n>` slots at the END of assets.json.
  5. Prints a summary only (no raw paths/coordinates).

places.json schema (src/content/places.ts):
  Place.cities[]: { id, name, line, lat, lon, photos?: string[] }
  photos[] is a list of asset slot keys, e.g. ["place.photo.france-paris-1"].

Privacy guarantee: no GPS data is ever written to public/. apply.py strips EXIF.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from PIL import Image, ImageOps
    _PIL_OK = True
except ImportError:
    _PIL_OK = False

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PLACES_JSON = REPO_ROOT / "src" / "content" / "places.json"
ASSETS_JSON = REPO_ROOT / "src" / "assets" / "assets.json"
PLACES_ASSETS_DIR = REPO_ROOT / "public" / "assets" / "places"
PHOTOS_JSON = REPO_ROOT / "src" / "content" / "photos.json"
PHOTOS_ASSETS_DIR = REPO_ROOT / "public" / "assets" / "photos"

MAX_LONG_EDGE = 512
QUALITY = 80

# Input validation patterns
_ID_RE = re.compile(r"^[a-z0-9-]{1,40}$")
_REF_ID_RE = re.compile(r"^[0-9a-f]{16}$")


def _validate_id(v: str, label: str) -> str:
    """Validate and return a safe place/city id. Exit on failure."""
    if not _ID_RE.match(v):
        print(f"Error: invalid {label} id {v!r} — must match ^[a-z0-9-]{{1,40}}$", file=sys.stderr)
        sys.exit(1)
    return v


def _validate_ref_id(v: str) -> bool:
    """Return True only if v is a safe ref_id (sha1 hex prefix from thumbs.py)."""
    return bool(_REF_ID_RE.match(v))


def _refuse_inside_repo(path: Path, label: str) -> None:
    try:
        path.resolve().relative_to(REPO_ROOT.resolve())
        print(f"Error: {label} must be OUTSIDE the repo root.\n  Given: {path}", file=sys.stderr)
        sys.exit(1)
    except ValueError:
        pass


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Publish photos and city data to the portfolio.",
        epilog=(
            "approve.json mode: python3 scripts/takeout/apply.py approve.json\n"
            "local photos mode: python3 scripts/takeout/apply.py --photos-dir <dir> [--dry-run]"
        ),
    )
    parser.add_argument("approve_json", nargs="?", metavar="approve.json",
                        help="approve.json from trips.py / review.html.")
    parser.add_argument("--photos-dir", metavar="DIR",
                        help="Flat folder of hand-picked JPEGs/PNGs to reverse-geocode and publish.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be done; write nothing (--photos-dir only).")
    parser.add_argument("--ne-dir", metavar="DIR", default=None,
                        help="Natural Earth cache dir (default: ~/.cache/portfolio-takeout/ne/).")
    parser.add_argument("--excludes", metavar="REVIEW_DIR", default=None,
                        help="Path to a review dir containing excludes.json (--photos-dir only).")
    args = parser.parse_args()

    if args.photos_dir:
        _main_photos_dir(
            photos_dir=Path(args.photos_dir).expanduser().resolve(),
            dry_run=args.dry_run,
            ne_dir=Path(args.ne_dir).expanduser() if args.ne_dir else None,
            excludes_dir=Path(args.excludes).expanduser() if args.excludes else None,
        )
        return

    if not args.approve_json:
        parser.print_help()
        sys.exit(1)

    approve_path = Path(args.approve_json).expanduser().resolve()
    _refuse_inside_repo(approve_path, "approve.json")
    if not approve_path.exists():
        print(f"Error: approve.json not found: {approve_path}", file=sys.stderr)
        sys.exit(1)

    review_dir = approve_path.parent
    approved_512_dir = review_dir / "approved_512"

    with open(approve_path, encoding="utf-8") as f:
        approve = json.load(f)

    if "countries" not in approve:
        print("Error: approve.json missing 'countries' key.", file=sys.stderr)
        sys.exit(1)

    # Load existing places.json — NEVER discard existing data
    places_data = _load_places()

    cities_added = 0
    cities_updated = 0
    photos_written = 0
    slots_added: list[str] = []
    skipped_zero_coord = 0

    PLACES_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    for country_entry in approve.get("countries", []):
        country_name = country_entry.get("name", "")
        country_iso = country_entry.get("iso", "")  # optional ISO-A3 from trips.py
        raw_country_id = country_entry.get("id") or _make_id(country_name)
        country_id = _validate_id(raw_country_id, "country")

        # Country lat/lon from approve.json (NE centroid, filled by trips.py)
        country_lat = float(country_entry.get("lat", 0.0))
        country_lon = float(country_entry.get("lon", 0.0))

        for city_entry in country_entry.get("cities", []):
            if not city_entry.get("approved"):
                continue

            raw_city_id = city_entry.get("id") or _make_id(city_entry.get("name", ""))
            city_id = _validate_id(raw_city_id, "city")
            city_name = city_entry.get("name", "")
            city_lat = round(float(city_entry.get("lat", 0.0)), 2)
            city_lon = round(float(city_entry.get("lon", 0.0)), 2)
            line = city_entry.get("line", "Visited")

            # Refuse cities with 0,0 coords — they mean geocoding failed
            if abs(city_lat) < 0.01 and abs(city_lon) < 0.01:
                print(f"  Skipping {city_name}: lat/lon is 0,0 (geocoding likely failed)")
                skipped_zero_coord += 1
                continue

            # Find the matching country place (iso first, then id, then create)
            place_entry = _find_place(places_data, country_id, country_iso)
            if place_entry is None:
                # New country — need lat/lon that aren't 0,0
                if abs(country_lat) < 0.01 and abs(country_lon) < 0.01:
                    print(
                        f"  Error: country {country_name!r} not in places.json and "
                        f"approve.json has no lat/lon for it. "
                        f"Add it manually or supply lat/lon in approve.json.",
                        file=sys.stderr,
                    )
                    continue
                place_entry = _create_place(
                    places_data, country_id, country_name, country_iso, country_lat, country_lon
                )

            # Find or add the city within that place's cities list
            existing_city = next(
                (c for c in place_entry.get("cities", []) if c["id"] == city_id),
                None,
            )
            if existing_city:
                existing_city["line"] = line
                cities_updated += 1
                target_city = existing_city
            else:
                if "cities" not in place_entry:
                    place_entry["cities"] = []
                new_city: dict = {
                    "id": city_id,
                    "name": city_name,
                    "line": line,
                    "lat": city_lat,
                    "lon": city_lon,
                }
                place_entry["cities"].append(new_city)
                cities_added += 1
                target_city = new_city

            # Process approved photos — continue from existing count, never overwrite
            existing_photos: list[str] = target_city.get("photos", [])
            start_n = len(existing_photos) + 1

            for ref_id in city_entry.get("photos", []):
                if not _validate_ref_id(str(ref_id)):
                    print(f"  Warning: invalid ref_id {ref_id!r}, skipping photo")
                    continue

                n = start_n
                dest_name = f"{city_id}-{n}.jpg"
                dest_path = PLACES_ASSETS_DIR / dest_name

                # Security: assert dest stays under PLACES_ASSETS_DIR
                try:
                    dest_path.resolve().relative_to(PLACES_ASSETS_DIR.resolve())
                except ValueError:
                    print(f"  Warning: destination path escapes asset dir, skipping")
                    continue

                # Don't overwrite an existing file
                if dest_path.exists():
                    print(f"  Warning: {dest_name} already exists, skipping (would overwrite)")
                    continue

                fallback = approved_512_dir / f"{ref_id}.jpg"
                if not fallback.exists():
                    print(f"  Warning: photo {ref_id} not found in approved_512/, skipping")
                    continue

                out_bytes = resize_strip_image(fallback.read_bytes())
                if not out_bytes:
                    print(f"  Warning: could not process photo {ref_id}, skipping")
                    continue

                dest_path.write_bytes(out_bytes)
                photos_written += 1
                start_n += 1

                slot_name = f"place.photo.{city_id}-{n}"
                # Attach the slot key to City.photos[] in places.json
                if "photos" not in target_city:
                    target_city["photos"] = []
                if slot_name not in target_city["photos"]:
                    target_city["photos"].append(slot_name)
                if slot_name not in slots_added:
                    slots_added.append(slot_name)

    # Write places.json
    _save_places(places_data)

    # Append new slots to assets.json
    if slots_added:
        _append_asset_slots(slots_added)

    # Print summary
    approved_countries = sum(
        1 for c in approve.get("countries", [])
        if any(ci.get("approved") for ci in c.get("cities", []))
    )
    print(f"\nApply complete:")
    print(f"  Countries with approved cities: {approved_countries}")
    print(f"  Cities added:   {cities_added}")
    print(f"  Cities updated: {cities_updated}")
    if skipped_zero_coord:
        print(f"  Cities skipped (0,0 coords): {skipped_zero_coord}")
    print(f"  Photos written: {photos_written}")
    if slots_added:
        print(f"  Asset slots appended: {len(slots_added)}")
    print(f"  places.json written.")
    print("\nRun 'npm test' to verify places.json is valid.")


def _load_places() -> dict:
    """Load places.json; return empty skeleton if missing."""
    if PLACES_JSON.exists():
        with open(PLACES_JSON, encoding="utf-8") as f:
            return json.load(f)
    return {"sample": False, "places": []}


def _save_places(places: dict) -> None:
    """Write places.json preserving all existing fields."""
    PLACES_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(PLACES_JSON, "w", encoding="utf-8") as f:
        json.dump(places, f, indent=2, ensure_ascii=False)
        f.write("\n")


def _find_place(places_data: dict, country_id: str, country_iso: str) -> dict | None:
    """Find an existing place by iso (preferred) then id. Returns None if not found."""
    places = places_data.get("places", [])
    # Try iso match first (most reliable for NE data)
    if country_iso:
        for p in places:
            if p.get("iso", "").upper() == country_iso.upper():
                return p
    # Fall back to id match
    for p in places:
        if p.get("id") == country_id:
            return p
    return None


def _create_place(
    places_data: dict,
    country_id: str,
    country_name: str,
    country_iso: str,
    lat: float,
    lon: float,
) -> dict:
    """Create a new minimal place entry. Never uses 0,0 lat/lon."""
    # Use ISO-lowercase as id if available (e.g. "FRA" → "fra"), else the passed id
    safe_id = country_iso.lower() if country_iso else country_id
    # Clamp to id pattern
    safe_id = re.sub(r"[^a-z0-9-]", "-", safe_id)[:40].strip("-")
    new_place: dict = {
        "id": safe_id,
        "name": country_name,
        "line": "Visited",
        "lat": round(lat, 2),
        "lon": round(lon, 2),
        "cities": [],
    }
    if country_iso:
        new_place["iso"] = country_iso.upper()
    places_data.setdefault("places", []).append(new_place)
    print(f"  Added new country: {country_name} (id={safe_id}, iso={country_iso})")
    return new_place


def _append_asset_slots(slot_names: list[str]) -> None:
    """Append new place.photo.* slots at the END of assets.json."""
    with open(ASSETS_JSON, encoding="utf-8") as f:
        assets = json.load(f)

    added = 0
    for slot_name in slot_names:
        if slot_name in assets:
            continue
        rest = slot_name[len("place.photo."):]
        assets[slot_name] = {
            "kind": "object",
            "path": f"/assets/places/{rest}.jpg",
            "w": MAX_LONG_EDGE,
            "h": MAX_LONG_EDGE,
            "color": "#c8d8c0",
        }
        added += 1

    if added:
        with open(ASSETS_JSON, "w", encoding="utf-8") as f:
            json.dump(assets, f, indent=2)
            f.write("\n")


def resize_strip_image(raw: bytes) -> bytes | None:
    """Resize to ≤512px long edge, strip ALL EXIF/ICC/XMP, return JPEG bytes.

    Shared between apply.py and pick.py — import from here.
    """
    if not _PIL_OK:
        print("  Warning: Pillow not available, cannot process photos.")
        return None
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img = ImageOps.exif_transpose(img)
            img = img.convert("RGB")
            w, h = img.size
            long_edge = max(w, h)
            if long_edge > MAX_LONG_EDGE:
                scale = MAX_LONG_EDGE / long_edge
                img = img.resize(
                    (max(1, int(w * scale)), max(1, int(h * scale))),
                    Image.LANCZOS,
                )
            buf = io.BytesIO()
            # No exif= kwarg → Pillow writes no EXIF; convert("RGB") drops ICC/XMP
            img.save(buf, format="JPEG", quality=QUALITY, optimize=True)
            return buf.getvalue()
    except Exception as e:
        print(f"  Warning: image processing failed: {e}")
        return None


def _make_id(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]


# ──────────────────────────────────────────────────────────────────────────────
# Local photos mode (--photos-dir)
# ──────────────────────────────────────────────────────────────────────────────

# HEIC support via pillow-heif (optional)
_HEIC_REGISTERED = False
try:
    import pillow_heif as _pillow_heif  # type: ignore[import-untyped]
    _pillow_heif.register_heif_opener()
    _HEIC_REGISTERED = True
except ImportError:
    pass

_PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff"}
_HEIC_EXTS  = {".heic", ".heif"}

# GPS IFD tag number in EXIF
_GPS_IFD_TAG = 0x8825


def _sha256_file(path: Path) -> str:
    """Return hex SHA-256 of file contents."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_exif_gps(raw: bytes) -> tuple[float, float] | None:
    """Extract GPS lat/lon from JPEG/image EXIF. Returns (lat, lon) or None."""
    if not _PIL_OK:
        return None
    try:
        with Image.open(io.BytesIO(raw)) as img:
            exif = img.getexif()
            gps_ifd = exif.get_ifd(_GPS_IFD_TAG)
            if not gps_ifd:
                return None
            # GPS tag ids: 1=GPSLatitudeRef, 2=GPSLatitude, 3=GPSLongitudeRef, 4=GPSLongitude
            lat_ref = gps_ifd.get(1, "N")
            lon_ref = gps_ifd.get(3, "E")
            lat_vals = gps_ifd.get(2)
            lon_vals = gps_ifd.get(4)
            if not lat_vals or not lon_vals:
                return None

            def _dms_to_deg(vals: tuple) -> float:
                d, m, s = vals
                return float(d) + float(m) / 60 + float(s) / 3600

            lat = _dms_to_deg(lat_vals)
            lon = _dms_to_deg(lon_vals)
            if lat_ref == "S":
                lat = -lat
            if lon_ref == "W":
                lon = -lon
            return lat, lon
    except Exception:
        return None


def _load_excludes(excludes_dir: Path | None) -> dict[str, set[str]]:
    """Load region/country/city exclusion sets from <excludes_dir>/excludes.json."""
    result: dict[str, set[str]] = {"regions": set(), "countries": set(), "cities": set()}
    if not excludes_dir:
        return result
    path = excludes_dir / "excludes.json"
    if not path.exists():
        return result
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for key in ("regions", "countries", "cities"):
            for v in data.get(key, []):
                result[key].add(v.lower().strip())
    except (json.JSONDecodeError, OSError) as e:
        print(f"Warning: could not read excludes.json: {e}", file=sys.stderr)
    return result


def _collect_image_files(photos_dir: Path) -> list[tuple[Path, str | None]]:
    """Return (image_path, city_hint_or_None) pairs.

    City hint is the subfolder name (lowercased, spaces→dashes) when the
    image is in a direct child subdirectory of photos_dir.  Flat images in
    photos_dir itself have no hint.
    """
    results: list[tuple[Path, str | None]] = []
    for item in sorted(photos_dir.iterdir()):
        if item.is_file() and item.suffix.lower() in _PHOTO_EXTS:
            results.append((item, None))
        elif item.is_dir():
            # Subfolder name = city hint
            hint = _make_id(item.name)
            for f in sorted(item.iterdir()):
                if f.is_file() and f.suffix.lower() in _PHOTO_EXTS:
                    results.append((f, hint))
    return results


def _match_city_hint(hint: str, places_data: dict) -> dict | None:
    """Try to find an existing city in any place matching the hint by id or name slug."""
    for place in places_data.get("places", []):
        for city in place.get("cities", []):
            if city.get("id") == hint:
                return city
            if _make_id(city.get("name", "")) == hint:
                return city
    return None


PHOTO_SLOT_COLOR = "#9a9aaa"


def _load_photos() -> dict:
    """Load photos.json ({ photos: [...] }); an empty board if absent."""
    if PHOTOS_JSON.exists():
        with open(PHOTOS_JSON, encoding="utf-8") as f:
            data = json.load(f)
        data.setdefault("photos", [])
        return data
    return {"photos": []}


def _save_photos(data: dict) -> None:
    PHOTOS_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(PHOTOS_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def _next_photo_n(rows: list[dict], place_id: str) -> int:
    """Next free number for `<place_id>-<n>`: above every existing id AND file, never reused."""
    pat = re.compile(rf"^{re.escape(place_id)}-(\d+)$")
    used = [int(m.group(1)) for r in rows if (m := pat.match(str(r.get("id", ""))))]
    if PHOTOS_ASSETS_DIR.exists():
        for f in PHOTOS_ASSETS_DIR.glob(f"{place_id}-*.jpg"):
            m = pat.match(f.stem)
            if m:
                used.append(int(m.group(1)))
    return max(used, default=0) + 1


def _insert_photo_row(rows: list[dict], row: dict) -> None:
    """Add `row` unless its id exists. Keeps a place's photos contiguous (the board
    groups by place): after the place's last photo, or at the end for a new place."""
    if any(r.get("id") == row["id"] for r in rows):
        return
    last = max((i for i, r in enumerate(rows) if r.get("place") == row["place"]), default=None)
    if last is None:
        rows.append(row)
    else:
        rows.insert(last + 1, row)


def _jpeg_size(data: bytes) -> tuple[int, int]:
    with Image.open(io.BytesIO(data)) as img:
        return img.size


def _append_photo_slots(slots: dict[str, dict]) -> None:
    """Append new photo.* slots at the END of assets.json (existing keys untouched)."""
    with open(ASSETS_JSON, encoding="utf-8") as f:
        assets = json.load(f)
    added = False
    for name, slot in slots.items():
        if name not in assets:
            assets[name] = slot
            added = True
    if added:
        with open(ASSETS_JSON, "w", encoding="utf-8") as f:
            json.dump(assets, f, indent=2)
            f.write("\n")


def _main_photos_dir(
    photos_dir: Path,
    dry_run: bool,
    ne_dir: Path | None,
    excludes_dir: Path | None,
) -> None:
    """--photos-dir mode: reverse-geocode hand-picked photos and publish them."""
    from takeout.geo import ensure_ne_data, reverse_geocode

    if not photos_dir.exists():
        print(f"Error: --photos-dir not found: {photos_dir}", file=sys.stderr)
        sys.exit(1)

    ne_cache = ensure_ne_data(ne_dir)
    excludes = _load_excludes(excludes_dir)
    ex_regions  = excludes["regions"]
    ex_countries = excludes["countries"]
    ex_cities   = excludes["cities"]

    # Load manifest of already-published source file hashes
    manifest_path = photos_dir / ".portfolio-applied.json"
    manifest: dict[str, str] = {}  # sha256 → city_id
    if manifest_path.exists():
        try:
            with open(manifest_path, encoding="utf-8") as f:
                manifest = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    # Load places.json
    places_data = _load_places()

    image_files = _collect_image_files(photos_dir)
    if not image_files:
        print("No image files found in photos_dir.")
        return

    heic_skipped = 0
    no_gps: list[Path] = []
    excluded: list[Path] = []
    already_done: list[Path] = []

    # city_id → list of Path to publish
    to_publish: dict[str, list[tuple[Path, dict, dict]]] = {}  # city_id → [(path, place, city)]

    print(f"Scanning {len(image_files)} image(s) in {photos_dir} ...")

    for img_path, city_hint in image_files:
        ext = img_path.suffix.lower()
        if ext in _HEIC_EXTS and not _HEIC_REGISTERED:
            heic_skipped += 1
            continue

        # Idempotency check: skip if already published
        src_hash = _sha256_file(img_path)
        if src_hash in manifest:
            already_done.append(img_path)
            continue

        raw = img_path.read_bytes()

        # Extract GPS coords
        coords = _read_exif_gps(raw)
        if not coords and not city_hint:
            no_gps.append(img_path)
            continue

        # Resolve city via hint (subfolder name) or geocoder
        city_id_resolved: str | None = None
        place_entry: dict | None = None
        city_entry: dict | None = None

        if city_hint:
            # Try to match the hint to an existing city
            matched = _match_city_hint(city_hint, places_data)
            if matched:
                # Find the parent place
                for p in places_data.get("places", []):
                    if any(c.get("id") == matched["id"] for c in p.get("cities", [])):
                        place_entry = p
                        city_entry = matched
                        city_id_resolved = matched["id"]
                        break

        if city_id_resolved is None and coords:
            lat, lon = coords
            result = reverse_geocode(lat, lon, ne_cache)
            if not result:
                no_gps.append(img_path)
                continue

            # Apply exclusions
            region = result.get("region", "").lower()
            country_name = result["country"]
            city_name = result["city"]
            if (
                (ex_regions and region and region in ex_regions)
                or (ex_countries and country_name.lower() in ex_countries)
                or (ex_cities and city_name.lower() in ex_cities)
            ):
                excluded.append(img_path)
                continue

            country_iso = result.get("country_iso", "")
            city_lat = round(result.get("city_lat", 0.0), 2)
            city_lon = round(result.get("city_lon", 0.0), 2)

            if abs(city_lat) < 0.01 and abs(city_lon) < 0.01:
                no_gps.append(img_path)
                continue

            # Find or create place (country)
            raw_cid = _make_id(country_iso.lower() if country_iso else country_name)
            country_id = raw_cid
            place_entry = _find_place(places_data, country_id, country_iso)
            if place_entry is None:
                # Need country lat/lon — use city centroid as stand-in
                place_entry = _create_place(
                    places_data, country_id, country_name, country_iso, city_lat, city_lon
                )

            city_id_resolved = _make_id(f"{place_entry.get('name', country_name)}-{city_name}")
            # Find or create city
            city_entry = next(
                (c for c in place_entry.get("cities", []) if c["id"] == city_id_resolved),
                None,
            )
            if city_entry is None:
                if "cities" not in place_entry:
                    place_entry["cities"] = []
                city_entry = {
                    "id": city_id_resolved,
                    "name": city_name,
                    "line": "Visited",
                    "lat": city_lat,
                    "lon": city_lon,
                }
                place_entry["cities"].append(city_entry)
        elif city_id_resolved is None:
            no_gps.append(img_path)
            continue

        assert city_id_resolved is not None
        assert city_entry is not None
        assert place_entry is not None

        key = city_id_resolved
        if key not in to_publish:
            to_publish[key] = []
        to_publish[key].append((img_path, place_entry, city_entry))

    # ── Summary / dry-run report ──────────────────────────────────────────────
    print(f"\nPhotos scan complete:")
    if already_done:
        print(f"  Already published (skipped): {len(already_done)}")
    if heic_skipped:
        print(f"  HEIC/HEIF skipped (install pillow-heif to enable): {heic_skipped}")
    if no_gps:
        print(f"  No GPS / unsorted ({len(no_gps)} file(s)): " +
              ", ".join(p.name for p in no_gps[:10]) +
              ("..." if len(no_gps) > 10 else ""))
    if excluded:
        print(f"  Excluded by region/country/city filter: {len(excluded)}")
    if to_publish:
        print(f"\n  Would publish:" if dry_run else f"\n  Publishing:")
        for cid, entries in sorted(to_publish.items()):
            city_name = entries[0][2].get("name", cid)
            country_name = entries[0][1].get("name", "?")
            print(f"    {country_name} / {city_name}: {len(entries)} photo(s)")
    else:
        print("  Nothing to publish.")

    if dry_run:
        print("\n[dry-run] No files written.")
        return

    if not to_publish:
        return

    # ── Write photos ──────────────────────────────────────────────────────────
    if not _PIL_OK:
        print("Error: Pillow required for image processing. pip install Pillow", file=sys.stderr)
        sys.exit(1)

    PHOTOS_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    photos_data = _load_photos()
    photo_rows: list[dict] = photos_data["photos"]
    new_slots: dict[str, dict] = {}
    photos_written = 0
    new_manifest: dict[str, str] = dict(manifest)

    for city_id, entries in sorted(to_publish.items()):
        for img_path, place_entry, city_entry in entries:
            src_hash = _sha256_file(img_path)
            place_id = place_entry["id"]
            _validate_id(place_id, "place")

            raw = img_path.read_bytes()
            out_bytes = resize_strip_image(raw)
            if not out_bytes:
                print(f"  Warning: could not process {img_path.name}, skipping")
                continue

            n = _next_photo_n(photo_rows, place_id)
            photo_id = f"{place_id}-{n}"
            dest_path = PHOTOS_ASSETS_DIR / f"{photo_id}.jpg"

            # Security: assert dest stays under PHOTOS_ASSETS_DIR
            try:
                dest_path.resolve().relative_to(PHOTOS_ASSETS_DIR.resolve())
            except ValueError:
                print("  Warning: destination path escapes asset dir, skipping")
                continue

            dest_path.write_bytes(out_bytes)
            photos_written += 1

            slot_name = f"photo.{photo_id}"
            w, h = _jpeg_size(out_bytes)
            new_slots[slot_name] = {
                "kind": "object",
                "path": f"/assets/photos/{photo_id}.jpg",
                "w": w,
                "h": h,
                "color": PHOTO_SLOT_COLOR,
            }
            _insert_photo_row(photo_rows, {
                "id": photo_id,
                "place": place_id,
                "where": city_entry.get("name", city_id),
                "slot": slot_name,
            })

            new_manifest[src_hash] = photo_id
            print(f"  Written: {photo_id}.jpg (from {img_path.name})")

    # Save places.json (places/cities only) + photos.json + assets.json
    _save_places(places_data)
    if photos_written:
        _save_photos(photos_data)
        _append_photo_slots(new_slots)

    # Save manifest (gitignored)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(new_manifest, f, indent=2)
        f.write("\n")

    print(f"\nPhotos apply complete:")
    print(f"  Photos written: {photos_written}")
    if new_slots:
        print(f"  Asset slots appended: {len(new_slots)}")
    print(f"  places.json written (places/cities only).")
    if photos_written:
        print(f"  photos.json updated.")
        print(f"  Manifest saved: {manifest_path}")
    print("\nRun 'npm test' to verify places.json and photos.json are valid.")


if __name__ == "__main__":
    main()
