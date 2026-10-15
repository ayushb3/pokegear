#!/usr/bin/env python3
"""pick.py — Use the Google Photos Picker API to download approved photos.

For each approved city in approve.json, opens Google's photo picker in the
browser, lets Ayush select up to 6 photos, then downloads them, strips all
EXIF/GPS, resizes to max 512px, writes them to public/assets/places/, and
attaches their slot keys to City.photos[] in places.json.

API reference:
  https://developers.google.com/photos/picker/reference/rest
  https://developers.google.com/photos/picker/guides/get-started

One-time setup (see README for details):
  1. Go to https://console.cloud.google.com/, create a project
  2. Enable "Photos Picker API"
  3. OAuth consent screen → Testing mode → add your Gmail as test user
  4. Credentials → OAuth 2.0 client ID → Desktop app
  5. Download client_secret JSON → ~/.config/portfolio-photos/client_secret.json

Usage:
  python3 scripts/takeout/pick.py approve.json
  python3 scripts/takeout/pick.py approve.json --secret ~/.config/portfolio-photos/client_secret.json

Privacy:
  - OAuth token cached in ~/.config/portfolio-photos/token.json (0600, outside repo)
  - No photos are stored anywhere except public/assets/places/ (EXIF stripped)
  - The Picker API scope (photospicker.mediaitems.readonly) is read-only
"""
from __future__ import annotations

import base64
import hashlib
import http.server
import io
import json
import os
import re
import secrets
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageOps
    _PIL_OK = True
except ImportError:
    _PIL_OK = False

# Shared image processor (no EXIF/ICC/XMP in output)
from takeout.apply import resize_strip_image, _find_place, _create_place, _make_id, _append_asset_slots

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PLACES_JSON = REPO_ROOT / "src" / "content" / "places.json"
ASSETS_JSON = REPO_ROOT / "src" / "assets" / "assets.json"
PLACES_ASSETS_DIR = REPO_ROOT / "public" / "assets" / "places"

DEFAULT_SECRET = Path.home() / ".config" / "portfolio-photos" / "client_secret.json"
DEFAULT_TOKEN  = Path.home() / ".config" / "portfolio-photos" / "token.json"

# Google Photos Picker API
# Docs: https://developers.google.com/photos/picker/reference/rest/v1
PICKER_BASE = "https://photospicker.googleapis.com/v1"
PICKER_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"
OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
OAUTH_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"

# Loopback redirect URI (installed-app flow, /callback only)
REDIRECT_HOST = "127.0.0.1"
REDIRECT_PORT = 9876
REDIRECT_URI  = f"http://{REDIRECT_HOST}:{REDIRECT_PORT}/callback"

MAX_LONG_EDGE = 512
QUALITY = 80
MAX_PICKS = 6  # per city, matches pickingConfig.maxItemCount

# Default poll config (overridden by pollingConfig from API response)
DEFAULT_POLL_INTERVAL_S = 3
DEFAULT_POLL_TIMEOUT_S  = 300  # 5 minutes


class PickerError(Exception):
    pass


def _refuse_inside_repo(path: Path, label: str) -> None:
    try:
        path.resolve().relative_to(REPO_ROOT.resolve())
        print(f"Error: {label} must be OUTSIDE the repo root.\n  Given: {path}", file=sys.stderr)
        sys.exit(1)
    except ValueError:
        pass


# ──────────────────────────────────────────────────────────────────────────────
# OAuth 2.0 helpers (stdlib urllib only, PKCE S256)
# ──────────────────────────────────────────────────────────────────────────────

def _load_secret(path: Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    for key in ("installed", "web"):
        if key in raw:
            return raw[key]
    return raw


def _load_token(token_path: Path) -> dict[str, Any] | None:
    if not token_path.exists():
        return None
    try:
        with open(token_path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _save_token(token_path: Path, token: dict[str, Any]) -> None:
    """Write token with mode 0600 (owner read/write only)."""
    token_path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    # Write via O_CREAT|O_WRONLY with mode 0600 so it's never world-readable.
    # If the file already exists, O_CREAT does not change its mode — chmod after.
    fd = os.open(str(token_path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(token, f, indent=2)
    except Exception:
        os.close(fd)
        raise
    # Ensure mode is 0600 regardless of whether the file pre-existed
    os.chmod(str(token_path), 0o600)


def _pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) for PKCE S256."""
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def _refresh_access_token(secret: dict, refresh_token: str) -> dict[str, Any]:
    data = urllib.parse.urlencode({
        "client_id": secret["client_id"],
        "client_secret": secret["client_secret"],
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }).encode()
    req = urllib.request.Request(OAUTH_TOKEN_URL, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _exchange_code(secret: dict, code: str, code_verifier: str) -> dict[str, Any]:
    data = urllib.parse.urlencode({
        "client_id": secret["client_id"],
        "client_secret": secret["client_secret"],
        "redirect_uri": REDIRECT_URI,
        "code": code,
        "grant_type": "authorization_code",
        "code_verifier": code_verifier,
    }).encode()
    req = urllib.request.Request(OAUTH_TOKEN_URL, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _wait_for_code(state_expected: str) -> str:
    """Start a loopback HTTP server on /callback only; validate state; return code."""
    code_holder: list[str] = []
    done = threading.Event()

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            # Only respond to /callback
            if parsed.path != "/callback":
                self.send_response(404)
                self.end_headers()
                return
            params = dict(urllib.parse.parse_qsl(parsed.query))
            # Validate state before using code
            if params.get("state") != state_expected:
                self.send_response(400)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(b"Bad request: state mismatch")
                done.set()
                return
            if "code" in params:
                code_holder.append(params["code"])
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(b"<h2>Authorized! You can close this tab.</h2>")
            elif "error" in params:
                # HTML-escape the error value — never reflect it unescaped
                import html as _html
                msg = _html.escape(params["error"])
                self.send_response(400)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(f"<p>Authorization error: {msg}</p>".encode())
            done.set()

        def log_message(self, *args):
            pass

    server = http.server.HTTPServer((REDIRECT_HOST, REDIRECT_PORT), Handler)
    t = threading.Thread(target=server.handle_request, daemon=True)
    t.start()
    done.wait(timeout=120)
    server.server_close()
    if not code_holder:
        raise PickerError("No authorization code received (timed out or user cancelled).")
    return code_holder[0]


def _fresh_token(secret: dict, refresh_token: str, token: dict, token_path: Path) -> str:
    """Refresh the access token, update token file, return new access token."""
    refreshed = _refresh_access_token(secret, refresh_token)
    token["access_token"] = refreshed["access_token"]
    token["expires_at"] = time.time() + refreshed.get("expires_in", 3600)
    if "refresh_token" in refreshed:
        token["refresh_token"] = refreshed["refresh_token"]
    _save_token(token_path, token)
    return token["access_token"]


def get_access_token(secret_path: Path, token_path: Path) -> str:
    """Return a valid access token, refreshing or re-authorizing as needed."""
    secret = _load_secret(secret_path)
    token = _load_token(token_path)

    if token:
        expires_at = token.get("expires_at", 0)
        if time.time() < expires_at - 60 and token.get("access_token"):
            return token["access_token"]
        if token.get("refresh_token"):
            try:
                return _fresh_token(secret, token["refresh_token"], token, token_path)
            except Exception as e:
                print(f"  Token refresh failed: {e}. Re-authorizing ...")

    # Full authorization flow with PKCE S256 + random state
    code_verifier, code_challenge = _pkce_pair()
    state = secrets.token_urlsafe(16)

    params = {
        "client_id": secret["client_id"],
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": PICKER_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    auth_url = OAUTH_AUTH_URL + "?" + urllib.parse.urlencode(params)

    print("\nOpening browser for Google authorization ...")
    print(f"  If the browser does not open, visit the authorization URL printed to stderr.\n")
    print(f"  Auth URL: <redacted for privacy>", flush=True)
    # Print full URL to stderr only (not captured in logs shown to user)
    print(auth_url, file=sys.stderr)
    webbrowser.open(auth_url)

    code = _wait_for_code(state)
    new_token = _exchange_code(secret, code, code_verifier)
    new_token["expires_at"] = time.time() + new_token.get("expires_in", 3600)
    _save_token(token_path, new_token)
    print(f"  Token saved.")
    return new_token["access_token"]


def ensure_fresh_token(
    secret: dict, token: dict, token_path: Path, force: bool = False
) -> str:
    """Return a valid access token, refreshing if within 60 s of expiry or forced."""
    if not force:
        expires_at = token.get("expires_at", 0)
        if time.time() < expires_at - 60 and token.get("access_token"):
            return token["access_token"]
    refresh_token = token.get("refresh_token", "")
    if not refresh_token:
        raise PickerError("No refresh token; re-run to re-authorize.")
    return _fresh_token(secret, refresh_token, token, token_path)


# ──────────────────────────────────────────────────────────────────────────────
# Photos Picker API
# Docs: https://developers.google.com/photos/picker/reference/rest/v1/sessions
# ──────────────────────────────────────────────────────────────────────────────

def _api_request(
    method: str,
    path: str,
    access_token: str,
    body: dict | None = None,
    params: dict | None = None,
) -> dict[str, Any]:
    """Make an authenticated request to the Picker API."""
    url = PICKER_BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body else None
    headers: dict[str, str] = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body_bytes = e.read()
        try:
            err = json.loads(body_bytes)
        except Exception:
            err = {"raw": body_bytes.decode(errors="replace")[:200]}
        raise PickerError(f"HTTP {e.code}: {err}") from e


def create_picker_session(access_token: str) -> dict[str, Any]:
    """Create a new Picker session with maxItemCount = 6.

    POST /v1/sessions
    Docs: https://developers.google.com/photos/picker/reference/rest/v1/sessions/create
    """
    return _api_request("POST", "/sessions", access_token, body={
        "pickingConfig": {"maxItemCount": MAX_PICKS},
    })


def delete_picker_session(session_id: str, access_token: str) -> None:
    """Delete a Picker session (cleanup).

    DELETE /v1/sessions/{sessionId}
    Docs: https://developers.google.com/photos/picker/reference/rest/v1/sessions/delete
    """
    try:
        _api_request("DELETE", f"/sessions/{session_id}", access_token)
    except PickerError:
        pass  # Best-effort cleanup


def get_picker_session(session_id: str, access_token: str) -> dict[str, Any]:
    """GET /v1/sessions/{sessionId}"""
    return _api_request("GET", f"/sessions/{session_id}", access_token)


def list_media_items(session_id: str, access_token: str) -> list[dict[str, Any]]:
    """List all PHOTO media items picked in a session (non-PHOTO items skipped).

    GET /v1/mediaItems?sessionId=
    Docs: https://developers.google.com/photos/picker/reference/rest/v1/mediaItems/list
    """
    items: list[dict[str, Any]] = []
    page_token: str | None = None
    while True:
        params: dict[str, str] = {"sessionId": session_id}
        if page_token:
            params["pageToken"] = page_token
        result = _api_request("GET", "/mediaItems", access_token, params=params)
        for item in result.get("mediaItems", []):
            # Skip non-PHOTO items (videos, albums) before download
            media_file = item.get("mediaFile", {})
            mime = media_file.get("mimeType", "")
            if not mime.startswith("image/"):
                continue
            items.append(item)
        page_token = result.get("nextPageToken")
        if not page_token:
            break
    return items


def download_media_item(item: dict[str, Any], access_token: str = "") -> bytes | None:
    """Download a media item using its baseUrl.

    Per: https://developers.google.com/photos/picker/guides/access-media-items
    baseUrl downloads require Authorization: Bearer <token>.
    Append =w2048 for images to get up to 2048px (our target is 512px).
    """
    base_url = item.get("mediaFile", {}).get("baseUrl")
    if not base_url:
        return None
    url = base_url + "=w2048"
    headers: dict[str, str] = {}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            print(
                f"  Error: HTTP {e.code} downloading media item. "
                f"Token may be expired — re-run to refresh."
            )
        else:
            print(f"  Warning: download failed (HTTP {e.code})")
        return None
    except Exception as e:
        print(f"  Warning: download failed: {type(e).__name__}")
        return None


# Alias for pick.py-internal use (also imported by tests)
resize_strip_to_bytes = resize_strip_image


# ──────────────────────────────────────────────────────────────────────────────
# places.json helpers (thin wrappers, share logic with apply.py)
# ──────────────────────────────────────────────────────────────────────────────

def _load_places() -> dict:
    if PLACES_JSON.exists():
        with open(PLACES_JSON, encoding="utf-8") as f:
            return json.load(f)
    return {"sample": False, "places": []}


def _save_places(places: dict) -> None:
    PLACES_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(PLACES_JSON, "w", encoding="utf-8") as f:
        json.dump(places, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ──────────────────────────────────────────────────────────────────────────────
# Main pick flow
# ──────────────────────────────────────────────────────────────────────────────

def _month_hint(visits: list[dict]) -> str:
    if not visits:
        return ""
    start = visits[0].get("start", "")
    if len(start) >= 7:
        try:
            dt = datetime.strptime(start[:7], "%Y-%m")
            return dt.strftime("%b %Y")
        except ValueError:
            pass
    return start[:7]


def pick_photos_for_city(
    city: dict,
    country_name: str,
    secret: dict,
    token: dict,
    token_path: Path,
    places: dict,
    photos_written: list[str],
    slots_added: list[str],
) -> int:
    """Open Picker for one city, download selected photos. Returns count written.

    Refreshes the access token before each city to guard against expiry during
    a long multi-city run.
    """
    city_id = city.get("id") or _make_id(city.get("name", "city"))
    city_name = city.get("name", "")
    country_iso = city.get("country_iso", "")
    country_id = city.get("country_id") or _make_id(country_name)
    line = city.get("line", "Visited")
    visits = city.get("visits", [])
    month_hint = _month_hint(visits)

    print(f"\n  City: {city_name}, {country_name} ({month_hint})")

    # Refresh token at the start of each city (guards long multi-city runs)
    try:
        access_token = ensure_fresh_token(secret, token, token_path)
    except PickerError as e:
        print(f"  Error: could not refresh token: {e}")
        return 0

    # Create a Picker session
    try:
        session = create_picker_session(access_token)
    except PickerError as e:
        print(f"  Error creating Picker session: {e}")
        return 0

    session_id = session.get("id", "")
    picker_uri = session.get("pickerUri", "")
    if not picker_uri:
        print("  Error: no pickerUri in session response.")
        return 0

    # Honour pollingConfig from API response; fall back to defaults
    polling_cfg = session.get("pollingConfig", {})
    poll_interval = float(polling_cfg.get("pollInterval", DEFAULT_POLL_INTERVAL_S))
    # pollingConfig.timeoutIn is a duration string like "300s"
    timeout_raw = str(polling_cfg.get("timeoutIn", f"{DEFAULT_POLL_TIMEOUT_S}s"))
    try:
        poll_timeout = float(timeout_raw.rstrip("s"))
    except ValueError:
        poll_timeout = DEFAULT_POLL_TIMEOUT_S

    # Append /autoclose so the picker tab closes itself after selection
    open_uri = picker_uri.rstrip("/") + "/autoclose"

    print(f"  Opening Picker — search for: {city_name} {month_hint}")
    print(f"  Select up to {MAX_PICKS} photos, then the tab will close automatically.")
    # Do NOT log picker_uri (contains session token info)
    webbrowser.open(open_uri)

    # Poll until mediaItemsSet = true
    print(f"  Waiting for you to finish picking ", end="", flush=True)
    deadline = time.time() + poll_timeout
    session_deleted = False
    try:
        while time.time() < deadline:
            time.sleep(poll_interval)
            print(".", end="", flush=True)
            # Refresh token on 401/403 during polling
            try:
                access_token = ensure_fresh_token(secret, token, token_path)
                state = get_picker_session(session_id, access_token)
            except PickerError as e:
                err_str = str(e)
                if "401" in err_str or "403" in err_str:
                    try:
                        access_token = ensure_fresh_token(secret, token, token_path, force=True)
                        state = get_picker_session(session_id, access_token)
                    except PickerError:
                        print(f"\n  Warning: session poll failed after token refresh.")
                        continue
                else:
                    print(f"\n  Warning: session poll failed: {e}")
                    continue
            if state.get("mediaItemsSet"):
                break
        else:
            print("\n  Timed out waiting for picker. Skipping city.")
            return 0
        print(" done.")

        # List picked PHOTO media items
        try:
            items = list_media_items(session_id, access_token)
        except PickerError as e:
            print(f"  Error listing media items: {e}")
            return 0

        if not items:
            print("  No photos picked. Skipping.")
            return 0

        print(f"  Picked {len(items)} photo(s). Downloading ...")

        PLACES_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
        place_entry = _find_place(places, country_id, country_iso)
        if place_entry is None:
            city_lat = round(float(city.get("lat", 0.0)), 2)
            city_lon = round(float(city.get("lon", 0.0)), 2)
            country_lat = round(float(city.get("country_lat", 0.0)), 2)
            country_lon = round(float(city.get("country_lon", 0.0)), 2)
            if abs(country_lat) < 0.01 and abs(country_lon) < 0.01:
                print(f"  Error: country {country_name!r} not in places.json and no lat/lon available.")
                return 0
            place_entry = _create_place(
                places, country_id, country_name, country_iso, country_lat, country_lon
            )
        city_entry = next((c for c in place_entry.get("cities", []) if c.get("id") == city_id), None)
        if not city_entry:
            city_lat = round(float(city.get("lat", 0.0)), 2)
            city_lon = round(float(city.get("lon", 0.0)), 2)
            city_entry = {
                "id": city_id,
                "name": city_name,
                "lat": city_lat,
                "lon": city_lon,
                "line": line,
            }
            place_entry.setdefault("cities", []).append(city_entry)
        else:
            city_entry["line"] = line

        existing_photos: list[str] = city_entry.get("photos", [])
        start_n = len(existing_photos) + 1

        written = 0
        for item in items[:MAX_PICKS]:
            # Refresh token before each download
            try:
                access_token = ensure_fresh_token(secret, token, token_path)
            except PickerError:
                pass

            raw = download_media_item(item, access_token=access_token)
            if not raw:
                continue
            out_bytes = resize_strip_image(raw)
            if not out_bytes:
                continue

            n = start_n
            dest_name = f"{city_id}-{n}.jpg"
            dest_path = PLACES_ASSETS_DIR / dest_name

            # Don't overwrite
            if dest_path.exists():
                print(f"    Warning: {dest_name} already exists, skipping")
                start_n += 1
                continue

            # Security: verify dest stays under PLACES_ASSETS_DIR
            try:
                dest_path.resolve().relative_to(PLACES_ASSETS_DIR.resolve())
            except ValueError:
                print(f"    Warning: destination path escapes asset dir, skipping")
                continue

            dest_path.write_bytes(out_bytes)
            start_n += 1
            written += 1

            slot_name = f"place.photo.{city_id}-{n}"
            if "photos" not in city_entry:
                city_entry["photos"] = []
            if slot_name not in city_entry["photos"]:
                city_entry["photos"].append(slot_name)
            _append_asset_slots([slot_name])
            slots_added.append(slot_name)
            photos_written.append(dest_name)
            print(f"    Written: {dest_name}")

        return written

    finally:
        # Always DELETE the session (cleanup regardless of success/failure)
        if session_id and not session_deleted:
            delete_picker_session(session_id, access_token)


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(
        description="Pick photos via Google Photos Picker API and publish to the portfolio.",
        epilog=(
            "See README.md (scripts/takeout/README.md) for one-time Google Cloud setup.\n"
            "Docs: https://developers.google.com/photos/picker/reference/rest"
        ),
    )
    parser.add_argument("approve_json", metavar="approve.json",
                        help="approve.json produced by trips.py / scan.py and edited in review.html.")
    parser.add_argument("--secret", metavar="FILE", default=str(DEFAULT_SECRET),
                        help=f"Path to client_secret JSON (default: {DEFAULT_SECRET}).")
    parser.add_argument("--token", metavar="FILE", default=str(DEFAULT_TOKEN),
                        help=f"Path to cached token JSON (default: {DEFAULT_TOKEN}).")
    args = parser.parse_args()

    approve_path = Path(args.approve_json).expanduser().resolve()
    secret_path = Path(args.secret).expanduser().resolve()
    token_path = Path(args.token).expanduser().resolve()

    # Refuse secret/token/approve inside the repo
    for p, label in [(approve_path, "approve.json"), (secret_path, "--secret"), (token_path, "--token")]:
        _refuse_inside_repo(p, label)

    if not approve_path.exists():
        print(f"Error: approve.json not found: {approve_path}", file=sys.stderr)
        sys.exit(1)

    if not secret_path.exists():
        print(f"Error: client_secret not found: {secret_path}", file=sys.stderr)
        print("See scripts/takeout/README.md for setup instructions.", file=sys.stderr)
        sys.exit(1)

    if not _PIL_OK:
        print("Error: Pillow is required for image processing: pip install Pillow", file=sys.stderr)
        sys.exit(1)

    with open(approve_path, encoding="utf-8") as f:
        approve = json.load(f)

    print("Authenticating with Google ...")
    try:
        secret = _load_secret(secret_path)
    except Exception as e:
        print(f"Error: could not read client_secret: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        access_token = get_access_token(secret_path, token_path)
    except Exception as e:
        print(f"Error: authentication failed: {e}", file=sys.stderr)
        sys.exit(1)
    print("  Authenticated.")

    # Load token for per-city refresh
    token = _load_token(token_path) or {}

    places = _load_places()
    photos_written: list[str] = []
    slots_added: list[str] = []
    cities_processed = 0

    for country_entry in approve.get("countries", []):
        country_name = country_entry.get("name", "")
        for city in country_entry.get("cities", []):
            if not city.get("approved"):
                continue
            # Pass country context into per-city function
            city_ctx = dict(city)
            city_ctx["country_id"] = country_entry.get("id") or _make_id(country_name)
            city_ctx["country_iso"] = country_entry.get("iso", "")
            city_ctx["country_lat"] = country_entry.get("lat", 0.0)
            city_ctx["country_lon"] = country_entry.get("lon", 0.0)
            pick_photos_for_city(
                city_ctx, country_name, secret, token, token_path,
                places, photos_written, slots_added,
            )
            cities_processed += 1

    _save_places(places)

    print(f"\nPick complete:")
    print(f"  Cities processed: {cities_processed}")
    print(f"  Photos written:   {len(photos_written)}")
    if slots_added:
        print(f"  Asset slots added: {len(slots_added)}")
    print(f"  places.json written.")
    print("\nRun 'npm test' to verify.")


if __name__ == "__main__":
    main()
