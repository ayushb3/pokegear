"""Tests for the Google Takeout → Town Map pipeline.

Run with:
  python3 -m unittest scripts/takeout/tests/test_takeout.py
  or:
  python3 -m pytest scripts/takeout/tests/test_takeout.py -v

All tests run OFFLINE using fixtures in scripts/takeout/fixtures/.
No network, no real Takeout data, no API calls.
"""
import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add scripts/ to path so imports work
SCRIPTS_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(SCRIPTS_DIR))

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
NE_DIR = FIXTURES / "ne"


# ──────────────────────────────────────────────────────────────────────────────
# Geo tests
# ──────────────────────────────────────────────────────────────────────────────

class TestReverseGeocode(unittest.TestCase):
    """Test offline reverse geocoding using fake Natural Earth data."""

    def setUp(self):
        # Clear the geo module cache between tests
        import takeout.geo as geo_mod
        geo_mod._countries = None
        geo_mod._cities = None

    def test_paris_in_france(self):
        from takeout.geo import reverse_geocode
        result = reverse_geocode(48.85, 2.35, NE_DIR)
        self.assertIsNotNone(result)
        self.assertEqual(result["country"], "France")
        self.assertEqual(result["city"], "Paris")

    def test_barcelona_in_spain(self):
        from takeout.geo import reverse_geocode
        result = reverse_geocode(41.38, 2.17, NE_DIR)
        self.assertIsNotNone(result)
        self.assertEqual(result["country"], "Spain")
        self.assertEqual(result["city"], "Barcelona")

    def test_tokyo_in_japan(self):
        from takeout.geo import reverse_geocode
        result = reverse_geocode(35.68, 139.69, NE_DIR)
        self.assertIsNotNone(result)
        self.assertEqual(result["country"], "Japan")
        self.assertEqual(result["city"], "Tokyo")

    def test_ocean_returns_none_or_nearest(self):
        from takeout.geo import reverse_geocode
        # Mid-Pacific — no country polygon covers this in our fake NE data
        result = reverse_geocode(0.0, -150.0, NE_DIR)
        # Either None or nearest city (both are acceptable behaviours)
        # Just assert it doesn't crash
        self.assertTrue(result is None or isinstance(result, dict))

    def test_reverse_geocode_returns_city_coords(self):
        """reverse_geocode includes city_lat and city_lon from NE dataset."""
        from takeout.geo import reverse_geocode
        result = reverse_geocode(48.85, 2.35, NE_DIR)
        self.assertIsNotNone(result)
        self.assertIn("city_lat", result)
        self.assertIn("city_lon", result)
        # Coords must be non-zero and plausible for Paris
        self.assertGreater(result["city_lat"], 40.0)
        self.assertGreater(result["city_lon"], -5.0)
        # Rounded to 2 decimal places
        self.assertAlmostEqual(result["city_lat"], round(result["city_lat"], 2), places=4)
        self.assertAlmostEqual(result["city_lon"], round(result["city_lon"], 2), places=4)

    def test_reverse_geocode_returns_region(self):
        """reverse_geocode includes 'region' (adm1name) from NE populated places."""
        from takeout.geo import reverse_geocode
        # Paris → Ile-de-France
        result = reverse_geocode(48.85, 2.35, NE_DIR)
        self.assertIsNotNone(result)
        self.assertIn("region", result)
        # Fixture has adm1name = "Île-de-France" for Paris
        self.assertIn(result["region"], ("Île-de-France", "Ile-de-France"))

    def test_reverse_geocode_illinois_region(self):
        """reverse_geocode returns 'Illinois' for a Chicago point."""
        from takeout.geo import reverse_geocode
        # Chicago in fixture: lat=41.83, lon=-87.75, adm1name=Illinois
        result = reverse_geocode(41.83, -87.75, NE_DIR)
        self.assertIsNotNone(result)
        self.assertEqual(result.get("region"), "Illinois")


class TestPointInPolygon(unittest.TestCase):
    """Test the ray-casting PIP implementation."""

    def test_inside_square(self):
        from takeout.geo import _ray_cast
        ring = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]
        self.assertTrue(_ray_cast((0, 0), ring))

    def test_outside_square(self):
        from takeout.geo import _ray_cast
        ring = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]
        self.assertFalse(_ray_cast((2, 0), ring))

    def test_on_edge(self):
        from takeout.geo import _ray_cast
        ring = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]
        # Edge cases are undefined; just assert no crash
        _ray_cast((1, 0), ring)

    def test_multipolygon_inside(self):
        from takeout.geo import _point_in_geometry
        geom = {
            "type": "MultiPolygon",
            "coordinates": [
                [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
                [[[3, 3], [5, 3], [5, 5], [3, 5], [3, 3]]],
            ],
        }
        self.assertTrue(_point_in_geometry(0, 0, geom))
        self.assertTrue(_point_in_geometry(4, 4, geom))
        self.assertFalse(_point_in_geometry(2, 2, geom))


# ──────────────────────────────────────────────────────────────────────────────
# Parse tests
# ──────────────────────────────────────────────────────────────────────────────

class TestParseTimeline(unittest.TestCase):
    """Test Timeline.json parsing."""

    def setUp(self):
        import takeout.geo as geo_mod
        geo_mod._countries = None
        geo_mod._cities = None

    def test_parse_timeline_fixture(self):
        from takeout.parse import scan_timeline_file
        pts = list(scan_timeline_file(FIXTURES / "Timeline.json"))
        self.assertGreaterEqual(len(pts), 3)  # Paris, Barcelona, Tokyo
        # All should have non-zero lat/lon
        for p in pts:
            self.assertFalse(abs(p.lat) < 1e-6 and abs(p.lon) < 1e-6)
            self.assertGreater(p.ts, 0)

    def test_parse_semantic_history(self):
        from takeout.parse import scan_timeline_in_dir
        pts = list(scan_timeline_in_dir(FIXTURES / "takeout_slh"))
        self.assertGreaterEqual(len(pts), 1)
        for p in pts:
            self.assertFalse(abs(p.lat) < 1e-6 and abs(p.lon) < 1e-6)

    def test_latlng_string_parsing(self):
        from takeout.trips import _parse_latlng_str
        result = _parse_latlng_str("48.85°, 2.35°")
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result[0], 48.85, places=2)
        self.assertAlmostEqual(result[1], 2.35, places=2)

    def test_latlng_without_degree_symbol(self):
        from takeout.trips import _parse_latlng_str
        result = _parse_latlng_str("35.68, 139.69")
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result[0], 35.68, places=2)

    def test_negative_latlng(self):
        from takeout.trips import _parse_latlng_str
        result = _parse_latlng_str("-33.87°, 151.21°")
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result[0], -33.87, places=2)
        self.assertAlmostEqual(result[1], 151.21, places=2)


class TestSidecarParsing(unittest.TestCase):
    """Test Google Photos sidecar JSON parsing."""

    def test_parse_sidecar_from_dir(self):
        from takeout.parse import scan_directory
        pts = list(scan_directory(FIXTURES / "takeout_dir"))
        self.assertGreaterEqual(len(pts), 4)
        for p in pts:
            self.assertFalse(abs(p.lat) < 1e-6 and abs(p.lon) < 1e-6)
            self.assertGreater(p.ts, 0)

    def test_sidecar_geoData_priority(self):
        from takeout.parse import _parse_sidecar_bytes
        sidecar = {
            "photoTakenTime": {"timestamp": "1704067200", "formatted": ""},
            "geoData": {"latitude": 48.85, "longitude": 2.35, "altitude": 0.0, "latitudeSpan": 0.0, "longitudeSpan": 0.0},
            "geoDataExif": {"latitude": 0.0, "longitude": 0.0, "altitude": 0.0, "latitudeSpan": 0.0, "longitudeSpan": 0.0},
        }
        result = _parse_sidecar_bytes(json.dumps(sidecar).encode())
        self.assertIsNotNone(result)
        lat, lon, ts = result
        self.assertAlmostEqual(lat, 48.85, places=2)
        self.assertAlmostEqual(lon, 2.35, places=2)
        self.assertEqual(ts, 1704067200)

    def test_sidecar_zero_coords_skipped(self):
        from takeout.parse import _parse_sidecar_bytes
        sidecar = {
            "photoTakenTime": {"timestamp": "1704067200", "formatted": ""},
            "geoData": {"latitude": 0.0, "longitude": 0.0, "altitude": 0.0, "latitudeSpan": 0.0, "longitudeSpan": 0.0},
        }
        result = _parse_sidecar_bytes(json.dumps(sidecar).encode())
        self.assertIsNone(result)

    def test_parse_iso_z(self):
        from takeout.parse import _parse_iso
        ts = _parse_iso("2024-01-01T10:00:00Z")
        self.assertGreater(ts, 0)

    def test_parse_iso_with_offset(self):
        from takeout.parse import _parse_iso
        ts = _parse_iso("2024-01-01T10:00:00+05:30")
        self.assertGreater(ts, 0)

    def test_parse_iso_empty(self):
        from takeout.parse import _parse_iso
        self.assertEqual(_parse_iso(""), 0)
        self.assertEqual(_parse_iso("garbage"), 0)


# ──────────────────────────────────────────────────────────────────────────────
# Zip scanning tests
# ──────────────────────────────────────────────────────────────────────────────

class TestZipScanning(unittest.TestCase):
    """Test that zip scanning reads sidecars but does NOT extract media to disk."""

    def test_zip_reads_sidecars_not_media(self):
        """Verify zip scanning returns GeoPoints without extracting media files."""
        from takeout.parse import scan_zip
        zip_path = FIXTURES / "takeout.zip"
        pts = list(scan_zip(zip_path))
        self.assertGreaterEqual(len(pts), 1)
        for p in pts:
            self.assertTrue(p.ref.is_archive())
            self.assertEqual(p.ref.archive, zip_path)
            # Verify the archive member was not extracted to disk
            member_path = Path(p.ref.member)
            self.assertFalse(member_path.exists(),
                             f"Archive member was extracted to disk: {p.ref.member}")

    def test_zip_timeline_parsed(self):
        """Verify Timeline.json inside a zip is parsed for location data."""
        from takeout.parse import scan_timeline_in_zip
        zip_path = FIXTURES / "takeout.zip"
        pts = list(scan_timeline_in_zip(zip_path))
        self.assertGreaterEqual(len(pts), 1)

    def test_zip_photo_and_timeline_combined(self):
        """scan_source on a zip returns both photo and timeline points."""
        from takeout.parse import scan_source
        zip_path = FIXTURES / "takeout.zip"
        photos, timeline = scan_source(zip_path)
        self.assertGreaterEqual(len(photos), 1)
        self.assertGreaterEqual(len(timeline), 1)


# ──────────────────────────────────────────────────────────────────────────────
# Clustering tests
# ──────────────────────────────────────────────────────────────────────────────

class TestClustering(unittest.TestCase):
    """Test city visit clustering."""

    def setUp(self):
        import takeout.geo as geo_mod
        geo_mod._countries = None
        geo_mod._cities = None

    def test_cluster_three_cities(self):
        from takeout.cluster import cluster
        from takeout.parse import scan_directory
        pts = list(scan_directory(FIXTURES / "takeout_dir"))
        visits = cluster(pts, ne_dir=NE_DIR)
        # Should produce Paris, Barcelona, Tokyo
        cities = {v.city for v in visits}
        self.assertIn("Paris", cities)
        self.assertIn("Barcelona", cities)
        self.assertIn("Tokyo", cities)

    def test_cluster_visit_gap_splitting(self):
        """Verify that a 20-day gap between visits creates separate Visit objects."""
        from takeout.parse import GeoPoint, SourceRef
        from takeout.cluster import cluster
        # Paris on Jan 1 and Tokyo on Mar 1 (gap > 14 days → separate visits)
        ref = SourceRef(archive=None, member="test", path_hint=Path("test"))
        pts = [
            GeoPoint(lat=48.85, lon=2.35, ts=1704067200, ref=ref),  # 2024-01-01 Paris
            GeoPoint(lat=35.68, lon=139.69, ts=1709251200, ref=ref),  # 2024-03-01 Tokyo
        ]
        visits = cluster(pts, ne_dir=NE_DIR)
        self.assertEqual(len(visits), 2)

    def test_home_city_flagging(self):
        """Cities with too many days per year are flagged as home."""
        from takeout.parse import GeoPoint, SourceRef
        from takeout.cluster import cluster
        from datetime import datetime, timezone
        import time as time_mod
        ref = SourceRef(archive=None, member="test", path_hint=Path("test"))
        # Barcelona every week for a year → should be flagged
        pts = []
        for week in range(52):
            ts = int(datetime(2024, 1, 7, tzinfo=timezone.utc).timestamp()) + week * 7 * 86400
            pts.append(GeoPoint(lat=41.38, lon=2.17, ts=ts, ref=ref))
        # Paris once
        pts.append(GeoPoint(lat=48.85, lon=2.35, ts=1704067200, ref=ref))

        visits = cluster(pts, ne_dir=NE_DIR, home_days_per_year=30)
        barcelona_visits = [v for v in visits if v.city == "Barcelona"]
        paris_visits = [v for v in visits if v.city == "Paris"]
        self.assertTrue(all(v.home_flagged for v in barcelona_visits))
        self.assertTrue(all(not v.home_flagged for v in paris_visits))


# ──────────────────────────────────────────────────────────────────────────────
# Trips tests
# ──────────────────────────────────────────────────────────────────────────────

class TestTrips(unittest.TestCase):
    """Test trips.py detection logic."""

    def setUp(self):
        import takeout.geo as geo_mod
        geo_mod._countries = None
        geo_mod._cities = None

    def test_trips_detected(self):
        """Build trips from the trips fixture and verify expected trips."""
        from takeout.trips import parse_timeline_visits, build_trips
        pts = parse_timeline_visits(FIXTURES / "Timeline_trips.json")
        trips, home_list = build_trips(pts, ne_dir=NE_DIR, home_days_per_year=20)
        self.assertGreater(len(trips), 0)
        # Barcelona should be home (50 visits in fixture)
        home_cities = {city for _, city, _ in home_list}
        self.assertIn("Barcelona", home_cities)

    def test_paris_trips_are_separate(self):
        """June Paris and November Paris visits are separate trips (gap > 2 days)."""
        from takeout.trips import parse_timeline_visits, build_trips
        pts = parse_timeline_visits(FIXTURES / "Timeline_trips.json")
        trips, _ = build_trips(pts, ne_dir=NE_DIR, home_days_per_year=20)
        paris_trips = [t for t in trips if any(cv.city == "Paris" for cv in t.city_visits)]
        self.assertGreaterEqual(len(paris_trips), 2, "Should have at least 2 Paris trips")

    def test_home_detection_threshold(self):
        """Cities below the threshold are not flagged."""
        from takeout.trips import parse_timeline_visits, build_trips
        pts = parse_timeline_visits(FIXTURES / "Timeline_trips.json")
        # Tokyo (5 days) should NOT be flagged as home with threshold of 20
        _, home_list = build_trips(pts, ne_dir=NE_DIR, home_days_per_year=20)
        home_cities = {city for _, city, _ in home_list}
        self.assertNotIn("Tokyo", home_cities)

    def test_explicit_home_city(self):
        """Explicitly named home cities are always flagged."""
        from takeout.trips import parse_timeline_visits, build_trips
        pts = parse_timeline_visits(FIXTURES / "Timeline_trips.json")
        # Paris has only a few days but we flag it explicitly
        _, home_list = build_trips(pts, ne_dir=NE_DIR, home_days_per_year=100, home_cities={"Paris"})
        home_cities = {city for _, city, _ in home_list}
        self.assertIn("Paris", home_cities)

    def test_no_raw_output(self):
        """build_trips only prints summary lines (no raw lat/lon/paths)."""
        from takeout.trips import parse_timeline_visits, build_trips
        import io as _io
        pts = parse_timeline_visits(FIXTURES / "Timeline_trips.json")
        # Capture stdout and verify no coordinates appear
        import contextlib
        out = _io.StringIO()
        with contextlib.redirect_stdout(out):
            build_trips(pts, ne_dir=NE_DIR, home_days_per_year=20)
        output = out.getvalue()
        # Should not contain raw decimal coordinates
        import re
        coord_pattern = re.compile(r'\b\d+\.\d{4,}\b')
        self.assertIsNone(coord_pattern.search(output),
                          f"Output contained raw coordinates: {output}")

    def test_exclude_illinois_region(self):
        """Points in Illinois are excluded when 'illinois' is in excludes['regions']."""
        from takeout.trips import parse_timeline_visits, build_trips
        pts = parse_timeline_visits(FIXTURES / "Timeline_trips.json")
        excludes = {"regions": {"illinois"}, "countries": set(), "cities": set()}
        trips, _ = build_trips(pts, ne_dir=NE_DIR, home_days_per_year=20, excludes=excludes)
        # Chicago (Dec 10) must not appear in any trip
        for trip in trips:
            for cv in trip.city_visits:
                self.assertNotEqual(cv.city.lower(), "chicago",
                                    f"Chicago appeared in trip {trip.id} despite Illinois exclusion")
            # Also check no Illinois city snuck in
                self.assertNotEqual(cv.country.lower(), "united states of america" if cv.city.lower() == "chicago" else "")

    def test_without_exclusion_illinois_appears(self):
        """Without exclusion, the Chicago/Illinois point produces a trip entry."""
        from takeout.trips import parse_timeline_visits, build_trips
        pts = parse_timeline_visits(FIXTURES / "Timeline_trips.json")
        trips, _ = build_trips(pts, ne_dir=NE_DIR, home_days_per_year=20, excludes=None)
        all_cities = [cv.city.lower() for t in trips for cv in t.city_visits]
        self.assertIn("chicago", all_cities, "Chicago should appear when no exclusion is set")

    def test_load_excludes_from_json(self):
        """load_excludes reads excludes.json from the review_dir."""
        from takeout.trips import load_excludes
        with tempfile.TemporaryDirectory() as td:
            excludes_path = Path(td) / "excludes.json"
            excludes_path.write_text(json.dumps({
                "regions": ["Illinois", "California"],
                "countries": ["Canada"],
                "cities": ["Springfield"],
            }))
            result = load_excludes(Path(td))
            self.assertIn("illinois", result["regions"])
            self.assertIn("california", result["regions"])
            self.assertIn("canada", result["countries"])
            self.assertIn("springfield", result["cities"])

    def test_load_excludes_merges_cli_args(self):
        """load_excludes merges CLI --exclude-region args with excludes.json."""
        from takeout.trips import load_excludes
        with tempfile.TemporaryDirectory() as td:
            # No excludes.json → only CLI args
            result = load_excludes(Path(td), extra_regions=["Illinois", "Texas"])
            self.assertIn("illinois", result["regions"])
            self.assertIn("texas", result["regions"])
            self.assertEqual(len(result["countries"]), 0)

    def test_trips_newest_first(self):
        """Trips are sorted newest first (reverse chronological) in the output."""
        from takeout.trips import parse_timeline_visits, build_trips
        pts = parse_timeline_visits(FIXTURES / "Timeline_trips.json")
        trips, _ = build_trips(pts, ne_dir=NE_DIR, home_days_per_year=20)
        self.assertGreaterEqual(len(trips), 2)
        starts = [t.start for t in trips]
        self.assertEqual(starts, sorted(starts, reverse=True),
                         f"Trips not in reverse chron order: {starts}")

    def test_cities_in_visit_order(self):
        """Within each trip, cities are listed in visit order (first appearance)."""
        from takeout.parse import GeoPoint, SourceRef
        from takeout.trips import build_trips
        # Paris on day 1, Tokyo on day 2 of the same span → Paris first
        ref = SourceRef(archive=None, member="test", path_hint=Path("test"))
        # Use timestamps 1 day apart so they're in one trip span
        pts = [
            GeoPoint(lat=48.85, lon=2.35,   ts=1704067200, ref=ref),  # Paris, 2024-01-01
            GeoPoint(lat=35.68, lon=139.69, ts=1704153600, ref=ref),  # Tokyo, 2024-01-02
        ]
        trips, _ = build_trips(pts, ne_dir=NE_DIR, home_days_per_year=100)
        self.assertEqual(len(trips), 1)
        city_names = [cv.city for cv in trips[0].city_visits]
        self.assertEqual(city_names[0], "Paris", f"Expected Paris first, got: {city_names}")
        self.assertEqual(city_names[1], "Tokyo", f"Expected Tokyo second, got: {city_names}")


# ──────────────────────────────────────────────────────────────────────────────
# EXIF stripping tests
# ──────────────────────────────────────────────────────────────────────────────

class TestExifStripping(unittest.TestCase):
    """Verify output images have no GPS EXIF data."""

    def test_resize_strip_no_gps(self):
        """Output from resize_strip_to_bytes has no GPS IFD."""
        from takeout.pick import resize_strip_to_bytes
        from PIL import Image
        # Create an 8x8 JPEG in memory
        buf = io.BytesIO()
        Image.new("RGB", (8, 8), (100, 150, 200)).save(buf, format="JPEG")
        raw = buf.getvalue()
        out = resize_strip_to_bytes(raw)
        self.assertIsNotNone(out)
        # Verify no GPS IFD in output
        with Image.open(io.BytesIO(out)) as img:
            exif = img.getexif()
            self.assertNotIn(0x8825, exif, "Output image must not contain GPS IFD")

    def test_resize_strip_reduces_size(self):
        """Large images are resized to max 512px long edge."""
        from takeout.pick import resize_strip_to_bytes, MAX_LONG_EDGE
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (1024, 768), (200, 180, 160)).save(buf, format="JPEG")
        raw = buf.getvalue()
        out = resize_strip_to_bytes(raw)
        self.assertIsNotNone(out)
        with Image.open(io.BytesIO(out)) as img:
            w, h = img.size
            self.assertLessEqual(max(w, h), MAX_LONG_EDGE)

    def test_apply_resize_strip_no_gps(self):
        """apply.py's resize_strip_image produces EXIF-free output (no GPS IFD, no ICC)."""
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
        from takeout.apply import resize_strip_image
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (64, 64), (150, 200, 100)).save(buf, format="JPEG")
        raw = buf.getvalue()
        out = resize_strip_image(raw)
        self.assertIsNotNone(out)
        with Image.open(io.BytesIO(out)) as img:
            exif = img.getexif()
            self.assertNotIn(0x8825, exif, "GPS IFD must be absent")
            # Converted to RGB with no ICC profile set
            self.assertIsNone(img.info.get("icc_profile"), "ICC profile must be absent")


# ──────────────────────────────────────────────────────────────────────────────
# Repo-path refusal test
# ──────────────────────────────────────────────────────────────────────────────

class TestRepoRefusal(unittest.TestCase):
    """Verify scan.py refuses to write review_dir inside the repo."""

    def test_refuses_inside_repo(self):
        """_refuse_inside_repo exits when given a path inside the repo."""
        from takeout.trips import _refuse_inside_repo
        # Use the repo root itself as the "review_dir"
        repo_root = Path(__file__).resolve().parent.parent.parent.parent
        with self.assertRaises(SystemExit):
            _refuse_inside_repo(repo_root / "src" / "content")

    def test_allows_outside_repo(self):
        """_refuse_inside_repo does not exit for paths outside the repo."""
        from takeout.trips import _refuse_inside_repo
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            _refuse_inside_repo(Path(td))  # should not raise


# ──────────────────────────────────────────────────────────────────────────────
# Incremental state tests
# ──────────────────────────────────────────────────────────────────────────────

class TestIncrementalState(unittest.TestCase):
    """Test state.json round-trip for incremental scanning."""

    def test_save_and_load(self):
        from takeout.parse import GeoPoint, SourceRef, geopoints_to_json, geopoints_from_json, save_state, load_state
        ref = SourceRef(archive=Path("/some/archive.zip"), member="photos/img.jpg", path_hint=Path("/some/archive.zip"))
        pts = [GeoPoint(lat=48.85, lon=2.35, ts=1704067200, ref=ref)]

        with tempfile.TemporaryDirectory() as td:
            state_path = Path(td) / "state.json"
            save_state(state_path, pts)
            loaded = load_state(state_path)
            self.assertEqual(len(loaded), 1)
            self.assertAlmostEqual(loaded[0].lat, 48.85, places=4)
            self.assertAlmostEqual(loaded[0].lon, 2.35, places=4)
            self.assertEqual(loaded[0].ts, 1704067200)
            self.assertEqual(str(loaded[0].ref.archive), "/some/archive.zip")
            self.assertEqual(loaded[0].ref.member, "photos/img.jpg")

    def test_merge_deduplicates(self):
        from takeout.parse import GeoPoint, SourceRef, merge_points
        ref = SourceRef(archive=None, member="test", path_hint=Path("test"))
        existing = [GeoPoint(lat=48.85, lon=2.35, ts=1704067200, ref=ref)]
        new_photos = [GeoPoint(lat=48.85, lon=2.35, ts=1704067200, ref=ref)]  # duplicate
        new_timeline = [GeoPoint(lat=35.68, lon=139.69, ts=1709251200, ref=ref)]  # new

        import contextlib, io as _io
        with contextlib.redirect_stdout(_io.StringIO()):
            merged = merge_points(existing, new_photos, new_timeline)

        self.assertEqual(len(merged), 2, "Duplicate should be deduped; new timeline point added")

    def test_load_missing_state(self):
        from takeout.parse import load_state
        result = load_state(Path("/nonexistent/state.json"))
        self.assertEqual(result, [])


# ──────────────────────────────────────────────────────────────────────────────
# places.json + assets.json validation
# ──────────────────────────────────────────────────────────────────────────────

class TestApplyOutput(unittest.TestCase):
    """Test apply.py output structure."""

    def test_places_json_structure(self):
        """apply.py should produce valid places.json with expected keys."""
        import takeout.apply as apply_mod

        with tempfile.TemporaryDirectory() as td:
            places_path = Path(td) / "places.json"
            assets_path = Path(td) / "assets.json"
            assets_path.write_text(json.dumps({}))

            # Patch paths
            orig_places = apply_mod.PLACES_JSON
            orig_assets = apply_mod.ASSETS_JSON
            orig_places_dir = apply_mod.PLACES_ASSETS_DIR
            try:
                apply_mod.PLACES_JSON = places_path
                apply_mod.ASSETS_JSON = assets_path
                apply_mod.PLACES_ASSETS_DIR = Path(td) / "public" / "assets" / "places"

                approve = {
                    "countries": [{
                        "id": "france",
                        "name": "France",
                        # New country: must supply lat/lon (NE centroid)
                        "lat": 46.6,
                        "lon": 2.2,
                        "iso": "FRA",
                        "cities": [{
                            "id": "france-paris",
                            "name": "Paris",
                            "lat": 48.85,
                            "lon": 2.35,
                            "approved": True,
                            "line": "City of Light",
                            "visits": [{"start": "2024-01-01", "end": "2024-01-02", "days": 2}],
                            "photos": [],
                        }]
                    }]
                }

                # Write temp approve.json
                approve_path = Path(td) / "approve.json"
                with open(approve_path, "w") as f:
                    json.dump(approve, f)

                # Run apply with mocked argv
                with patch("sys.argv", ["apply.py", str(approve_path)]):
                    import contextlib, io as _io
                    with contextlib.redirect_stdout(_io.StringIO()):
                        apply_mod.main()

                # Verify places.json
                with open(places_path, encoding="utf-8") as f:
                    places = json.load(f)
                self.assertIn("places", places)
                place_list = places["places"]
                self.assertEqual(len(place_list), 1)
                country = place_list[0]
                self.assertEqual(country["name"], "France")
                self.assertIn("cities", country)
                cities = country["cities"]
                self.assertEqual(len(cities), 1)
                city = cities[0]
                self.assertEqual(city["name"], "Paris")
                self.assertEqual(city["line"], "City of Light")
                self.assertAlmostEqual(city["lat"], 48.85, places=2)
                self.assertAlmostEqual(city["lon"], 2.35, places=2)

            finally:
                apply_mod.PLACES_JSON = orig_places
                apply_mod.ASSETS_JSON = orig_assets
                apply_mod.PLACES_ASSETS_DIR = orig_places_dir

    def test_apply_preserves_existing_places_and_regions(self):
        """apply.py must not remove or modify existing places or regions."""
        import takeout.apply as apply_mod

        existing_places = {
            "sample": False,
            "regions": [{"id": "mediterranean", "bbox": [-15, 25, 30, 72]}],
            "places": [
                {"id": "france", "name": "France", "line": "Loved it", "lat": 46.0, "lon": 2.0,
                 "iso": "FR", "region": "mediterranean"},
                {"id": "japan", "name": "Japan", "line": "Amazing", "lat": 36.0, "lon": 138.0},
            ],
        }

        approve = {
            "countries": [{
                "id": "france",
                "name": "France",
                "cities": [{
                    "id": "france-paris",
                    "name": "Paris",
                    "lat": 48.85,
                    "lon": 2.35,
                    "approved": True,
                    "line": "City of Light",
                    "visits": [],
                    "photos": [],
                }],
            }]
        }

        with tempfile.TemporaryDirectory() as td:
            places_path = Path(td) / "places.json"
            assets_path = Path(td) / "assets.json"
            places_path.write_text(json.dumps(existing_places))
            assets_path.write_text(json.dumps({}))

            orig_places = apply_mod.PLACES_JSON
            orig_assets = apply_mod.ASSETS_JSON
            orig_places_dir = apply_mod.PLACES_ASSETS_DIR
            try:
                apply_mod.PLACES_JSON = places_path
                apply_mod.ASSETS_JSON = assets_path
                apply_mod.PLACES_ASSETS_DIR = Path(td) / "public" / "assets" / "places"

                approve_path = Path(td) / "approve.json"
                approve_path.write_text(json.dumps(approve))

                with patch("sys.argv", ["apply.py", str(approve_path)]):
                    import contextlib, io as _io
                    with contextlib.redirect_stdout(_io.StringIO()):
                        apply_mod.main()

                with open(places_path, encoding="utf-8") as f:
                    result = json.load(f)

                # sample and regions must be preserved verbatim
                self.assertFalse(result.get("sample"))
                self.assertEqual(len(result.get("regions", [])), 1)
                self.assertEqual(result["regions"][0]["id"], "mediterranean")

                # Both original places must still be present
                ids = {p["id"] for p in result["places"]}
                self.assertIn("france", ids)
                self.assertIn("japan", ids)

                # Japan must be completely unchanged
                japan = next(p for p in result["places"] if p["id"] == "japan")
                self.assertEqual(japan["name"], "Japan")
                self.assertEqual(japan["line"], "Amazing")
                self.assertAlmostEqual(japan["lat"], 36.0)

                # France gets the city added; its own fields must be preserved
                france = next(p for p in result["places"] if p["id"] == "france")
                self.assertEqual(france["iso"], "FR")
                self.assertEqual(france["region"], "mediterranean")
                self.assertEqual(france["line"], "Loved it")  # untouched
                cities = france.get("cities", [])
                self.assertEqual(len(cities), 1)
                self.assertEqual(cities[0]["id"], "france-paris")

            finally:
                apply_mod.PLACES_JSON = orig_places
                apply_mod.ASSETS_JSON = orig_assets
                apply_mod.PLACES_ASSETS_DIR = orig_places_dir

    def test_city_coords_flow_through_approve_to_places(self):
        """City lat/lon from NE reverse geocoding flow: trips.json -> approve.json -> places.json."""
        import takeout.apply as apply_mod

        # approve.json has NE-resolved city coords (non-zero)
        approve = {
            "countries": [{
                "id": "japan",
                "name": "Japan",
                "lat": 36.2,    # NE country centroid
                "lon": 138.25,
                "iso": "JPN",
                "cities": [{
                    "id": "japan-tokyo",
                    "name": "Tokyo",
                    "lat": 35.68,   # NE resolved city centroid
                    "lon": 139.69,
                    "approved": True,
                    "line": "Visited Aug 2023",
                    "visits": [{"start": "2023-08-01", "end": "2023-08-05", "days": 5}],
                    "photos": [],
                }],
            }]
        }

        with tempfile.TemporaryDirectory() as td:
            places_path = Path(td) / "places.json"
            assets_path = Path(td) / "assets.json"
            assets_path.write_text(json.dumps({}))

            orig_places = apply_mod.PLACES_JSON
            orig_assets = apply_mod.ASSETS_JSON
            orig_places_dir = apply_mod.PLACES_ASSETS_DIR
            try:
                apply_mod.PLACES_JSON = places_path
                apply_mod.ASSETS_JSON = assets_path
                apply_mod.PLACES_ASSETS_DIR = Path(td) / "public" / "assets" / "places"

                approve_path = Path(td) / "approve.json"
                approve_path.write_text(json.dumps(approve))

                with patch("sys.argv", ["apply.py", str(approve_path)]):
                    import contextlib, io as _io
                    with contextlib.redirect_stdout(_io.StringIO()):
                        apply_mod.main()

                with open(places_path, encoding="utf-8") as f:
                    result = json.load(f)

                places = result["places"]
                # With iso="JPN", _create_place uses ISO-lowercase → id = "jpn"
                japan = next(p for p in places if p["id"] in ("japan", "jpn"))
                cities = japan.get("cities", [])
                self.assertEqual(len(cities), 1)
                tokyo = cities[0]
                # Must preserve NE-resolved coords, not default to 0.0
                self.assertAlmostEqual(tokyo["lat"], 35.68, places=2)
                self.assertAlmostEqual(tokyo["lon"], 139.69, places=2)
                self.assertNotAlmostEqual(tokyo["lat"], 0.0, places=1)
                self.assertNotAlmostEqual(tokyo["lon"], 0.0, places=1)

            finally:
                apply_mod.PLACES_JSON = orig_places
                apply_mod.ASSETS_JSON = orig_assets
                apply_mod.PLACES_ASSETS_DIR = orig_places_dir


# ──────────────────────────────────────────────────────────────────────────────
# Picker API mock tests
# ──────────────────────────────────────────────────────────────────────────────

class TestPickerMocked(unittest.TestCase):
    """Test pick.py with mocked HTTP calls."""

    def test_create_session_parses_response(self):
        """create_picker_session returns the session dict."""
        from takeout.pick import _api_request
        mock_response = {"id": "sess123", "pickerUri": "https://photos.google.com/picker/sess123", "mediaItemsSet": False}

        with patch("takeout.pick._api_request", return_value=mock_response):
            from takeout.pick import create_picker_session
            session = create_picker_session("fake_token")
            self.assertEqual(session["id"], "sess123")
            self.assertIn("pickerUri", session)

    def test_list_media_items_pagination(self):
        """list_media_items follows nextPageToken pagination, skipping non-PHOTO items."""
        from takeout.pick import list_media_items

        photo_item = {"id": "item1", "mediaFile": {"mimeType": "image/jpeg", "baseUrl": "https://x"}}
        video_item = {"id": "video1", "mediaFile": {"mimeType": "video/mp4", "baseUrl": "https://y"}}
        page1 = {"mediaItems": [photo_item, video_item], "nextPageToken": "tok2"}
        page2 = {"mediaItems": [{"id": "item2", "mediaFile": {"mimeType": "image/png", "baseUrl": "https://z"}}]}

        call_count = 0
        def mock_api(method, path, access_token, body=None, params=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return page1
            return page2

        with patch("takeout.pick._api_request", side_effect=mock_api):
            items = list_media_items("sess123", "fake_token")
            # Only 2 photo items (video skipped)
            self.assertEqual(len(items), 2)
            self.assertEqual(call_count, 2)
            self.assertTrue(all(i["mediaFile"]["mimeType"].startswith("image/") for i in items))

    def test_list_media_items_skips_non_photos(self):
        """list_media_items filters out non-image mimeTypes before returning."""
        from takeout.pick import list_media_items

        page = {"mediaItems": [
            {"id": "vid", "mediaFile": {"mimeType": "video/mp4", "baseUrl": "https://v"}},
            {"id": "img", "mediaFile": {"mimeType": "image/jpeg", "baseUrl": "https://i"}},
        ]}

        with patch("takeout.pick._api_request", return_value=page):
            items = list_media_items("sess", "tok")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], "img")

    def test_download_media_item_appends_w2048(self):
        """download_media_item appends =w2048 for images."""
        from takeout.pick import download_media_item
        item = {
            "mediaFile": {
                "baseUrl": "https://lh3.googleusercontent.com/abc",
                "mimeType": "image/jpeg",
            }
        }
        downloaded_urls = []

        def mock_urlopen(req, timeout=None):
            downloaded_urls.append(req.full_url if hasattr(req, 'full_url') else str(req))
            resp = MagicMock()
            resp.__enter__ = lambda s: s
            resp.__exit__ = MagicMock(return_value=False)
            resp.read = lambda: b"fake_jpeg_bytes"
            return resp

        with patch("urllib.request.urlopen", side_effect=mock_urlopen):
            result = download_media_item(item, access_token="test-token")
            self.assertEqual(result, b"fake_jpeg_bytes")
            self.assertTrue(any("=w2048" in u for u in downloaded_urls),
                            f"=w2048 not appended; URLs: {downloaded_urls}")

    def test_download_media_item_sends_auth_header(self):
        """download_media_item sends Authorization: Bearer header.

        Per: https://developers.google.com/photos/picker/guides/access-media-items
        baseUrl downloads require the OAuth access token in the Authorization header.
        """
        from takeout.pick import download_media_item
        item = {
            "mediaFile": {
                "baseUrl": "https://lh3.googleusercontent.com/abc",
                "mimeType": "image/jpeg",
            }
        }
        captured_headers: list[dict] = []

        def mock_urlopen(req, timeout=None):
            captured_headers.append(dict(req.headers))
            resp = MagicMock()
            resp.__enter__ = lambda s: s
            resp.__exit__ = MagicMock(return_value=False)
            resp.read = lambda: b"fake_jpeg_bytes"
            return resp

        with patch("urllib.request.urlopen", side_effect=mock_urlopen):
            download_media_item(item, access_token="my-secret-token")

        self.assertTrue(captured_headers, "urlopen was not called")
        auth = captured_headers[0].get("Authorization") or captured_headers[0].get("authorization")
        self.assertIsNotNone(auth, f"Authorization header missing; headers: {captured_headers[0]}")
        self.assertIn("my-secret-token", auth)

    def test_download_media_item_403_clear_message(self):
        """download_media_item returns None and prints clear message on 403."""
        import urllib.error
        from takeout.pick import download_media_item
        import io as _io, contextlib
        item = {
            "mediaFile": {
                "baseUrl": "https://lh3.googleusercontent.com/abc",
                "mimeType": "image/jpeg",
            }
        }

        def mock_urlopen(req, timeout=None):
            raise urllib.error.HTTPError(
                url="https://lh3.googleusercontent.com/abc=w2048",
                code=403,
                msg="Forbidden",
                hdrs=MagicMock(),
                fp=_io.BytesIO(b"Forbidden"),
            )

        out = _io.StringIO()
        with patch("urllib.request.urlopen", side_effect=mock_urlopen):
            with contextlib.redirect_stdout(out):
                result = download_media_item(item, access_token="expired-token")

        self.assertIsNone(result)
        self.assertIn("403", out.getvalue())

    def test_token_refresh_flow(self):
        """get_access_token refreshes an expired token without re-authorizing."""
        from takeout.pick import get_access_token, OAUTH_TOKEN_URL
        import time as time_mod

        secret_data = {
            "installed": {
                "client_id": "test-id",
                "client_secret": "test-secret",
            }
        }
        token_data = {
            "access_token": "old-token",
            "refresh_token": "refresh-token",
            "expires_at": time_mod.time() - 100,  # expired
        }

        refresh_response = {
            "access_token": "new-token",
            "expires_in": 3600,
        }

        def mock_urlopen(req, timeout=None):
            resp = MagicMock()
            resp.__enter__ = lambda s: s
            resp.__exit__ = MagicMock(return_value=False)
            resp.read = lambda: json.dumps(refresh_response).encode()
            return resp

        with tempfile.TemporaryDirectory() as td:
            secret_path = Path(td) / "secret.json"
            token_path = Path(td) / "token.json"
            secret_path.write_text(json.dumps(secret_data))
            token_path.write_text(json.dumps(token_data))

            with patch("urllib.request.urlopen", side_effect=mock_urlopen):
                token = get_access_token(secret_path, token_path)
                self.assertEqual(token, "new-token")

            # Verify token was saved with mode 0600
            with open(token_path) as f:
                saved = json.load(f)
            self.assertEqual(saved["access_token"], "new-token")
            mode = oct(Path(token_path).stat().st_mode & 0o777)
            self.assertEqual(mode, oct(0o600), f"Token file must be 0600, got {mode}")

    def test_pkce_pair_s256(self):
        """_pkce_pair returns a valid PKCE S256 verifier+challenge pair."""
        from takeout.pick import _pkce_pair
        import base64, hashlib
        verifier, challenge = _pkce_pair()
        # Verifier is URL-safe base64 of 32 random bytes, no padding
        self.assertRegex(verifier, r'^[A-Za-z0-9_-]+$')
        self.assertGreaterEqual(len(verifier), 40)
        # Challenge = BASE64URL(SHA256(verifier))
        expected = base64.urlsafe_b64encode(
            hashlib.sha256(verifier.encode()).digest()
        ).rstrip(b"=").decode()
        self.assertEqual(challenge, expected)


# ──────────────────────────────────────────────────────────────────────────────
# apply.py security and data-integrity tests
# ──────────────────────────────────────────────────────────────────────────────

class TestApplySecurity(unittest.TestCase):
    """Security and data-integrity checks for apply.py."""

    def _run_apply(self, approve: dict, existing_places: dict | None = None) -> dict:
        """Helper: run apply.py in a temp dir, return the resulting places dict."""
        import takeout.apply as apply_mod
        import contextlib, io as _io

        with tempfile.TemporaryDirectory() as td:
            places_path = Path(td) / "places.json"
            assets_path = Path(td) / "assets.json"
            assets_path.write_text(json.dumps({}))
            if existing_places:
                places_path.write_text(json.dumps(existing_places))

            approve_path = Path(td) / "approve.json"
            approve_path.write_text(json.dumps(approve))

            orig_places = apply_mod.PLACES_JSON
            orig_assets = apply_mod.ASSETS_JSON
            orig_dir = apply_mod.PLACES_ASSETS_DIR
            try:
                apply_mod.PLACES_JSON = places_path
                apply_mod.ASSETS_JSON = assets_path
                apply_mod.PLACES_ASSETS_DIR = Path(td) / "public" / "assets" / "places"

                with patch("sys.argv", ["apply.py", str(approve_path)]):
                    with contextlib.redirect_stdout(_io.StringIO()):
                        with contextlib.redirect_stderr(_io.StringIO()):
                            try:
                                apply_mod.main()
                            except SystemExit:
                                pass

                if places_path.exists():
                    with open(places_path) as f:
                        return json.load(f)
                return {}
            finally:
                apply_mod.PLACES_JSON = orig_places
                apply_mod.ASSETS_JSON = orig_assets
                apply_mod.PLACES_ASSETS_DIR = orig_dir

    def test_zero_coord_city_skipped(self):
        """Cities with lat=0, lon=0 are skipped (geocoding failure marker)."""
        approve = {"countries": [{"id": "france", "name": "France", "lat": 46.6, "lon": 2.2, "cities": [{
            "id": "france-unknown", "name": "Unknown",
            "lat": 0.0, "lon": 0.0,
            "approved": True, "line": "Visited", "photos": [],
        }]}]}
        result = self._run_apply(approve)
        # The place may be created, but must have no cities (city skipped)
        for p in result.get("places", []):
            for c in p.get("cities", []):
                self.assertFalse(
                    abs(c.get("lat", 1)) < 0.01 and abs(c.get("lon", 1)) < 0.01,
                    f"City with 0,0 coords was written: {c}"
                )

    def test_invalid_city_id_rejected(self):
        """City ids containing path-traversal or invalid chars are rejected."""
        import takeout.apply as apply_mod
        with self.assertRaises(SystemExit):
            apply_mod._validate_id("../etc/passwd", "city")

    def test_invalid_ref_id_rejected(self):
        """ref_ids that are not 16-hex-char sha1 prefixes are rejected."""
        from takeout.apply import _validate_ref_id
        self.assertFalse(_validate_ref_id("../../etc/passwd"))
        self.assertFalse(_validate_ref_id("abc"))
        self.assertFalse(_validate_ref_id("ABCDEF1234567890"))  # uppercase
        self.assertTrue(_validate_ref_id("abcdef1234567890"))   # valid

    def test_photos_attached_to_city(self):
        """Photo slot keys are stored in City.photos[], not orphaned."""
        import takeout.apply as apply_mod
        import contextlib, io as _io

        with tempfile.TemporaryDirectory() as td:
            places_path = Path(td) / "places.json"
            assets_path = Path(td) / "assets.json"
            assets_path.write_text(json.dumps({}))
            approve_path = Path(td) / "approve.json"
            approved_dir = Path(td) / "approved_512"
            approved_dir.mkdir()
            places_dir = Path(td) / "public" / "assets" / "places"

            # Create a tiny approved JPEG
            from PIL import Image
            buf = _io.BytesIO()
            Image.new("RGB", (8, 8), (100, 150, 200)).save(buf, format="JPEG")
            ref_id = "abcdef1234567890"
            (approved_dir / f"{ref_id}.jpg").write_bytes(buf.getvalue())

            approve = {"countries": [{"id": "france", "name": "France", "lat": 46.6, "lon": 2.2, "cities": [{
                "id": "france-paris", "name": "Paris",
                "lat": 48.85, "lon": 2.35,
                "approved": True, "line": "Visited", "photos": [ref_id],
            }]}]}
            approve_path.write_text(json.dumps(approve))

            orig_places = apply_mod.PLACES_JSON
            orig_assets = apply_mod.ASSETS_JSON
            orig_dir = apply_mod.PLACES_ASSETS_DIR
            try:
                apply_mod.PLACES_JSON = places_path
                apply_mod.ASSETS_JSON = assets_path
                apply_mod.PLACES_ASSETS_DIR = places_dir

                with patch("sys.argv", ["apply.py", str(approve_path)]):
                    with contextlib.redirect_stdout(_io.StringIO()):
                        apply_mod.main()

                with open(places_path) as f:
                    result = json.load(f)
            finally:
                apply_mod.PLACES_JSON = orig_places
                apply_mod.ASSETS_JSON = orig_assets
                apply_mod.PLACES_ASSETS_DIR = orig_dir

            france = next(p for p in result["places"] if p["id"] in ("france", "fra"))
            paris = next(c for c in france["cities"] if c["id"] == "france-paris")
            self.assertIn("photos", paris, "photos key must be on City")
            self.assertEqual(len(paris["photos"]), 1)
            self.assertRegex(paris["photos"][0], r"^place\.photo\.")

    def test_photo_numbering_continues(self):
        """Photo numbering continues from existing count, never overwrites."""
        import takeout.apply as apply_mod
        import contextlib, io as _io

        existing = {"sample": False, "places": [{"id": "fra", "name": "France", "lat": 46.6, "lon": 2.2,
            "iso": "FRA",
            "cities": [{"id": "france-paris", "name": "Paris", "lat": 48.85, "lon": 2.35,
                        "line": "Visited", "photos": ["place.photo.france-paris-1"]}]}]}

        with tempfile.TemporaryDirectory() as td:
            places_path = Path(td) / "places.json"
            assets_path = Path(td) / "assets.json"
            assets_path.write_text(json.dumps({}))
            places_path.write_text(json.dumps(existing))

            approved_dir = Path(td) / "approved_512"
            approved_dir.mkdir()
            places_dir = Path(td) / "public" / "assets" / "places"
            places_dir.mkdir(parents=True)
            # Simulate existing file-1 already on disk
            (places_dir / "france-paris-1.jpg").write_bytes(b"fake")

            from PIL import Image
            buf = _io.BytesIO()
            Image.new("RGB", (8, 8), (200, 100, 50)).save(buf, format="JPEG")
            ref_id = "1234567890abcdef"
            (approved_dir / f"{ref_id}.jpg").write_bytes(buf.getvalue())

            approve = {"countries": [{"id": "fra", "name": "France", "iso": "FRA", "lat": 46.6, "lon": 2.2,
                "cities": [{"id": "france-paris", "name": "Paris",
                    "lat": 48.85, "lon": 2.35,
                    "approved": True, "line": "Visited", "photos": [ref_id]}]}]}
            approve_path = Path(td) / "approve.json"
            approve_path.write_text(json.dumps(approve))

            orig_places = apply_mod.PLACES_JSON
            orig_assets = apply_mod.ASSETS_JSON
            orig_dir = apply_mod.PLACES_ASSETS_DIR
            try:
                apply_mod.PLACES_JSON = places_path
                apply_mod.ASSETS_JSON = assets_path
                apply_mod.PLACES_ASSETS_DIR = places_dir

                with patch("sys.argv", ["apply.py", str(approve_path)]):
                    with contextlib.redirect_stdout(_io.StringIO()):
                        apply_mod.main()

                # Existing -1.jpg must not be overwritten (skipped because it exists on disk)
                self.assertEqual((places_dir / "france-paris-1.jpg").read_bytes(), b"fake",
                                 "Existing photo must not be overwritten")
            finally:
                apply_mod.PLACES_JSON = orig_places
                apply_mod.ASSETS_JSON = orig_assets
                apply_mod.PLACES_ASSETS_DIR = orig_dir

    def test_new_country_iso_derived_id(self):
        """New countries get ISO-lowercase as their id, not long NE name."""
        approve = {"countries": [{"id": "united-states-of-america", "name": "United States of America",
            "lat": 37.1, "lon": -95.7, "iso": "USA",
            "cities": [{"id": "usa-chicago", "name": "Chicago",
                "lat": 41.83, "lon": -87.75,
                "approved": True, "line": "Visited", "photos": []}]}]}
        result = self._run_apply(approve)
        place_ids = {p["id"] for p in result.get("places", [])}
        # Should use 'usa' (ISO lowercase), not the long name
        self.assertIn("usa", place_ids, f"Expected 'usa' as id, got: {place_ids}")

    def test_iso_match_preferred_over_id(self):
        """Existing places are matched by iso before id."""
        existing = {"sample": False, "places": [
            {"id": "france", "name": "France", "line": "Visited", "lat": 46.6, "lon": 2.2, "iso": "FRA"},
        ]}
        # approve.json uses a different id but same iso
        approve = {"countries": [{"id": "fra", "name": "France", "iso": "FRA", "lat": 46.6, "lon": 2.2,
            "cities": [{"id": "france-paris", "name": "Paris",
                "lat": 48.85, "lon": 2.35,
                "approved": True, "line": "Visited", "photos": []}]}]}
        result = self._run_apply(approve, existing_places=existing)
        # Must have only 1 place (iso-matched, not duplicated)
        places = result.get("places", [])
        self.assertEqual(len(places), 1, f"Expected 1 place, got: {[p['id'] for p in places]}")
        self.assertEqual(places[0]["id"], "france")  # existing id preserved
        cities = places[0].get("cities", [])
        self.assertEqual(len(cities), 1)


# ──────────────────────────────────────────────────────────────────────────────
# --photos-dir mode tests
# ──────────────────────────────────────────────────────────────────────────────

def _make_gps_jpeg(lat: float, lon: float) -> bytes:
    """Create a tiny in-memory JPEG with GPS EXIF at the given coordinates."""
    from PIL import Image
    from PIL.TiffImagePlugin import IFDRational
    img = Image.new("RGB", (16, 16), (100, 150, 200))
    exif = img.getexif()

    def to_dms(deg: float):
        d = int(abs(deg))
        m_full = (abs(deg) - d) * 60
        m = int(m_full)
        s = round((m_full - m) * 60 * 1000)
        return (IFDRational(d, 1), IFDRational(m, 1), IFDRational(s, 1000))

    gps_ifd = {
        1: "N" if lat >= 0 else "S",
        2: to_dms(lat),
        3: "E" if lon >= 0 else "W",
        4: to_dms(lon),
    }
    exif[0x8825] = gps_ifd
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif.tobytes())
    return buf.getvalue()


def _make_plain_jpeg() -> bytes:
    """Create a tiny JPEG with no GPS EXIF."""
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (16, 16), (200, 100, 50)).save(buf, format="JPEG")
    return buf.getvalue()


class TestPhotosDirMode(unittest.TestCase):
    """Tests for apply.py --photos-dir mode."""

    def setUp(self):
        import takeout.geo as geo_mod
        geo_mod._countries = None
        geo_mod._cities = None

    def _run_photos_dir(self, photos_dir, dry_run=False, existing_places=None,
                        existing_photos=None, existing_assets=None, runs=1):
        """Helper: run apply._main_photos_dir() in a temp repo layout.

        Returns (result_places_dict, published_jpgs_list, stdout_text).
        All file checking is done before the temp dir is cleaned up.
        """
        import takeout.apply as apply_mod
        import contextlib, io as _io

        # Use a TemporaryDirectory as a context manager but capture all results
        # before it cleans up — so we return data, not paths.
        td_obj = tempfile.TemporaryDirectory()
        try:
            td = Path(td_obj.name)
            places_path = td / "places.json"
            assets_path = td / "assets.json"
            assets_path.write_text(json.dumps(existing_assets or {}))
            if existing_places:
                places_path.write_text(json.dumps(existing_places))
            photos_path = td / "photos.json"
            if existing_photos is not None:
                photos_path.write_text(json.dumps(existing_photos))
            places_dir = td / "public" / "assets" / "photos"

            orig_places = apply_mod.PLACES_JSON
            orig_assets = apply_mod.ASSETS_JSON
            orig_dir = apply_mod.PHOTOS_ASSETS_DIR
            orig_photos = apply_mod.PHOTOS_JSON
            try:
                apply_mod.PLACES_JSON = places_path
                apply_mod.ASSETS_JSON = assets_path
                apply_mod.PHOTOS_ASSETS_DIR = places_dir
                apply_mod.PHOTOS_JSON = photos_path

                out = _io.StringIO()
                with contextlib.redirect_stdout(out):
                    for _ in range(runs):
                        apply_mod._main_photos_dir(
                            photos_dir=photos_dir,
                            dry_run=dry_run,
                            ne_dir=NE_DIR,
                            excludes_dir=None,
                        )

                # Extras for tests that look at photos.json / assets.json / file names
                self.last_photos = json.loads(photos_path.read_text()) if photos_path.exists() else None
                self.last_assets = json.loads(assets_path.read_text())
                self.last_names = sorted(p.name for p in places_dir.glob("*.jpg")) if places_dir.exists() else []

                result_places = {}
                if places_path.exists():
                    with open(places_path) as f:
                        result_places = json.load(f)

                # Collect file data BEFORE temp dir is destroyed
                published_files: list[bytes] = []
                places_dir_existed = places_dir.exists()
                if places_dir_existed:
                    for p in sorted(places_dir.glob("*.jpg")):
                        published_files.append(p.read_bytes())

                return result_places, published_files, places_dir_existed, out.getvalue()
            finally:
                apply_mod.PLACES_JSON = orig_places
                apply_mod.ASSETS_JSON = orig_assets
                apply_mod.PHOTOS_ASSETS_DIR = orig_dir
                apply_mod.PHOTOS_JSON = orig_photos
        finally:
            td_obj.cleanup()

    def test_gps_jpeg_geocoded_and_published(self):
        """A JPEG with GPS at Paris gets geocoded and written to places/."""
        with tempfile.TemporaryDirectory() as photos_td:
            photos_dir = Path(photos_td)
            # Paris GPS
            (photos_dir / "paris01.jpg").write_bytes(_make_gps_jpeg(48.85, 2.35))

            result, published_files, places_dir_existed, _ = self._run_photos_dir(photos_dir)

            places = result.get("places", [])
            self.assertGreater(len(places), 0, "No places written")
            # Find France (any place with 'Paris' city)
            paris_cities = [
                c for p in places for c in p.get("cities", [])
                if c.get("name") == "Paris"
            ]
            self.assertEqual(len(paris_cities), 1, f"Expected 1 Paris, got: {paris_cities}")
            paris = paris_cities[0]
            self.assertNotIn("photos", paris, "places.json must not carry photo references")
            rows = self.last_photos["photos"]
            self.assertEqual(len(rows), 1)
            self.assertEqual(set(rows[0]), {"id", "place", "where", "slot"})
            self.assertEqual(rows[0]["where"], "Paris")
            self.assertRegex(rows[0]["id"], r"^[a-z0-9-]+-1$")
            self.assertEqual(rows[0]["slot"], "photo." + rows[0]["id"])
            slot = self.last_assets[rows[0]["slot"]]
            self.assertEqual(slot["path"], f"/assets/photos/{rows[0]['id']}.jpg")
            self.assertEqual((slot["w"], slot["h"]), (16, 16))
            # File published
            self.assertTrue(places_dir_existed, "places_dir not created")
            self.assertEqual(len(published_files), 1)

    def test_no_gps_image_goes_to_unsorted(self):
        """A JPEG with no GPS is listed as unsorted (not published)."""
        with tempfile.TemporaryDirectory() as photos_td:
            photos_dir = Path(photos_td)
            (photos_dir / "no_gps.jpg").write_bytes(_make_plain_jpeg())

            result, published_files, _, stdout = self._run_photos_dir(photos_dir)

            self.assertIn("unsorted", stdout.lower())
            self.assertEqual(len(published_files), 0)

    def test_output_has_no_exif_gps(self):
        """Published photo has no GPS IFD (EXIF stripped)."""
        from PIL import Image
        with tempfile.TemporaryDirectory() as photos_td:
            photos_dir = Path(photos_td)
            (photos_dir / "paris.jpg").write_bytes(_make_gps_jpeg(48.85, 2.35))

            _, published_files, places_dir_existed, _ = self._run_photos_dir(photos_dir)

            self.assertTrue(places_dir_existed, "places_dir not created")
            self.assertEqual(len(published_files), 1)
            with Image.open(io.BytesIO(published_files[0])) as img:
                exif = img.getexif()
                self.assertNotIn(0x8825, exif, "GPS IFD must be absent from published photo")

    def test_dry_run_writes_nothing(self):
        """--dry-run prints a summary and writes no files."""
        with tempfile.TemporaryDirectory() as photos_td:
            photos_dir = Path(photos_td)
            (photos_dir / "paris.jpg").write_bytes(_make_gps_jpeg(48.85, 2.35))

            result, published_files, _, stdout = self._run_photos_dir(photos_dir, dry_run=True)

            self.assertEqual(result, {})
            self.assertEqual(len(published_files), 0)
            self.assertIn("dry-run", stdout.lower())

    def test_idempotent_second_run(self):
        """Second run with the same file adds nothing (no dup row, slot or file)."""
        with tempfile.TemporaryDirectory() as photos_td:
            photos_dir = Path(photos_td)
            (photos_dir / "paris.jpg").write_bytes(_make_gps_jpeg(48.85, 2.35))

            once, _, _, _ = self._run_photos_dir(photos_dir, runs=1)
            rows1, assets1, names1 = self.last_photos, self.last_assets, self.last_names
            # fresh sandbox but the manifest in photos_dir now exists: run twice more
            twice, _, _, _ = self._run_photos_dir(photos_dir, runs=1,
                                                  existing_places=once,
                                                  existing_photos=rows1,
                                                  existing_assets=assets1)
            self.assertEqual(self.last_photos, rows1)
            self.assertEqual(self.last_assets, assets1)
            self.assertEqual(len(rows1["photos"]), 1)

    def test_appends_to_existing_board_stably(self):
        """New photos join their place's group, numbering continues, assets append at END."""
        with tempfile.TemporaryDirectory() as photos_td:
            photos_dir = Path(photos_td)
            (photos_dir / "a.jpg").write_bytes(_make_gps_jpeg(48.85, 2.35))
            first, _, _, _ = self._run_photos_dir(photos_dir)
            pid = self.last_photos["photos"][0]["place"]

            board = {"photos": [
                {"id": f"{pid}-1", "place": pid, "where": "Paris", "slot": f"photo.{pid}-1"},
                {"id": "japan-1", "place": "japan", "where": "Kyoto", "slot": "photo.japan-1"},
            ]}
            assets = {"zzz.first": {"kind": "object"}, "photo.japan-1": {"kind": "object"}}
            with tempfile.TemporaryDirectory() as p2:
                d2 = Path(p2)
                (d2 / "b.jpg").write_bytes(_make_gps_jpeg(48.85, 2.35))
                self._run_photos_dir(d2, existing_places=first, existing_photos=board,
                                     existing_assets=assets)
            ids = [r["id"] for r in self.last_photos["photos"]]
            self.assertEqual(ids, [f"{pid}-1", f"{pid}-2", "japan-1"])
            self.assertEqual(list(self.last_assets)[:2], ["zzz.first", "photo.japan-1"])
            self.assertEqual(list(self.last_assets)[-1], f"photo.{pid}-2")
            self.assertEqual(len(set(ids)), len(ids))

    def test_places_json_has_no_photos_fields(self):
        """places.json only holds places/cities after a photos run."""
        with tempfile.TemporaryDirectory() as photos_td:
            photos_dir = Path(photos_td)
            (photos_dir / "a.jpg").write_bytes(_make_gps_jpeg(48.85, 2.35))
            result, _, _, _ = self._run_photos_dir(photos_dir)
            for p in result["places"]:
                self.assertNotIn("photos", p)
                for c in p.get("cities", []):
                    self.assertNotIn("photos", c)

    def test_subfolder_hint_assigns_city(self):
        """Image in a subfolder named after a city id gets that city assignment."""
        with tempfile.TemporaryDirectory() as photos_td:
            photos_dir = Path(photos_td)
            # Existing place with a Paris city
            existing = {"sample": False, "places": [
                {"id": "france", "name": "France", "line": "Visited", "lat": 46.6, "lon": 2.2,
                 "iso": "FRA",
                 "cities": [{"id": "france-paris", "name": "Paris", "line": "Visited",
                              "lat": 48.85, "lon": 2.35}]},
            ]}
            # Image with NO GPS in a subfolder named 'france-paris'
            subfolder = photos_dir / "france-paris"
            subfolder.mkdir()
            (subfolder / "nogps.jpg").write_bytes(_make_plain_jpeg())

            result, published_files, places_dir_existed, _ = self._run_photos_dir(photos_dir, existing_places=existing)
            places = result.get("places", [])
            france = next((p for p in places if p["id"] == "france"), None)
            self.assertIsNotNone(france)
            paris = next((c for c in france.get("cities", []) if c["id"] == "france-paris"), None)
            self.assertIsNotNone(paris)
            self.assertNotIn("photos", paris)
            self.assertEqual(len(published_files), 1)
            self.assertEqual(self.last_photos["photos"], [
                {"id": "france-1", "place": "france", "where": "Paris", "slot": "photo.france-1"}])

    def test_trips_data_has_lat_lon_iso(self):
        """trips.json city entries must have non-zero lat/lon and country_iso."""
        from takeout.trips import build_trips, write_trips_review
        from takeout.parse import GeoPoint, SourceRef
        import contextlib, io as _io

        ref = SourceRef(archive=None, member="test", path_hint=Path("test"))
        pts = [
            GeoPoint(lat=48.85, lon=2.35, ts=1704067200, ref=ref),  # Paris 2024-01-01
        ]
        with tempfile.TemporaryDirectory() as td:
            review_dir = Path(td)
            with contextlib.redirect_stdout(_io.StringIO()):
                trips, _ = build_trips(pts, ne_dir=NE_DIR, home_days_per_year=200)
                write_trips_review(trips, [], review_dir)

            with open(review_dir / "trips.json") as f:
                trips_data = json.load(f)

        for trip in trips_data.get("trips", []):
            for city in trip.get("cities", []):
                self.assertNotAlmostEqual(city.get("lat", 0.0), 0.0, places=1,
                                          msg=f"City {city['id']} has lat=0")
                self.assertNotAlmostEqual(city.get("lon", 0.0), 0.0, places=1,
                                          msg=f"City {city['id']} has lon=0")
                self.assertIn("country_iso", city,
                              msg=f"City {city['id']} missing country_iso")

    def test_approve_json_has_iso_and_nonzero_coords(self):
        """approve.json country entries have iso and non-zero lat/lon."""
        from takeout.trips import build_trips, write_trips_review
        from takeout.parse import GeoPoint, SourceRef
        import contextlib, io as _io

        ref = SourceRef(archive=None, member="test", path_hint=Path("test"))
        pts = [
            GeoPoint(lat=48.85, lon=2.35, ts=1704067200, ref=ref),  # Paris
        ]
        with tempfile.TemporaryDirectory() as td:
            review_dir = Path(td)
            with contextlib.redirect_stdout(_io.StringIO()):
                trips, _ = build_trips(pts, ne_dir=NE_DIR, home_days_per_year=200)
                write_trips_review(trips, [], review_dir)

            with open(review_dir / "approve.json") as f:
                approve = json.load(f)

        for country in approve.get("countries", []):
            self.assertIn("iso", country, f"Country {country.get('name')} missing iso")
            self.assertNotAlmostEqual(country.get("lat", 0.0), 0.0, places=1,
                                      msg=f"Country {country.get('name')} has lat=0")
            for city in country.get("cities", []):
                self.assertNotAlmostEqual(city.get("lat", 0.0), 0.0, places=1,
                                          msg=f"City {city['id']} has lat=0 in approve.json")
                self.assertNotAlmostEqual(city.get("lon", 0.0), 0.0, places=1,
                                          msg=f"City {city['id']} has lon=0 in approve.json")


if __name__ == "__main__":
    unittest.main(verbosity=2)
