"""
Generate country-highlight mask PNGs for all region places that have an `iso` field.

Usage:
    python3 -I scripts/gen-region-assets.py <ne_50m_admin_0_countries.geojson>

Downloads/prerequisites:
    curl -L https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson -o /tmp/ne_admin0.geojson

For each place in src/content/places.json that belongs to a region AND has an `iso` field,
emits:
    public/assets/townmap/<regionId>-inset.hl.<placeId>.png   (64 × 48 RGBA highlight mask)

The highlight mask is a transparent PNG with the country's shape filled in semi-transparent
yellow, aligned to the region's padded bbox (same projection as the inset map).
"""
import json
import sys
from pathlib import Path

# Import render_highlight_mask from the sibling module.
# Must be run as   python3 -I scripts/gen-region-assets.py  (the -I flag stops Python from
# importing from cwd, which is important for security; it does NOT prevent importing from
# the same directory via a relative sys.path manipuation below).
SCRIPT_DIR = Path(__file__).parent
# draw-region-map.py has a dash in its name; import via importlib.util
import importlib.util as _ilu
_spec = _ilu.spec_from_file_location("draw_region_map", SCRIPT_DIR / "draw-region-map.py")
_mod = _ilu.module_from_spec(_spec)  # type: ignore[arg-type]
_spec.loader.exec_module(_mod)  # type: ignore[union-attr]
render_highlight_mask = _mod.render_highlight_mask

INSET_W = 72
INSET_H = 54


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(
            "Usage: python3 -I scripts/gen-region-assets.py "
            "<ne_50m_admin_0_countries.geojson>"
        )

    geojson_path = Path(sys.argv[1])
    if not geojson_path.exists():
        sys.exit(f"GeoJSON not found: {geojson_path}")

    with geojson_path.open() as f:
        countries = json.load(f)

    repo_root = SCRIPT_DIR.parent
    places_json = repo_root / "src" / "content" / "places.json"
    with places_json.open() as f:
        data = json.load(f)

    regions = {r["id"]: r for r in data.get("regions", [])}
    places = data.get("places", [])

    generated: list[str] = []
    missing_iso: list[str] = []

    for place in places:
        region_id = place.get("region")
        iso = place.get("iso")
        if not region_id:
            continue  # standalone place; no region inset to highlight
        if not iso:
            missing_iso.append(place["id"])
            continue  # Hawaii / Alaska intentionally omitted
        region = regions.get(region_id)
        if not region:
            print(f"WARNING: unknown region '{region_id}' for place '{place['id']}'")
            continue

        lon_w, lat_s, lon_e, lat_n = region["bbox"]
        out_path = (
            repo_root / "public" / "assets" / "townmap" /
            f"{region_id}-inset.hl.{place['id']}.png"
        )
        ok = render_highlight_mask(
            countries, iso,
            lon_w, lat_s, lon_e, lat_n,
            out_path, INSET_W, INSET_H,
        )
        if ok:
            generated.append(place["id"])

    print()
    print(f"Generated {len(generated)} highlight masks: {generated}")
    if missing_iso:
        print(f"Skipped (no iso field): {missing_iso}")


if __name__ == "__main__":
    main()
