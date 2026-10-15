"""
Rasterises Natural Earth land polygons into a 256x192 PNG for the Town Map overlay.

Usage:
    python3 -I scripts/draw-world-map.py <path-to-ne_110m_land.geojson>

Output: public/assets/townmap/world.png  (256 × 192, HGSS-style flat colours, no anti-aliasing)

Projection: equirectangular  lon -180..180  lat 85..-60  (intentionally cuts deep
Antarctica to fill the screen with interesting land).

The same projection maths are exported as constants that the TS module mirrors:
    LON_MIN, LON_MAX, LAT_MAX, LAT_MIN, W, H
so the pin positions computed in TypeScript stay in sync.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

# ── Projection ───────────────────────────────────────────────────────────────
W, H = 256, 192
LON_MIN, LON_MAX = -180.0, 180.0
LAT_MAX, LAT_MIN = 85.0, -60.0  # lat runs top-to-bottom


def lonlat_to_px(lon: float, lat: float) -> tuple[int, int]:
    """Equirectangular: lon/lat -> native pixel (x, y), clamped to image bounds."""
    x = (lon - LON_MIN) / (LON_MAX - LON_MIN) * W
    y = (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * H
    return (int(round(x)), int(round(y)))


# ── Colours (HGSS palette) ────────────────────────────────────────────────────
OCEAN = (91, 143, 214)   # #5b8fd6
LAND  = (140, 192, 106)  # #8cc06a
COAST = (108, 160, 74)   # slightly darker green for 1-px coastline

# ── Main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 -I scripts/draw-world-map.py <ne_110m_land.geojson>")

    geojson_path = Path(sys.argv[1])
    if not geojson_path.exists():
        sys.exit(f"GeoJSON not found: {geojson_path}")

    with geojson_path.open() as f:
        data = json.load(f)

    img = Image.new("RGB", (W, H), OCEAN)
    draw = ImageDraw.Draw(img)

    for feature in data["features"]:
        geom = feature["geometry"]
        polys = (
            [geom["coordinates"]]
            if geom["type"] == "Polygon"
            else geom["coordinates"]
        )
        for poly in polys:
            # outer ring only (islands don't need hole-punching at this resolution)
            ring = poly[0]
            pts = [lonlat_to_px(c[0], c[1]) for c in ring]
            if len(pts) >= 3:
                draw.polygon(pts, fill=LAND, outline=COAST)

    out = Path(__file__).parent.parent / "public" / "assets" / "townmap" / "world.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f"Saved {out}  ({W}x{H})")


if __name__ == "__main__":
    main()
