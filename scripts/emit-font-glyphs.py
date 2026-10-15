"""Emit src/content/fontGlyphs.json: sorted list of Unicode codepoints in the HGSS pixel font.

Run after scripts/build-font.py regenerates public/assets/fonts/hgss.ttf.
The JSON is committed so vitest can assert pixel-font strings only use covered glyphs.

Usage: python scripts/emit-font-glyphs.py
"""
import json
from pathlib import Path
from fontTools.ttLib import TTFont

FONT = Path(__file__).resolve().parent.parent / "public" / "assets" / "fonts" / "hgss.ttf"
OUT = Path(__file__).resolve().parent.parent / "src" / "content" / "fontGlyphs.json"


def main() -> None:
    f = TTFont(str(FONT))
    cmap = f.getBestCmap()
    cps = sorted(cmap.keys())
    OUT.write_text(json.dumps(cps, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(cps)} codepoints)")


if __name__ == "__main__":
    main()
