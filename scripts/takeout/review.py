"""Write the self-contained review HTML page and approve.json template.

The page is OFFLINE: all styles are inlined, no external scripts.
It shows countries → cities → visit date ranges with up to 6 thumbnail
candidates per city (checkboxes to select). A "Copy selection as JSON"
button writes a JSON blob to the clipboard to paste into approve.json.

approve.json is a static template the page cannot write to directly
(it runs offline, no server). The page generates the JSON and asks the
user to copy/paste it.
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path
from typing import Any

from .cluster import Visit
from .thumbs import ThumbEntry


def _city_id(country: str, city: str) -> str:
    """Filesystem-safe city id."""
    raw = f"{country}-{city}".lower()
    return re.sub(r"[^a-z0-9]+", "-", raw).strip("-")[:40]


def _country_id(country: str) -> str:
    raw = country.lower()
    return re.sub(r"[^a-z0-9]+", "-", raw).strip("-")[:30]


def write_review(
    visits: list[Visit],
    city_thumbs: dict[str, list[ThumbEntry]],
    review_dir: Path,
) -> None:
    """
    Write review.html and approve.json to review_dir.

    Args:
        visits: from cluster.cluster()
        city_thumbs: city_id -> list[ThumbEntry] (may be empty if --no-thumbs)
        review_dir: output directory (must already exist; OUTSIDE repo)
    """
    # Build approve.json template (empty selections)
    template = _build_approve_template(visits)
    approve_path = review_dir / "approve.json"
    with open(approve_path, "w", encoding="utf-8") as f:
        json.dump(template, f, indent=2)

    # Build and write review.html
    html_content = _build_html(visits, city_thumbs, review_dir)
    (review_dir / "review.html").write_text(html_content, encoding="utf-8")


def _build_approve_template(visits: list[Visit]) -> dict[str, Any]:
    """Build the approve.json template (all cities unchecked, no photos selected)."""
    countries: dict[str, dict[str, Any]] = {}
    for v in visits:
        if v.home_flagged:
            continue
        cid = _country_id(v.country)
        if cid not in countries:
            countries[cid] = {"name": v.country, "cities": []}
        city_entry: dict[str, Any] = {
            "id": _city_id(v.country, v.city),
            "name": v.city,
            "approved": False,
            "line": "Visited",
            "visits": [{"start": v.start, "end": v.end, "days": len(v.days)}],
            "photos": [],
        }
        countries[cid]["cities"].append(city_entry)

    return {
        "_comment": (
            "Edit this file: set 'approved': true for each city/photo you want to publish. "
            "Set 'line' to a short description (shown on the Town Map). "
            "Run: python3 scripts/takeout/apply.py <this file>"
        ),
        "countries": list(countries.values()),
    }


def _build_html(
    visits: list[Visit],
    city_thumbs: dict[str, list[ThumbEntry]],
    review_dir: Path,
) -> str:
    """Build the self-contained HTML review page."""
    # Group visits by country (travel only)
    countries_order: list[str] = []
    countries_visits: dict[str, list[Visit]] = {}
    for v in visits:
        if v.home_flagged:
            continue
        c = v.country
        if c not in countries_visits:
            countries_order.append(c)
            countries_visits[c] = []
        countries_visits[c].append(v)

    flagged_visits = [v for v in visits if v.home_flagged]

    # Build JS data for the copy-JSON button
    js_data = json.dumps(_build_approve_template(visits), indent=2)
    js_data_escaped = js_data.replace("</", "<\\/")

    # Build HTML body sections
    sections_html = ""
    for country in countries_order:
        c_visits = countries_visits[country]
        cid = _country_id(country)
        sections_html += f'<section class="country" id="c-{html.escape(cid)}">\n'
        sections_html += f'  <h2>{html.escape(country)} <span class="count">({len(c_visits)} {'visit' if len(c_visits)==1 else 'visits'})</span></h2>\n'

        for v in c_visits:
            city_id = _city_id(v.country, v.city)
            thumbs = city_thumbs.get(city_id, [])
            date_range = f"{v.start} – {v.end}" if v.start != v.end else v.start
            n_days = len(v.days)

            sections_html += f'  <div class="city" data-city-id="{html.escape(city_id)}" data-country-id="{html.escape(cid)}">\n'
            sections_html += f'    <label class="city-header">\n'
            sections_html += f'      <input type="checkbox" class="city-check" data-city-id="{html.escape(city_id)}" />\n'
            sections_html += f'      <strong>{html.escape(v.city)}</strong>\n'
            sections_html += f'      <span class="date-range">{html.escape(date_range)}</span>\n'
            sections_html += f'      <span class="day-count">{n_days} day{"s" if n_days != 1 else ""}</span>\n'
            sections_html += f'    </label>\n'
            sections_html += f'    <label class="line-label">Label (shown on map):\n'
            sections_html += f'      <input type="text" class="line-input" data-city-id="{html.escape(city_id)}" placeholder="Visited" maxlength="40" />\n'
            sections_html += f'    </label>\n'

            if thumbs:
                sections_html += f'    <div class="thumbs">\n'
                for i, thumb in enumerate(thumbs):
                    rel = _relative_path(thumb.thumb_path, review_dir)
                    sections_html += (
                        f'      <label class="thumb-wrap">\n'
                        f'        <input type="checkbox" class="thumb-check" '
                        f'data-city-id="{html.escape(city_id)}" '
                        f'data-ref-id="{html.escape(thumb.ref_id)}" />\n'
                        f'        <img src="{html.escape(rel)}" loading="lazy" '
                        f'alt="Candidate photo {i+1}" />\n'
                        f'      </label>\n'
                    )
                sections_html += f'    </div>\n'

            sections_html += f'  </div>\n'
        sections_html += f'</section>\n'

    # Home-flagged summary
    if flagged_visits:
        sections_html += '<section class="flagged">\n'
        sections_html += '  <h2>Home / Work cities (flagged, not included)</h2>\n'
        sections_html += '  <ul>\n'
        for v in flagged_visits:
            sections_html += f'    <li>{html.escape(v.city)}, {html.escape(v.country)} — {len(v.days)} days</li>\n'
        sections_html += '  </ul>\n'
        sections_html += '</section>\n'

    style = """
body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:1rem 1rem 4rem;background:#f8f8f8;color:#222}
h1{border-bottom:2px solid #333;padding-bottom:.5rem}
.country{background:#fff;border-radius:8px;padding:1rem;margin-bottom:1.5rem;box-shadow:0 1px 4px rgba(0,0,0,.08)}
h2{margin:.25rem 0 .75rem;font-size:1.1rem}
.count{color:#888;font-weight:400;font-size:.9rem}
.city{border:1px solid #e0e0e0;border-radius:6px;padding:.75rem;margin-bottom:.75rem}
.city-header{display:flex;align-items:center;gap:.5rem;cursor:pointer;font-size:1rem}
.city-check{width:1.1em;height:1.1em;cursor:pointer;flex-shrink:0}
.date-range{color:#555;font-size:.85rem}
.day-count{color:#888;font-size:.8rem;margin-left:auto}
.line-label{display:block;margin:.4rem 0 .4rem 1.6rem;font-size:.85rem;color:#555}
.line-input{font-size:.85rem;padding:.2rem .4rem;border:1px solid #ccc;border-radius:4px;width:200px}
.thumbs{display:flex;flex-wrap:wrap;gap:.4rem;margin:.4rem 0 0 1.6rem}
.thumb-wrap{position:relative;cursor:pointer}
.thumb-wrap img{display:block;width:120px;height:90px;object-fit:cover;border-radius:4px;border:2px solid transparent}
.thumb-wrap input{position:absolute;top:4px;left:4px;width:1.1em;height:1.1em}
.thumb-wrap input:checked+img{border-color:#2563eb}
.flagged{background:#fff8e6;border-radius:8px;padding:1rem;margin-top:1rem}
.flagged h2{font-size:1rem;color:#7a5a00}
.actions{position:fixed;bottom:0;left:0;right:0;background:rgba(255,255,255,.95);border-top:1px solid #ddd;padding:.75rem 1rem;display:flex;gap:.75rem;justify-content:center;backdrop-filter:blur(4px)}
.btn{padding:.5rem 1.2rem;border-radius:6px;border:none;cursor:pointer;font-size:.95rem;font-weight:600}
.btn-primary{background:#2563eb;color:#fff}
.btn-primary:hover{background:#1d4ed8}
.btn-secondary{background:#f0f0f0;color:#333;border:1px solid #ccc}
pre#json-out{display:none;background:#1e1e1e;color:#d4d4d4;padding:1rem;border-radius:6px;font-size:.8rem;overflow:auto;max-height:300px;margin-top:1rem}
""".strip()

    script = r"""
const TEMPLATE = """ + js_data_escaped + r""";

function buildSelection() {
  const out = JSON.parse(JSON.stringify(TEMPLATE));
  out._comment = "Paste this into approve.json, then run: python3 scripts/takeout/apply.py <approve.json>";
  for (const country of out.countries) {
    for (const city of country.cities) {
      const check = document.querySelector(`.city-check[data-city-id="${city.id}"]`);
      if (check) city.approved = check.checked;
      const lineInput = document.querySelector(`.line-input[data-city-id="${city.id}"]`);
      if (lineInput && lineInput.value.trim()) city.line = lineInput.value.trim();
      const thumbChecks = document.querySelectorAll(`.thumb-check[data-city-id="${city.id}"]:checked`);
      city.photos = Array.from(thumbChecks).map(t => t.dataset.refId);
    }
  }
  return out;
}

document.getElementById('btn-copy').addEventListener('click', async () => {
  const sel = buildSelection();
  const text = JSON.stringify(sel, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById('btn-copy').textContent = 'Copied!';
    setTimeout(() => { document.getElementById('btn-copy').textContent = 'Copy selection as JSON'; }, 2000);
  } catch {
    const pre = document.getElementById('json-out');
    pre.style.display = 'block';
    pre.textContent = text;
  }
});

document.getElementById('btn-select-all').addEventListener('click', () => {
  document.querySelectorAll('.city-check').forEach(c => c.checked = true);
});

document.getElementById('btn-clear').addEventListener('click', () => {
  document.querySelectorAll('.city-check, .thumb-check').forEach(c => c.checked = false);
});
""".strip()

    n_travel = sum(1 for v in visits if not v.home_flagged)
    n_countries = len(countries_order)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Takeout Review — Town Map places</title>
<style>{style}</style>
</head>
<body>
<h1>Town Map — Places Review</h1>
<p>
  Found <strong>{n_travel} travel visits</strong> across <strong>{n_countries} countries</strong>.
  Check each city and photo you want to publish, set a label, then click <em>Copy selection as JSON</em>
  and paste the result into <code>approve.json</code>.
</p>
<p><em>This page is offline. No data leaves your machine.</em></p>

{sections_html}

<pre id="json-out"></pre>

<div class="actions">
  <button class="btn btn-secondary" id="btn-select-all">Select all cities</button>
  <button class="btn btn-secondary" id="btn-clear">Clear all</button>
  <button class="btn btn-primary" id="btn-copy">Copy selection as JSON</button>
</div>

<script>{script}</script>
</body>
</html>
"""


def _relative_path(path: Path, base: Path) -> str:
    """Return a relative path string from base to path, using forward slashes."""
    try:
        return str(path.relative_to(base)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")
