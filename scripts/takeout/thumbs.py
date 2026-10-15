"""Extract and write thumbnail candidates for the review page.

For each city visit, pick up to MAX_THUMBS candidate photos,
extract the raw bytes (from archive or filesystem), resize + strip EXIF,
and write into review_dir/thumbs/<city_id>-<n>.jpg.

Also keeps a 512px "approved" copy in review_dir/approved_512/<ref_id>.jpg
so apply.py can use it if the original archive was deleted.

Security notes:
  - Archive members are size-capped at MAX_MEMBER_BYTES before being read
    into memory (guards against zip-bombs and huge media files).
  - tarfile members are checked with getmember() / isfile() before extraction
    to reject symlinks, devices, and path-traversal entries.
  - HEIC is supported when pillow-heif is installed; otherwise HEIC files are
    counted and skipped with a single warning (no crash).
"""
from __future__ import annotations

import hashlib
import io
import os
import zipfile
import tarfile
from pathlib import Path
from typing import NamedTuple

from .parse import SourceRef, GeoPoint
from .apply import resize_strip_image  # shared, tested, no EXIF/ICC/XMP

try:
    from PIL import Image, ImageOps
    _PIL_OK = True
except ImportError:
    _PIL_OK = False

# Register pillow-heif if installed (enables HEIC/HEIF reading via Pillow)
_HEIC_REGISTERED = False
try:
    import pillow_heif  # type: ignore[import-untyped]
    pillow_heif.register_heif_opener()
    _HEIC_REGISTERED = True
except ImportError:
    pass

MAX_THUMBS = 6
THUMB_MAX_EDGE = 256    # thumbnail size (review page)
APPROVED_MAX_EDGE = 512  # kept copy for apply.py fallback
QUALITY = 80

# Hard cap on raw bytes read from any single archive member.
# 50 MB is generous for a camera JPEG/HEIC; anything larger is suspicious.
MAX_MEMBER_BYTES = 50 * 1024 * 1024

PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff"}
HEIC_EXTENSIONS  = {".heic", ".heif"}


class ThumbEntry(NamedTuple):
    thumb_path: Path         # review_dir/thumbs/…jpg
    approved_path: Path      # review_dir/approved_512/…jpg  (kept for apply.py fallback)
    ref_id: str              # stable id derived from (archive, member)


def _ref_id(ref: SourceRef) -> str:
    """Stable short ID for a SourceRef, safe as a filename."""
    raw = f"{ref.archive}|{ref.member}"
    return hashlib.sha1(raw.encode()).hexdigest()[:16]


def _read_bytes(ref: SourceRef) -> bytes | None:
    """Read raw image bytes from a SourceRef (archive or filesystem).

    Size-caps all reads at MAX_MEMBER_BYTES. For tarfiles, validates
    that the member is a regular file before extraction.
    """
    try:
        if ref.archive:
            arch = ref.archive
            member = ref.member
            lower = str(arch).lower()
            if lower.endswith(".zip"):
                with zipfile.ZipFile(arch, "r") as zf:
                    info = zf.getinfo(member)
                    if info.file_size > MAX_MEMBER_BYTES:
                        return None
                    return zf.read(member)
            elif lower.endswith((".tgz", ".tar.gz")):
                with tarfile.open(arch, "r:*") as tf:
                    try:
                        ti = tf.getmember(member)
                    except KeyError:
                        return None
                    # Reject non-regular files (symlinks, devices, directories)
                    if not ti.isfile():
                        return None
                    if ti.size > MAX_MEMBER_BYTES:
                        return None
                    f = tf.extractfile(ti)
                    return f.read() if f else None
        else:
            p = Path(ref.member)
            if p.exists() and p.is_file():
                if p.stat().st_size > MAX_MEMBER_BYTES:
                    return None
                return p.read_bytes()
    except Exception:
        pass
    return None


def _resize_strip_thumb(raw: bytes, max_long_edge: int) -> bytes | None:
    """Resize image bytes to max_long_edge, strip EXIF, return JPEG bytes."""
    # Delegate to shared function for the public-facing 512px output
    if max_long_edge == APPROVED_MAX_EDGE:
        return resize_strip_image(raw)
    # For thumbnails, replicate the same logic at the smaller size
    if not _PIL_OK:
        return None
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img = ImageOps.exif_transpose(img)
            img = img.convert("RGB")
            w, h = img.size
            long_edge = max(w, h)
            if long_edge > max_long_edge:
                scale = max_long_edge / long_edge
                img = img.resize(
                    (max(1, int(w * scale)), max(1, int(h * scale))),
                    Image.LANCZOS,
                )
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=QUALITY, optimize=True)
            return buf.getvalue()
    except Exception:
        return None


def extract_thumbs(
    city_id: str,
    refs: list[SourceRef],
    review_dir: Path,
) -> list[ThumbEntry]:
    """
    For a city, extract up to MAX_THUMBS thumbnails from the given SourceRefs.

    Writes:
      review_dir/thumbs/<city_id>-<n>.jpg   (THUMB_MAX_EDGE px)
      review_dir/approved_512/<ref_id>.jpg  (APPROVED_MAX_EDGE px, for apply.py fallback)

    Returns a list of ThumbEntry for the review page.
    """
    if not _PIL_OK:
        print("  Warning: Pillow not available, skipping thumbnail extraction")
        return []

    thumbs_dir = review_dir / "thumbs"
    approved_dir = review_dir / "approved_512"
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    approved_dir.mkdir(parents=True, exist_ok=True)

    results: list[ThumbEntry] = []
    image_refs = [r for r in refs if _is_image_ref(r)]
    candidates = image_refs[:MAX_THUMBS]

    heic_skipped = 0
    for n, ref in enumerate(candidates, 1):
        # Warn once about HEIC if pillow-heif isn't installed
        member_lower = ref.member.lower()
        ext = os.path.splitext(member_lower)[1]
        if ext in HEIC_EXTENSIONS and not _HEIC_REGISTERED:
            heic_skipped += 1
            continue

        raw = _read_bytes(ref)
        if not raw:
            continue

        rid = _ref_id(ref)
        thumb_dest = thumbs_dir / f"{city_id}-{n}.jpg"
        approved_dest = approved_dir / f"{rid}.jpg"

        thumb_bytes = _resize_strip_thumb(raw, THUMB_MAX_EDGE)
        if not thumb_bytes:
            continue

        thumb_dest.write_bytes(thumb_bytes)

        if not approved_dest.exists():
            approved_bytes = _resize_strip_thumb(raw, APPROVED_MAX_EDGE)
            if approved_bytes:
                approved_dest.write_bytes(approved_bytes)

        results.append(ThumbEntry(
            thumb_path=thumb_dest,
            approved_path=approved_dest,
            ref_id=rid,
        ))

    if heic_skipped:
        print(
            f"  Note: {heic_skipped} HEIC/HEIF file(s) skipped — "
            "install pillow-heif to enable: pip install pillow-heif"
        )

    return results


def _is_image_ref(ref: SourceRef) -> bool:
    """Return True if the ref points to an image file (not a timeline JSON)."""
    member = ref.member.lower()
    ext = os.path.splitext(member)[1]
    return ext in PHOTO_EXTENSIONS


def read_approved_photo(ref: SourceRef, approved_512_dir: Path) -> bytes | None:
    """
    Return image bytes for apply.py: try the original source first,
    fall back to the 512px approved copy in review_dir/approved_512/.
    """
    raw = _read_bytes(ref)
    if raw:
        return raw
    rid = _ref_id(ref)
    fallback = approved_512_dir / f"{rid}.jpg"
    if fallback.exists():
        return fallback.read_bytes()
    return None
