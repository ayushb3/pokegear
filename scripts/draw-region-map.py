"""
Rasterises Natural Earth land polygons into a PNG for a bbox region, and
optionally emits country highlight masks for the Pokégear inset.

Usage (full size 256x192):
    python3 -I scripts/draw-region-map.py <ne_50m_land.geojson> <name> <lonW> <latS> <lonE> <latN>

Usage (custom size):
    python3 -I scripts/draw-region-map.py <ne_50m_land.geojson> <name> <lonW> <latS> <lonE> <latN> <W> <H>

Example (Europe full):
    python3 -I scripts/draw-region-map.py /path/to/ne_50m_land.geojson europe -15 25 30 72

Example (Europe small inset 112x84):
    python3 -I scripts/draw-region-map.py /path/to/ne_50m_land.geojson europe-sm -15 25 30 72 112 84

Highlight masks (called from gen-region-assets.py):
    Use render_highlight_mask(countries_geojson, iso_a3, bbox, out_path, w, h)

Output: public/assets/townmap/<name>.png  (HGSS palette, no anti-aliasing)

The bbox is padded to 4:3 aspect ratio (centred). Same palette as world.png.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

# ── Default image size (overridden by CLI args) ───────────────────────────────
DEFAULT_W, DEFAULT_H = 256, 192
W, H = DEFAULT_W, DEFAULT_H  # will be set in main()

# ── Colours (match world.png palette) ────────────────────────────────────────
OCEAN = (91, 143, 214)    # #5b8fd6
LAND  = (140, 192, 106)   # #8cc06a
COAST = (108, 160, 74)    # slightly darker green for coastline
BORDER = (90, 140, 60)    # faint darker outline for region borders

# Highlight: RGBA — yellow-tinted land overlay (semi-transparent)
HIGHLIGHT_FILL = (255, 230, 80, 180)    # warm yellow, α=180/255
HIGHLIGHT_OUTLINE = (200, 170, 40, 220) # darker gold outline


def pad_bbox_to_ratio(lon_w: float, lat_s: float, lon_e: float, lat_n: float,
                       target_ratio: float = DEFAULT_W / DEFAULT_H) -> tuple[float, float, float, float]:
    """Pad the bbox to match target_ratio (width/height in lon/lat degrees), centred."""
    lon_span = lon_e - lon_w
    lat_span = lat_n - lat_s
    if lon_span <= 0 or lat_span <= 0:
        return lon_w, lat_s, lon_e, lat_n

    current_ratio = lon_span / lat_span
    if current_ratio < target_ratio:
        # too tall: expand longitude
        new_lon_span = lat_span * target_ratio
        pad = (new_lon_span - lon_span) / 2
        lon_w -= pad
        lon_e += pad
    else:
        # too wide: expand latitude
        new_lat_span = lon_span / target_ratio
        pad = (new_lat_span - lat_span) / 2
        lat_s -= pad
        lat_n += pad

    return lon_w, lat_s, lon_e, lat_n


def lonlat_to_px(lon: float, lat: float,
                  lon_w: float, lat_s: float, lon_e: float, lat_n: float) -> tuple[int, int]:
    """Equirectangular: lon/lat -> native pixel (x, y) within the padded bbox."""
    x = (lon - lon_w) / (lon_e - lon_w) * W
    y = (lat_n - lat) / (lat_n - lat_s) * H
    return (int(round(x)), int(round(y)))


def render_map(geojson_path: Path, out_path: Path,
               lon_w: float, lat_s: float, lon_e: float, lat_n: float,
               w: int = DEFAULT_W, h: int = DEFAULT_H) -> None:
    # Pad bbox to 4:3
    target_ratio = w / h
    lon_w, lat_s, lon_e, lat_n = pad_bbox_to_ratio(lon_w, lat_s, lon_e, lat_n, target_ratio)

    with geojson_path.open() as f:
        data = json.load(f)

    img = Image.new("RGB", (w, h), OCEAN)
    draw = ImageDraw.Draw(img)

    def to_px(lon: float, lat: float) -> tuple[int, int]:
        x = (lon - lon_w) / (lon_e - lon_w) * w
        y = (lat_n - lat) / (lat_n - lat_s) * h
        return (int(round(x)), int(round(y)))

    for feature in data["features"]:
        geom = feature["geometry"]
        polys = (
            [geom["coordinates"]]
            if geom["type"] == "Polygon"
            else geom["coordinates"]
        )
        for poly in polys:
            ring = poly[0]
            pts = [to_px(c[0], c[1]) for c in ring]
            if len(pts) >= 3:
                draw.polygon(pts, fill=LAND, outline=COAST)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    print(f"Saved {out_path}  ({w}x{h})")


def render_highlight_mask(
    countries_geojson: dict,
    iso_a3: str,
    lon_w: float, lat_s: float, lon_e: float, lat_n: float,
    out_path: Path,
    w: int = 64,
    h: int = 48,
) -> bool:
    """
    Emit a transparent RGBA PNG of the given ISO 3166-1 alpha-3 country's shape,
    clipped to [lon_w, lat_s, lon_e, lat_n], at size w×h.

    Matches on ADM0_A3 (works for France which has ISO_A3=-99).
    Returns True if any polygon was drawn, False if no match found.
    """
    # Pad the bbox to w/h ratio (same logic as the inset map)
    target_ratio = w / h
    lon_w, lat_s, lon_e, lat_n = pad_bbox_to_ratio(lon_w, lat_s, lon_e, lat_n, target_ratio)

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def to_px(lon: float, lat: float) -> tuple[int, int]:
        x = (lon - lon_w) / (lon_e - lon_w) * w
        y = (lat_n - lat) / (lat_n - lat_s) * h
        return (int(round(x)), int(round(y)))

    drawn = False
    for feature in countries_geojson["features"]:
        props = feature["properties"]
        # Use ADM0_A3 as primary key (handles France, where ISO_A3=-99)
        adm0 = props.get("ADM0_A3", "")
        iso   = props.get("ISO_A3", "")
        if adm0 != iso_a3 and iso != iso_a3:
            continue
        geom = feature["geometry"]
        polys = (
            [geom["coordinates"]]
            if geom["type"] == "Polygon"
            else geom["coordinates"]
        )
        for poly in polys:
            ring = poly[0]
            pts = [to_px(c[0], c[1]) for c in ring]
            if len(pts) >= 3:
                draw.polygon(pts, fill=HIGHLIGHT_FILL, outline=HIGHLIGHT_OUTLINE)
                drawn = True

    if drawn:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(out_path)
        print(f"Saved highlight mask {out_path}  ({w}x{h})")
    else:
        print(f"WARNING: no shape found for ISO {iso_a3}, skipping {out_path}")

    return drawn


def main() -> None:
    if len(sys.argv) not in (7, 9):
        sys.exit(
            "Usage: python3 -I scripts/draw-region-map.py "
            "<ne_50m_land.geojson> <name> <lonW> <latS> <lonE> <latN> [<W> <H>]"
        )

    geojson_path = Path(sys.argv[1])
    if not geojson_path.exists():
        sys.exit(f"GeoJSON not found: {geojson_path}")

    name = sys.argv[2]
    try:
        lon_w = float(sys.argv[3])
        lat_s = float(sys.argv[4])
        lon_e = float(sys.argv[5])
        lat_n = float(sys.argv[6])
        w = int(sys.argv[7]) if len(sys.argv) == 9 else DEFAULT_W
        h = int(sys.argv[8]) if len(sys.argv) == 9 else DEFAULT_H
    except ValueError:
        sys.exit("Bounding box must be four floats: lonW latS lonE latN; optional W H are ints")

    out = Path(__file__).parent.parent / "public" / "assets" / "townmap" / f"{name}.png"
    render_map(geojson_path, out, lon_w, lat_s, lon_e, lat_n, w, h)


if __name__ == "__main__":
    main()
