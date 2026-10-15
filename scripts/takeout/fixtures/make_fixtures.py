#!/usr/bin/env python3
"""Generate test fixtures: tiny JPEGs, sidecar JSONs, Timeline.json, fake NE GeoJSON.

Run once to regenerate fixtures:
  python3 scripts/takeout/fixtures/make_fixtures.py

All fixtures are committed to the repo. Tiny files only (8x8 px JPEGs, minimal GeoJSON).
Coordinates are approximate city centres from public knowledge, not personal data.
"""
from __future__ import annotations

import io
import json
import os
import zipfile
from pathlib import Path

try:
    from PIL import Image
    _PIL_OK = True
except ImportError:
    _PIL_OK = False

FIXTURES = Path(__file__).resolve().parent

# Test locations (approximate city centres, public knowledge)
LOCATIONS = {
    "paris":     {"lat": 48.85,   "lon":   2.35,  "country": "France", "city": "Paris",
                  "adm1": "Ile-de-France"},
    "barcelona": {"lat": 41.38,   "lon":   2.17,  "country": "Spain",  "city": "Barcelona",
                  "adm1": "Catalonia"},
    "tokyo":     {"lat": 35.68,   "lon": 139.69,  "country": "Japan",  "city": "Tokyo",
                  "adm1": "Tokyo"},
    # Illinois fixture point — for exclusion tests
    "chicago":   {"lat": 41.83,   "lon": -87.75,  "country": "United States of America",
                  "city": "Chicago", "adm1": "Illinois"},
}


def _make_jpeg_bytes(color=(200, 180, 160)) -> bytes:
    """Create a minimal 8x8 JPEG in memory."""
    if _PIL_OK:
        img = Image.new("RGB", (8, 8), color)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return buf.getvalue()
    # Minimal valid JPEG without Pillow
    return _minimal_jpeg_bytes()


def _minimal_jpeg_bytes() -> bytes:
    """A pre-computed minimal valid 8x8 grayscale JPEG."""
    return bytes([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
        0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
        0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
        0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x08,
        0x00, 0x08, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
        0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
        0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
        0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
        0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
        0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
        0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
        0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
        0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
        0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
        0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
        0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
        0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
        0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
        0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
        0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
        0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
        0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD4, 0xFF, 0xD9,
    ])


def make_ne_fixture():
    """Create fixtures/ne/ with fake Natural Earth GeoJSON."""
    ne_dir = FIXTURES / "ne"
    ne_dir.mkdir(exist_ok=True)

    countries_data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"ADMIN": "France", "NAME": "France", "ISO_A2": "FR"},
                "geometry": {
                    "type": "Polygon",
                    # lat range 42.5-51.5 so Barcelona (41.38N) is below France's south border
                    "coordinates": [[[-5.0, 42.5], [10.0, 42.5], [10.0, 51.5], [-5.0, 51.5], [-5.0, 42.5]]],
                },
            },
            {
                "type": "Feature",
                "properties": {"ADMIN": "Spain", "NAME": "Spain", "ISO_A2": "ES"},
                "geometry": {
                    "type": "Polygon",
                    # lon 3.5 covers Barcelona (2.17E); lat 43.8 covers Barcelona (41.38N)
                    "coordinates": [[[-9.5, 35.5], [3.5, 35.5], [3.5, 43.8], [-9.5, 43.8], [-9.5, 35.5]]],
                },
            },
            {
                "type": "Feature",
                "properties": {"ADMIN": "Japan", "NAME": "Japan", "ISO_A2": "JP"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[129.0, 30.0], [146.0, 30.0], [146.0, 46.0], [129.0, 46.0], [129.0, 30.0]]],
                },
            },
            {
                "type": "Feature",
                "properties": {"ADMIN": "United States of America", "NAME": "United States", "ISO_A2": "US"},
                "geometry": {
                    "type": "Polygon",
                    # Simplified bounding box covering Chicago (41.83N, -87.75W)
                    "coordinates": [[[-125.0, 24.0], [-66.0, 24.0], [-66.0, 50.0], [-125.0, 50.0], [-125.0, 24.0]]],
                },
            },
        ],
    }
    cities_data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "name": "Paris", "adm0name": "France", "adm1name": "Ile-de-France",
                    "iso_a2": "FR", "adm0_a3": "FRA",
                },
                "geometry": {"type": "Point", "coordinates": [2.3522, 48.8566]},
            },
            {
                "type": "Feature",
                "properties": {
                    "name": "Barcelona", "adm0name": "Spain", "adm1name": "Catalonia",
                    "iso_a2": "ES", "adm0_a3": "ESP",
                },
                "geometry": {"type": "Point", "coordinates": [2.1734, 41.3851]},
            },
            {
                "type": "Feature",
                "properties": {
                    "name": "Tokyo", "adm0name": "Japan", "adm1name": "Tokyo",
                    "iso_a2": "JP", "adm0_a3": "JPN",
                },
                "geometry": {"type": "Point", "coordinates": [139.6917, 35.6895]},
            },
            {
                "type": "Feature",
                "properties": {
                    "name": "Chicago", "adm0name": "United States of America", "adm1name": "Illinois",
                    "iso_a2": "US", "adm0_a3": "USA",
                },
                "geometry": {"type": "Point", "coordinates": [-87.7520, 41.8319]},
            },
        ],
    }

    with open(ne_dir / "ne_50m_admin_0_countries.geojson", "w", encoding="utf-8") as f:
        json.dump(countries_data, f, indent=2)
    with open(ne_dir / "ne_10m_populated_places_simple.geojson", "w", encoding="utf-8") as f:
        json.dump(cities_data, f, indent=2)
    print(f"Created {ne_dir}/")


def make_photo_dir_fixture():
    """Create fixtures/takeout_dir/ with photos + sidecars for Paris/Barcelona/Tokyo."""
    photos_base = FIXTURES / "takeout_dir" / "Takeout" / "Google Photos" / "Photos from 2024"
    photos_base.mkdir(parents=True, exist_ok=True)

    entries = [
        ("paris_1.jpg",     1704067200, LOCATIONS["paris"]),      # 2024-01-01
        ("paris_2.jpg",     1704153600, LOCATIONS["paris"]),      # 2024-01-02
        ("barcelona_1.jpg", 1706745600, LOCATIONS["barcelona"]),  # 2024-02-01
        ("barcelona_2.jpg", 1706749200, LOCATIONS["barcelona"]),  # 2024-02-01 +1h
        ("tokyo_1.jpg",     1709251200, LOCATIONS["tokyo"]),      # 2024-03-01
        ("tokyo_2.jpg",     1709337600, LOCATIONS["tokyo"]),      # 2024-03-02
    ]

    for fname, ts, loc in entries:
        (photos_base / fname).write_bytes(_make_jpeg_bytes())
        sidecar = {
            "title": fname,
            "photoTakenTime": {"timestamp": str(ts), "formatted": ""},
            "geoData": {
                "latitude": loc["lat"], "longitude": loc["lon"],
                "altitude": 0.0, "latitudeSpan": 0.0, "longitudeSpan": 0.0,
            },
            "geoDataExif": {
                "latitude": 0.0, "longitude": 0.0,
                "altitude": 0.0, "latitudeSpan": 0.0, "longitudeSpan": 0.0,
            },
        }
        with open(photos_base / (fname + ".json"), "w", encoding="utf-8") as f:
            json.dump(sidecar, f, indent=2)

    print(f"Created {FIXTURES / 'takeout_dir'}/")


def make_timeline_fixture():
    """Create fixtures/Timeline.json with semantic segments for all 3 cities."""
    tl = {
        "semanticSegments": [
            {
                "startTime": "2024-01-01T10:00:00Z",
                "endTime": "2024-01-01T12:00:00Z",
                "visit": {
                    "topCandidate": {
                        "placeLocation": {
                            "latE7": int(LOCATIONS["paris"]["lat"] * 1e7),
                            "lngE7": int(LOCATIONS["paris"]["lon"] * 1e7),
                        }
                    }
                },
            },
            {
                "startTime": "2024-02-01T10:00:00Z",
                "endTime": "2024-02-01T14:00:00Z",
                "visit": {
                    "topCandidate": {
                        "placeLocation": {
                            "latE7": int(LOCATIONS["barcelona"]["lat"] * 1e7),
                            "lngE7": int(LOCATIONS["barcelona"]["lon"] * 1e7),
                        }
                    }
                },
            },
            {
                "startTime": "2024-03-01T10:00:00Z",
                "endTime": "2024-03-01T16:00:00Z",
                "visit": {
                    "topCandidate": {
                        "placeLocation": {
                            "latE7": int(LOCATIONS["tokyo"]["lat"] * 1e7),
                            "lngE7": int(LOCATIONS["tokyo"]["lon"] * 1e7),
                        }
                    }
                },
            },
        ]
    }
    out = FIXTURES / "Timeline.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(tl, f, indent=2)
    print(f"Created {out}")


def make_trips_timeline_fixture():
    """Create fixtures/Timeline_trips.json for trips.py testing.

    Contains:
    - A dense Paris cluster (2024-06-10 to 2024-06-15, 6 days) → trip to Paris
    - A dense Tokyo cluster (2024-08-01 to 2024-08-05, 5 days) → trip to Tokyo
    - A Paris visit far from the first (2024-11-20, 1 day) → separate trip
    - Dense "home" Barcelona visits: 2024-01 to 2024-12 one day per week → flagged as home
    """
    segments = []

    # Home city: Barcelona — many days throughout 2024 (1 per week = ~52 days → flagged)
    from datetime import datetime, timedelta
    home_start = datetime(2024, 1, 7)
    for i in range(50):
        d = home_start + timedelta(weeks=i)
        segments.append({
            "startTime": d.strftime("%Y-%m-%dT08:00:00Z"),
            "endTime": d.strftime("%Y-%m-%dT22:00:00Z"),
            "visit": {
                "topCandidate": {
                    "placeLocation": {
                        "latE7": int(LOCATIONS["barcelona"]["lat"] * 1e7),
                        "lngE7": int(LOCATIONS["barcelona"]["lon"] * 1e7),
                    }
                }
            },
        })

    # Trip 1: Paris, June 10–15
    for i in range(6):
        d = datetime(2024, 6, 10) + timedelta(days=i)
        segments.append({
            "startTime": d.strftime("%Y-%m-%dT09:00:00Z"),
            "endTime": d.strftime("%Y-%m-%dT20:00:00Z"),
            "visit": {
                "topCandidate": {
                    "placeLocation": {
                        "latE7": int(LOCATIONS["paris"]["lat"] * 1e7),
                        "lngE7": int(LOCATIONS["paris"]["lon"] * 1e7),
                    }
                }
            },
        })

    # Trip 2: Tokyo, Aug 1–5
    for i in range(5):
        d = datetime(2024, 8, 1) + timedelta(days=i)
        segments.append({
            "startTime": d.strftime("%Y-%m-%dT09:00:00Z"),
            "endTime": d.strftime("%Y-%m-%dT20:00:00Z"),
            "visit": {
                "topCandidate": {
                    "placeLocation": {
                        "latE7": int(LOCATIONS["tokyo"]["lat"] * 1e7),
                        "lngE7": int(LOCATIONS["tokyo"]["lon"] * 1e7),
                    }
                }
            },
        })

    # Trip 3: Paris again, Nov 20 (separate trip because gap > 2 days from June)
    segments.append({
        "startTime": "2024-11-20T10:00:00Z",
        "endTime": "2024-11-20T22:00:00Z",
        "visit": {
            "topCandidate": {
                "placeLocation": {
                    "latE7": int(LOCATIONS["paris"]["lat"] * 1e7),
                    "lngE7": int(LOCATIONS["paris"]["lon"] * 1e7),
                }
            }
        },
    })

    # Illinois point: Chicago on Dec 10 — should be excluded when Illinois is in excludes
    segments.append({
        "startTime": "2024-12-10T10:00:00Z",
        "endTime": "2024-12-10T22:00:00Z",
        "visit": {
            "topCandidate": {
                "placeLocation": {
                    "latE7": int(LOCATIONS["chicago"]["lat"] * 1e7),
                    "lngE7": int(LOCATIONS["chicago"]["lon"] * 1e7),
                }
            }
        },
    })

    tl = {"semanticSegments": segments}
    out = FIXTURES / "Timeline_trips.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(tl, f, indent=2)
    print(f"Created {out}")


def make_semantic_history_fixture():
    """Create fixtures/takeout_slh/ for older Semantic Location History format."""
    slh_dir = FIXTURES / "takeout_slh" / "Takeout" / "Location History" / "Semantic Location History" / "2024"
    slh_dir.mkdir(parents=True, exist_ok=True)
    data = {
        "timelineObjects": [
            {
                "placeVisit": {
                    "location": {
                        "latitudeE7": int(LOCATIONS["paris"]["lat"] * 1e7),
                        "longitudeE7": int(LOCATIONS["paris"]["lon"] * 1e7),
                        "name": "Paris",
                    },
                    "duration": {
                        "startTimestamp": "2024-01-05T10:00:00.000Z",
                        "endTimestamp": "2024-01-05T18:00:00.000Z",
                    },
                }
            }
        ]
    }
    out = slh_dir / "2024_JANUARY.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Created {out}")


def make_zip_fixture():
    """Create fixtures/takeout.zip with photos + sidecars + Timeline.json inside."""
    out = FIXTURES / "takeout.zip"
    entries = [
        ("paris_1.jpg",  1704067200, LOCATIONS["paris"]),
        ("tokyo_1.jpg",  1709251200, LOCATIONS["tokyo"]),
    ]
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname, ts, loc in entries:
            zf.writestr(f"Takeout/Google Photos/{fname}", _make_jpeg_bytes())
            sidecar = {
                "photoTakenTime": {"timestamp": str(ts), "formatted": ""},
                "geoData": {
                    "latitude": loc["lat"], "longitude": loc["lon"],
                    "altitude": 0.0, "latitudeSpan": 0.0, "longitudeSpan": 0.0,
                },
                "geoDataExif": {
                    "latitude": 0.0, "longitude": 0.0,
                    "altitude": 0.0, "latitudeSpan": 0.0, "longitudeSpan": 0.0,
                },
            }
            zf.writestr(f"Takeout/Google Photos/{fname}.json", json.dumps(sidecar))

        # Barcelona via Timeline inside the zip
        tl = {
            "semanticSegments": [{
                "startTime": "2024-02-01T10:00:00Z",
                "endTime": "2024-02-01T14:00:00Z",
                "visit": {
                    "topCandidate": {
                        "placeLocation": {
                            "latE7": int(LOCATIONS["barcelona"]["lat"] * 1e7),
                            "lngE7": int(LOCATIONS["barcelona"]["lon"] * 1e7),
                        }
                    }
                },
            }]
        }
        zf.writestr("Takeout/Maps/Timeline.json", json.dumps(tl))
    print(f"Created {out}")


if __name__ == "__main__":
    make_ne_fixture()
    make_photo_dir_fixture()
    make_timeline_fixture()
    make_trips_timeline_fixture()
    make_semantic_history_fixture()
    make_zip_fixture()
    print("\nAll fixtures generated.")
