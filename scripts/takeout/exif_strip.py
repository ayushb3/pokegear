"""EXIF/GPS stripping and safe JPEG resizing via Pillow.

All output images:
  - Have no EXIF data (no GPS, no Exif IFD, no location metadata)
  - Are JPEG, quality 80
  - Are resized to at most max_long_edge px on the longest edge
  - Are at integer dimensions (no fractional rounding surprises)
"""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover
    raise ImportError("Pillow is required: pip install Pillow")


def resize_strip_save(
    src: Path,
    dest: Path,
    max_long_edge: int = 512,
    quality: int = 80,
) -> None:
    """Open src, strip ALL metadata, resize (if needed), save as JPEG to dest."""
    with Image.open(src) as img:
        # Apply EXIF orientation before stripping (so the image isn't rotated wrong)
        img = ImageOps.exif_transpose(img)
        # Convert to RGB (drops alpha, ensures JPEG-compatible)
        img = img.convert("RGB")
        # Resize if needed (maintain aspect, integer dimensions)
        w, h = img.size
        long_edge = max(w, h)
        if long_edge > max_long_edge:
            scale = max_long_edge / long_edge
            new_w = max(1, int(w * scale))
            new_h = max(1, int(h * scale))
            img = img.resize((new_w, new_h), Image.LANCZOS)
        # Save with no EXIF (do not pass exif= param → Pillow writes none)
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest, format="JPEG", quality=quality)


def has_gps_exif(path: Path) -> bool:
    """Return True if the image file has GPS EXIF data (IFD 0x8825)."""
    with Image.open(path) as img:
        exif = img.getexif()
        if not exif:
            return False
        # 0x8825 = GPSInfo IFD tag
        return 0x8825 in exif


def read_gps_from_exif(path: Path) -> tuple[float, float] | None:
    """Read GPS lat/lon from EXIF. Returns (lat, lon) or None."""
    with Image.open(path) as img:
        exif = img.getexif()
        if not exif:
            return None
        gps_ifd = exif.get_ifd(0x8825)
        if not gps_ifd:
            return None
        # GPS tag IDs: 1=LatRef, 2=Lat, 3=LonRef, 4=Lon
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
        return (lat, lon)


def _dms_to_decimal(dms: tuple) -> float:
    """Convert degrees/minutes/seconds tuple to decimal degrees."""
    if len(dms) < 3:
        return 0.0
    d, m, s = dms[0], dms[1], dms[2]
    # Each may be a float or a (numerator, denominator) IFDRational
    return float(d) + float(m) / 60 + float(s) / 3600
