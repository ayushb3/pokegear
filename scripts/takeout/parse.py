"""Parse Google Takeout exports: Google Photos + Maps Timeline.

Supports:
  - Directories (extracted takeout)
  - .zip and .tgz/.tar.gz archives (streamed in-place, no extraction of media)
  - Timeline.json standalone files
  - Incremental / multi-archive scanning via state.json

Extracts (lat, lon, timestamp_unix, source_ref) records.
Skips (0, 0) coordinates.
Never prints raw coordinates or filenames in bulk; prints summaries only.
"""
from __future__ import annotations

import io
import json
import os
import tarfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, NamedTuple, Union


PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff", ".mp4", ".mov", ".avi", ".mkv", ".gif"}
ARCHIVE_EXTENSIONS = {".zip", ".tgz", ".gz"}  # .tar.gz handled separately


class SourceRef(NamedTuple):
    """Points to a specific media file: either a filesystem path or (archive, member)."""
    archive: Path | None  # None → filesystem path
    member: str           # archive member path OR filesystem path string
    path_hint: Path       # a filesystem Path for filesystem sources; for archives, the archive path

    def __str__(self) -> str:
        if self.archive:
            return f"{self.archive.name}:{self.member}"
        return self.member

    def is_archive(self) -> bool:
        return self.archive is not None


class GeoPoint(NamedTuple):
    lat: float
    lon: float
    ts: int           # unix timestamp (seconds)
    ref: SourceRef    # where the media lives


def _is_zero(lat: float, lon: float) -> bool:
    return abs(lat) < 1e-6 and abs(lon) < 1e-6


def _parse_iso(s: str) -> int:
    """Parse ISO 8601 string to unix timestamp, or return 0."""
    if not s:
        return 0
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except ValueError:
        return 0


# ──────────────────────────────────────────────────────────────────────────────
# Sidecar parsing
# ──────────────────────────────────────────────────────────────────────────────

def _parse_sidecar_data(data: dict) -> tuple[float, float, int] | None:
    """Extract (lat, lon, unix_ts) from a parsed sidecar JSON dict."""
    lat, lon = 0.0, 0.0
    for field in ("geoData", "geoDataExif"):
        geo = data.get(field, {})
        if isinstance(geo, dict):
            lat = float(geo.get("latitude", 0) or 0)
            lon = float(geo.get("longitude", 0) or 0)
            if not _is_zero(lat, lon):
                break

    ts = 0
    pt = data.get("photoTakenTime") or data.get("creationTime") or {}
    if isinstance(pt, dict):
        ts = int(pt.get("timestamp", 0) or 0)

    if _is_zero(lat, lon) or ts == 0:
        return None
    return (lat, lon, ts)


def _parse_sidecar_bytes(raw: bytes) -> tuple[float, float, int] | None:
    try:
        return _parse_sidecar_data(json.loads(raw.decode("utf-8", errors="replace")))
    except (json.JSONDecodeError, ValueError):
        return None


def _parse_sidecar_file(path: Path) -> tuple[float, float, int] | None:
    try:
        with open(path, encoding="utf-8") as f:
            return _parse_sidecar_data(json.load(f))
    except (json.JSONDecodeError, OSError):
        return None


# ──────────────────────────────────────────────────────────────────────────────
# EXIF fallback
# ──────────────────────────────────────────────────────────────────────────────

def _read_exif_gps_bytes(raw: bytes) -> tuple[float, float] | None:
    """Try to read GPS from JPEG bytes via Pillow."""
    try:
        from PIL import Image
        from .exif_strip import read_gps_from_exif
        img = Image.open(io.BytesIO(raw))
        # Write to temp BytesIO because read_gps_from_exif needs a path—use inline
        return _exif_gps_from_pil(img)
    except Exception:
        return None


def _exif_gps_from_pil(img) -> tuple[float, float] | None:
    try:
        exif = img.getexif()
        if not exif:
            return None
        gps_ifd = exif.get_ifd(0x8825)
        if not gps_ifd:
            return None
        lat_ref = gps_ifd.get(1)
        lat_raw = gps_ifd.get(2)
        lon_ref = gps_ifd.get(3)
        lon_raw = gps_ifd.get(4)
        if not (lat_ref and lat_raw and lon_ref and lon_raw):
            return None
        lat = _dms_to_decimal(lat_raw)
        lon = _dms_to_decimal(lon_raw)
        if lat_ref in ("S", "s"):
            lat = -lat
        if lon_ref in ("W", "w"):
            lon = -lon
        if _is_zero(lat, lon):
            return None
        return (lat, lon)
    except Exception:
        return None


def _dms_to_decimal(dms: tuple) -> float:
    if len(dms) < 3:
        return 0.0
    d, m, s = dms[0], dms[1], dms[2]
    return float(d) + float(m) / 60 + float(s) / 3600


# ──────────────────────────────────────────────────────────────────────────────
# Directory scanning
# ──────────────────────────────────────────────────────────────────────────────

def _sidecar_candidates(base_name: str, base_ext: str) -> list[str]:
    """Return candidate sidecar filenames for a photo with given base name + ext."""
    return [
        base_name + base_ext + ".json",
        base_name + ".supplemental-metadata.json",
        # Truncated (Google truncates at 46 chars before the .json extension)
        base_name[:46] + ".json",
    ]


def scan_directory(takeout_dir: Path) -> Iterator[GeoPoint]:
    """Walk a directory, yielding GeoPoints from photos and their sidecars."""
    for root, _dirs, files in os.walk(takeout_dir):
        file_set = set(files)
        for fname in files:
            stem, ext = os.path.splitext(fname)
            if ext.lower() not in PHOTO_EXTENSIONS:
                continue
            photo_path = Path(root) / fname

            # Try sidecars
            found = False
            for candidate in _sidecar_candidates(stem, ext.lower()):
                if candidate in file_set:
                    result = _parse_sidecar_file(Path(root) / candidate)
                    if result:
                        lat, lon, ts = result
                        ref = SourceRef(archive=None, member=str(photo_path), path_hint=photo_path)
                        yield GeoPoint(lat=lat, lon=lon, ts=ts, ref=ref)
                        found = True
                        break

            if not found:
                # EXIF fallback
                try:
                    from PIL import Image
                    with Image.open(photo_path) as img:
                        gps = _exif_gps_from_pil(img)
                    if gps:
                        lat, lon = gps
                        ts = int(photo_path.stat().st_mtime)
                        ref = SourceRef(archive=None, member=str(photo_path), path_hint=photo_path)
                        yield GeoPoint(lat=lat, lon=lon, ts=ts, ref=ref)
                except Exception:
                    pass


# ──────────────────────────────────────────────────────────────────────────────
# Zip archive scanning (in-place, no media extraction)
# ──────────────────────────────────────────────────────────────────────────────

def scan_zip(archive_path: Path) -> Iterator[GeoPoint]:
    """Scan a .zip archive without extracting media files.

    Reads only .json sidecar members; records SourceRef for each photo.
    """
    try:
        zf = zipfile.ZipFile(archive_path, "r")
    except (zipfile.BadZipFile, OSError):
        print(f"  Warning: could not open {archive_path.name} as zip")
        return

    with zf:
        # Build an index of members by name (lower) for sidecar lookup
        members_by_name: dict[str, str] = {}  # lowered -> original
        for info in zf.infolist():
            members_by_name[info.filename.lower()] = info.filename

        for info in zf.infolist():
            name = info.filename
            lower = name.lower()
            stem, ext = os.path.splitext(lower)

            # Skip directories and non-photos
            if name.endswith("/") or ext not in PHOTO_EXTENSIONS:
                continue

            dir_part = name.rsplit("/", 1)[0] + "/" if "/" in name else ""
            base_stem = name.rsplit("/", 1)[-1]
            base_stem_noext = os.path.splitext(base_stem)[0]

            # Try to find a sidecar member
            found = False
            for candidate_name in _sidecar_candidates(base_stem_noext, ext):
                candidate_full = dir_part + candidate_name
                orig = members_by_name.get(candidate_full.lower())
                if orig:
                    try:
                        raw = zf.read(orig)
                        result = _parse_sidecar_bytes(raw)
                        if result:
                            lat, lon, ts = result
                            ref = SourceRef(archive=archive_path, member=name, path_hint=archive_path)
                            yield GeoPoint(lat=lat, lon=lon, ts=ts, ref=ref)
                            found = True
                            break
                    except KeyError:
                        pass

            if not found:
                # EXIF fallback: read just enough bytes (first 128KB) to get EXIF
                ext_lower = ext.lower()
                if ext_lower in {".jpg", ".jpeg"}:
                    try:
                        raw = zf.read(name)
                        gps = _read_exif_gps_bytes(raw[:131072] if len(raw) > 131072 else raw)
                        if gps:
                            lat, lon = gps
                            # Approximate ts from zip member date
                            dt = datetime(*info.date_time, tzinfo=timezone.utc)
                            ts = int(dt.timestamp())
                            ref = SourceRef(archive=archive_path, member=name, path_hint=archive_path)
                            yield GeoPoint(lat=lat, lon=lon, ts=ts, ref=ref)
                    except Exception:
                        pass


# ──────────────────────────────────────────────────────────────────────────────
# Tar/tgz archive scanning
# ──────────────────────────────────────────────────────────────────────────────

def scan_tar(archive_path: Path) -> Iterator[GeoPoint]:
    """Scan a .tgz/.tar.gz archive without extracting media."""
    try:
        tf = tarfile.open(archive_path, "r:*")
    except (tarfile.TarError, OSError):
        print(f"  Warning: could not open {archive_path.name} as tar")
        return

    with tf:
        # First pass: collect all member names and read all JSON sidecars into memory
        # (sidecars are tiny; media files can be GB — we skip their data)
        sidecar_data: dict[str, bytes] = {}  # member_name -> bytes
        photo_members: list[tarfile.TarInfo] = []

        for member in tf.getmembers():
            if member.isdir():
                continue
            name = member.name
            lower_name = name.lower()
            _, ext = os.path.splitext(lower_name)

            if lower_name.endswith(".json"):
                try:
                    f = tf.extractfile(member)
                    if f:
                        sidecar_data[name] = f.read()
                except (KeyError, tarfile.TarError):
                    pass
            elif ext in PHOTO_EXTENSIONS:
                photo_members.append(member)

        # Second pass: match photos to sidecars
        sidecar_by_lower = {k.lower(): (k, v) for k, v in sidecar_data.items()}

        for member in photo_members:
            name = member.name
            dir_part = name.rsplit("/", 1)[0] + "/" if "/" in name else ""
            base = name.rsplit("/", 1)[-1]
            stem, ext = os.path.splitext(base)
            ext_lower = ext.lower()

            found = False
            for candidate in _sidecar_candidates(stem, ext_lower):
                candidate_full = dir_part + candidate
                entry = sidecar_by_lower.get(candidate_full.lower())
                if entry:
                    _, raw = entry
                    result = _parse_sidecar_bytes(raw)
                    if result:
                        lat, lon, ts = result
                        ref = SourceRef(archive=archive_path, member=name, path_hint=archive_path)
                        yield GeoPoint(lat=lat, lon=lon, ts=ts, ref=ref)
                        found = True
                        break

            if not found and ext_lower in {".jpg", ".jpeg"}:
                # EXIF fallback: extract just this member's bytes
                try:
                    f = tf.extractfile(member)
                    if f:
                        raw = f.read(131072)
                        gps = _read_exif_gps_bytes(raw)
                        if gps:
                            lat, lon = gps
                            ts = int(member.mtime) if member.mtime else 0
                            if ts > 0:
                                ref = SourceRef(archive=archive_path, member=name, path_hint=archive_path)
                                yield GeoPoint(lat=lat, lon=lon, ts=ts, ref=ref)
                except Exception:
                    pass


# ──────────────────────────────────────────────────────────────────────────────
# Timeline parsing (standalone or within archives/dirs)
# ──────────────────────────────────────────────────────────────────────────────

def _parse_timeline_data(data: dict, synthetic_path: Path) -> Iterator[GeoPoint]:
    """Yield GeoPoints from a parsed Timeline.json dict."""
    ref = SourceRef(archive=None, member=str(synthetic_path), path_hint=synthetic_path)

    for seg in data.get("semanticSegments", []):
        visit = seg.get("visit") or {}
        loc = (
            visit.get("topCandidate", {}).get("placeLocation", {})
            or visit.get("placeLocation", {})
        )
        if loc:
            lat = float(loc.get("latE7", 0) or 0) / 1e7
            lon = float(loc.get("lngE7", 0) or 0) / 1e7
            if not _is_zero(lat, lon):
                ts = _parse_iso(seg.get("startTime") or "")
                if ts > 0:
                    yield GeoPoint(lat=lat, lon=lon, ts=ts, ref=ref)

        for sig in seg.get("rawSignals", []):
            pos = sig.get("position", {})
            if pos:
                lat = float(pos.get("LatLng", {}).get("latitude", 0) or pos.get("latE7", 0) or 0)
                lon = float(pos.get("LatLng", {}).get("longitude", 0) or pos.get("lngE7", 0) or 0)
                if abs(lat) > 90:
                    lat /= 1e7
                if abs(lon) > 180:
                    lon /= 1e7
                if not _is_zero(lat, lon):
                    ts = _parse_iso(sig.get("timestamp") or sig.get("time") or "")
                    if ts > 0:
                        yield GeoPoint(lat=lat, lon=lon, ts=ts, ref=ref)

    for pt in data.get("timelinePath", []):
        pt_str = pt.get("point", "")
        if pt_str.startswith("geo:"):
            try:
                lat_s, lon_s = pt_str[4:].split(",")
                lat, lon = float(lat_s), float(lon_s)
            except ValueError:
                continue
            if not _is_zero(lat, lon):
                ts = _parse_iso(pt.get("time") or "")
                if ts > 0:
                    yield GeoPoint(lat=lat, lon=lon, ts=ts, ref=ref)


def _parse_semantic_data(data: dict, synthetic_path: Path) -> Iterator[GeoPoint]:
    """Yield GeoPoints from a Semantic Location History dict."""
    ref = SourceRef(archive=None, member=str(synthetic_path), path_hint=synthetic_path)
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
            yield GeoPoint(lat=lat, lon=lon, ts=ts, ref=ref)


def scan_timeline_file(timeline_path: Path) -> Iterator[GeoPoint]:
    """Parse a single Timeline.json or Semantic Location History JSON."""
    try:
        with open(timeline_path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return
    # Try Timeline format first
    if "semanticSegments" in data or "timelinePath" in data or "rawSignals" in data:
        yield from _parse_timeline_data(data, timeline_path)
    # Try Semantic Location History format
    elif "timelineObjects" in data:
        yield from _parse_semantic_data(data, timeline_path)


def scan_timeline_in_dir(takeout_dir: Path) -> Iterator[GeoPoint]:
    """Find and parse all Timeline exports under a directory."""
    for candidate in [
        takeout_dir / "Timeline.json",
        takeout_dir / "Takeout" / "Maps" / "Timeline.json",
        takeout_dir / "Takeout" / "My Activity" / "Maps" / "Timeline.json",
    ]:
        if candidate.exists():
            yield from scan_timeline_file(candidate)

    for root, _dirs, files in os.walk(takeout_dir):
        if "Semantic Location History" not in root:
            continue
        for fname in files:
            if fname.endswith(".json"):
                yield from scan_timeline_file(Path(root) / fname)


def scan_timeline_in_zip(archive_path: Path) -> Iterator[GeoPoint]:
    """Find and parse Timeline JSON inside a zip archive."""
    try:
        zf = zipfile.ZipFile(archive_path, "r")
    except (zipfile.BadZipFile, OSError):
        return
    with zf:
        for info in zf.infolist():
            name = info.filename
            lower = name.lower()
            is_timeline = lower.endswith("timeline.json") or "semantic location history" in lower
            if is_timeline and lower.endswith(".json"):
                try:
                    raw = zf.read(name)
                    data = json.loads(raw.decode("utf-8", errors="replace"))
                    path_hint = archive_path
                    if "semanticSegments" in data or "timelinePath" in data:
                        yield from _parse_timeline_data(data, path_hint)
                    elif "timelineObjects" in data:
                        yield from _parse_semantic_data(data, path_hint)
                except Exception:
                    pass


# ──────────────────────────────────────────────────────────────────────────────
# Apple Photos (optional: requires osxphotos)
# ──────────────────────────────────────────────────────────────────────────────

def scan_apple_photos() -> Iterator[GeoPoint]:
    """Yield GeoPoints from the system Photos library if osxphotos is installed."""
    try:
        import osxphotos  # type: ignore[import]
    except ImportError:
        return
    try:
        db = osxphotos.PhotosDB()
        for photo in db.photos():
            if photo.location is None:
                continue
            lat, lon = photo.location
            if _is_zero(lat, lon):
                continue
            ts = int(photo.date.timestamp()) if photo.date else 0
            if ts == 0:
                continue
            path_str = str(photo.path) if photo.path else f"apple-photos:{photo.uuid}"
            ref = SourceRef(archive=None, member=path_str, path_hint=Path(path_str) if photo.path else Path("/"))
            yield GeoPoint(lat=lat, lon=lon, ts=ts, ref=ref)
    except Exception as e:
        print(f"  Warning: osxphotos failed: {e}")


# ──────────────────────────────────────────────────────────────────────────────
# Incremental state persistence
# ──────────────────────────────────────────────────────────────────────────────

def geopoints_to_json(points: list[GeoPoint]) -> list[dict]:
    """Serialize GeoPoints to a JSON-friendly list of dicts."""
    out = []
    for gp in points:
        out.append({
            "lat": gp.lat,
            "lon": gp.lon,
            "ts": gp.ts,
            "archive": str(gp.ref.archive) if gp.ref.archive else None,
            "member": gp.ref.member,
            "path_hint": str(gp.ref.path_hint),
        })
    return out


def geopoints_from_json(data: list[dict]) -> list[GeoPoint]:
    """Deserialize GeoPoints from JSON dicts."""
    out = []
    for d in data:
        archive = Path(d["archive"]) if d.get("archive") else None
        member = d["member"]
        path_hint = Path(d.get("path_hint", member))
        ref = SourceRef(archive=archive, member=member, path_hint=path_hint)
        out.append(GeoPoint(lat=d["lat"], lon=d["lon"], ts=d["ts"], ref=ref))
    return out


def load_state(state_path: Path) -> list[GeoPoint]:
    """Load accumulated GeoPoints from state.json."""
    if not state_path.exists():
        return []
    try:
        with open(state_path, encoding="utf-8") as f:
            data = json.load(f)
        return geopoints_from_json(data.get("points", []))
    except (json.JSONDecodeError, OSError, KeyError):
        return []


def save_state(state_path: Path, points: list[GeoPoint]) -> None:
    """Save accumulated GeoPoints to state.json."""
    state_path.parent.mkdir(parents=True, exist_ok=True)
    with open(state_path, "w", encoding="utf-8") as f:
        json.dump({"points": geopoints_to_json(points)}, f, indent=2)


# ──────────────────────────────────────────────────────────────────────────────
# Combined scan entry point
# ──────────────────────────────────────────────────────────────────────────────

def scan_source(source: Path) -> tuple[list[GeoPoint], list[GeoPoint]]:
    """Scan one source (file, dir, or archive) and return (photo_points, timeline_points)."""
    photos: list[GeoPoint] = []
    timeline: list[GeoPoint] = []

    if source.is_dir():
        photos.extend(scan_directory(source))
        timeline.extend(scan_timeline_in_dir(source))
    elif source.suffix.lower() == ".zip":
        photos.extend(scan_zip(source))
        timeline.extend(scan_timeline_in_zip(source))
    elif source.name.lower().endswith((".tgz", ".tar.gz")):
        photos.extend(scan_tar(source))
        # Timeline in tgz: scan tgz for timeline JSON
        timeline.extend(_scan_timeline_in_tar(source))
    elif source.suffix.lower() == ".json":
        # Standalone Timeline.json
        timeline.extend(scan_timeline_file(source))
    else:
        print(f"  Warning: unrecognized source type: {source}")

    return photos, timeline


def _scan_timeline_in_tar(archive_path: Path) -> Iterator[GeoPoint]:
    """Find and parse Timeline JSON inside a tar archive."""
    try:
        tf = tarfile.open(archive_path, "r:*")
    except (tarfile.TarError, OSError):
        return
    with tf:
        for member in tf.getmembers():
            name = member.name
            lower = name.lower()
            is_timeline = lower.endswith("timeline.json") or "semantic location history" in lower
            if is_timeline and lower.endswith(".json"):
                try:
                    f = tf.extractfile(member)
                    if f:
                        raw = f.read()
                        data = json.loads(raw.decode("utf-8", errors="replace"))
                        if "semanticSegments" in data or "timelinePath" in data:
                            yield from _parse_timeline_data(data, archive_path)
                        elif "timelineObjects" in data:
                            yield from _parse_semantic_data(data, archive_path)
                except Exception:
                    pass


def merge_points(existing: list[GeoPoint], new_photos: list[GeoPoint], new_timeline: list[GeoPoint]) -> list[GeoPoint]:
    """Merge new points into existing, deduplicating by (lat5, lon5, ts)."""
    seen: set[tuple[float, float, int]] = set()
    result: list[GeoPoint] = []
    for gp in existing:
        key = (round(gp.lat, 5), round(gp.lon, 5), gp.ts)
        if key not in seen:
            seen.add(key)
            result.append(gp)

    photo_count = 0
    timeline_count = 0
    for gp in new_photos:
        key = (round(gp.lat, 5), round(gp.lon, 5), gp.ts)
        if key not in seen:
            seen.add(key)
            result.append(gp)
            photo_count += 1
    for gp in new_timeline:
        key = (round(gp.lat, 5), round(gp.lon, 5), gp.ts)
        if key not in seen:
            seen.add(key)
            result.append(gp)
            timeline_count += 1

    print(f"  Added {photo_count} photo/video + {timeline_count} timeline points (new this run)")
    return result
