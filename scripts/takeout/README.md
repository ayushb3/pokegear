# Takeout → Town Map: places pipeline

An offline, privacy-first pipeline that turns your Google Maps Timeline and/or
Google Photos Takeout export into approved Town Map place data.

**No data is uploaded. No raw coordinates, filenames or personal data are printed
in bulk. Review happens locally in a browser.**

---

## Quickest path first

### Step 1 (seconds): Timeline-only review

Your Google Maps on-device Timeline.json is a few MB and contains all the places
you've visited. No photos needed for this step.

**Get Timeline.json:**
1. Open Google Maps on your phone → tap your avatar → "Your Timeline"
2. Tap ⋮ → "Export Timeline data" → saves `Timeline.json` to your phone
3. Transfer to your Mac

**Run:**
```bash
python3 scripts/takeout/trips.py \
  --timeline ~/Downloads/Timeline.json \
  --out ~/takeout-review/
```

**Open the review page:**
```bash
open ~/takeout-review/review.html
```

Check trips and cities you want to publish, set labels (shown on the Town Map),
click **"Copy approve.json"**, paste into `~/takeout-review/approve.json`.

---

### Step 2 (optional): Add photos via Google Photos Picker

**One-time Google Cloud setup (5–10 minutes):**

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (any name, e.g. "portfolio-places")
3. **Enable API:** Library → search "Photos Picker API" → Enable
4. **OAuth consent screen:**
   - User type: External
   - App name: "Portfolio Places" (any name)
   - Support email: your Gmail
   - Under "Test users" → Add yourself (your Gmail)
   - Scopes: not required here (added automatically)
5. **Create credentials:**
   - Credentials → + Create credentials → OAuth 2.0 client ID
   - Application type: **Desktop app**
   - Name: anything
   - Download the JSON → save to `~/.config/portfolio-photos/client_secret.json`

**Run (once per city, opens browser for photo selection):**
```bash
python3 scripts/takeout/pick.py ~/takeout-review/approve.json
```

For each approved city, a browser tab opens with Google Photos Picker. Search for
the city name and month (printed as a hint), select up to 6 photos, close the tab.

Photos are downloaded, resized to max 512px, **all EXIF/GPS stripped**, and saved
to `public/assets/places/`. `places.json` and `assets.json` are updated automatically.

API documentation: https://developers.google.com/photos/picker/reference/rest

---

### Step 3: Skip photos, just update places

If you don't want photos, or want to run the review page first and pick photos later:

```bash
python3 scripts/takeout/apply.py ~/takeout-review/approve.json
```

This updates `src/content/places.json` with the approved cities (without photos).

---

## Add photos by hand (--photos-dir)

If you'd rather hand-pick photos from your own library instead of using the
Google Photos Picker, use the `--photos-dir` mode. Drop your chosen JPEGs/PNGs
into a folder and let apply.py do the rest.

**Flat folder** (GPS EXIF required — apply.py reads coordinates and reverse-geocodes):

```bash
# Preview what would happen — writes nothing
python3 scripts/takeout/apply.py --photos-dir ~/my-photos/ --dry-run

# Publish: resize ≤512px, strip EXIF, write to public/assets/photos/
python3 scripts/takeout/apply.py --photos-dir ~/my-photos/
```

Every image must have GPS EXIF. Images without GPS (or images in excluded regions)
are listed under "unsorted" in the dry-run report and never published.

**Subfolder override** (use when GPS is absent or you want manual assignment):

Create subfolders named after an existing city id or city name (spaces → dashes,
case-insensitive). Images inside are assigned to that city regardless of their EXIF:

```
~/my-photos/
  france-paris/        ← assigned to id="france-paris" (or name="Paris")
    IMG_0001.jpg       ← no GPS needed
    IMG_0002.jpg
  tokyo.jpg            ← GPS reverse-geocoded automatically
```

**Exclude a region** (e.g. Illinois):

```bash
python3 scripts/takeout/apply.py \
  --photos-dir ~/my-photos/ \
  --excludes ~/takeout-review/   # reads ~/takeout-review/excludes.json
```

**Idempotency:** apply.py writes a manifest of SHA-256 hashes to
`<photos-dir>/.portfolio-applied.json`. A second run with the same files writes
nothing new (no duplicate row, slot or file). The manifest file is gitignored.

**HEIC support:** install `pillow-heif` (`pip install pillow-heif`). Without it,
HEIC/HEIF files are skipped with a count warning; all other formats still work.

**What gets written:**
- `public/assets/photos/<place-id>-<n>.jpg` — resized, EXIF-stripped JPEG (`<place-id>` is the
  country id in `places.json`; `<n>` continues from the highest existing number, never reused)
- `src/content/photos.json` — the photo board's data: a row `{ id, place, where, slot }`
  (`where` = city name) inserted after the last photo of the same place (new places go at the
  end), so a place's photos stay contiguous. Existing ids are never duplicated or reordered.
- `src/assets/assets.json` — new `photo.<place-id>-<n>` slot (real `w`/`h`) appended at the END
- `src/content/places.json` — new countries/cities only; **no photo references**
- `<photos-dir>/.portfolio-applied.json` — idempotency manifest (gitignored)

**What is never written:** raw coordinates, original filenames, EXIF data.

---

## Larger Takeout: zip-by-zip incremental scanning

If you have a large Google Photos Takeout (100+ GB), download it as multiple 50 GB
.zip archives. Scan one at a time — no need to keep them all simultaneously:

```bash
# First zip
python3 scripts/takeout/scan.py ~/Downloads/takeout-001.zip \
  --out ~/takeout-review/ \
  --state ~/takeout-review/state.json

# Delete takeout-001.zip, download takeout-002.zip, then:
python3 scripts/takeout/scan.py ~/Downloads/takeout-002.zip \
  --out ~/takeout-review/ \
  --state ~/takeout-review/state.json

# Once all zips are scanned, run the review:
open ~/takeout-review/review.html
```

**Takeout selection tips (keep it small):**
- Deselect everything except "Google Photos" and "Maps" → "Timeline"
- In Google Photos settings: deselect albums you don't need
- Select only specific years or trips to keep archives manageable

---

## Apple Photos (optional, macOS)

If `osxphotos` is installed, trips.py and scan.py will read lat/lon/date directly
from your system Photos library (no export needed):

```bash
pip install osxphotos
python3 scripts/takeout/scan.py --apple-photos --out ~/takeout-review/
```

If `osxphotos` is not installed, this flag is silently ignored.

---

## places.json format

`src/content/places.json` is the source of truth for the Town Map "places" data:

```json
{
  "places": [
    {
      "id": "france",
      "name": "France",
      "cities": [
        {
          "id": "france-paris",
          "name": "Paris",
          "lat": 48.85,
          "lon": 2.35,
          "line": "City of Light",
          "photos": ["place.photo.france-paris-1"]
        }
      ]
    }
  ]
}
```

Photos added with `--photos-dir` do not live in `places.json`; see above (`photos.json` + `photo.<place-id>-<n>` slots).

---

## Privacy notes

- **Nothing is uploaded.** All processing happens on your machine.
- **Raw coordinates** are never printed to stdout — only summaries (counts, date ranges, city names).
- **EXIF/GPS is fully stripped** from every photo before it is committed to the repo.
- The `review_dir` is always outside the repo (enforced by the scripts).
- The Google Photos Picker API scope (`photospicker.mediaitems.readonly`) is read-only.
- OAuth tokens are cached in `~/.config/portfolio-photos/token.json` (outside the repo).
- Natural Earth data is cached in `~/.cache/portfolio-takeout/ne/` (outside the repo).
- **Never commit** `state.json`, `trips.json`, `review.html`, `approve.json` or any raw
  Takeout data. They all live in the review dir, outside the repo.

---

## Running tests

```bash
python3 -m pytest scripts/takeout/tests/test_takeout.py -v
# or:
python3 -m unittest scripts/takeout/tests/test_takeout.py
```

All tests are offline (fixture data in `scripts/takeout/fixtures/`). No network needed.

---

## Commands reference

| Command | Purpose |
|---|---|
| `trips.py --timeline <file> --out <dir>` | Timeline → trips review (primary path) |
| `scan.py <source> --out <dir>` | Full scan (dirs/zips/tgz) |
| `scan.py --timeline <file> --out <dir>` | Timeline-only via scan |
| `scan.py ... --state <dir>/state.json` | Incremental zip-by-zip |
| `pick.py <approve.json>` | Download photos via Picker API |
| `apply.py <approve.json>` | Apply approval (no photos) |
| `fixtures/make_fixtures.py` | Regenerate test fixtures |
