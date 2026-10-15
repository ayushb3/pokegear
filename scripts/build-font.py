"""Build public/assets/fonts/hgss.ttf from the HGSS bitmap font sheet (second panel).

Sheet geometry (measured): glyph cells are 16x16 on a grid starting at (24, 192).
Glyph colour is (82,82,90) / (99,99,107); (165,165,173) is the baked drop shadow, which is
dropped here (CSS adds the shadow). Each ink pixel becomes a square contour; 1 native pixel
= 100 font units, em = 16 pixels = 1600 units, so the font is pixel-exact at font-size N*16px.
Advance = inked width + 1px spacing (proportional), space = 4px.
"""
from pathlib import Path
from PIL import Image
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

from raw_assets import raw_dir
RAW = raw_dir() / "ui" / "fonts.png"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "fonts" / "hgss.ttf"
OX, OY, PITCH = 24, 192, 16
INK = {(82, 82, 90), (99, 99, 107)}
PX = 100  # font units per native pixel
EM = 16 * PX
ASCENT_ROWS = 12  # caps sit on row 11, so the baseline is the bottom of row 11

ROW1 = list("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm")
ROW2 = list("nopqrstuvwxyz") + list("ÀÁÂÄÇÈÉÊËÌÍÎÏÑÒÓÔÖ×ÙÚÛÜßàáâäåçèéêëìí")
ROW3 = list("îïñòóôö÷ùúûü") + ["Œ", "œ", "ª", "º", None, None, None, None, "¡", "¿", "!", "?", ",", ".", "…", "·", "/",
                              "\u2018", "\u2019", "\u201c", "\u201d", "\u201e", "«", "»", "(", ")", "♂", "♀", "+", "-", "*", "#", "=", "&", "~", ":", ";"]
# ASCII stand-ins that map onto the typographic glyphs
ALIASES = {"'": "\u2019", '"': "\u201d", "\u2212": "-", "\u2013": "-"}

# hand-drawn extras (rows of X); (top row inside the 16px cell)
EXTRA = {
    "\u25b6": (4, ["X...", "XX..", "XXX.", "XXXX", "XXX.", "XX..", "X..."]),  # list cursor
    "\u25bc": (6, ["XXXXXXX", ".XXXXX.", "..XXX..", "...X..."]),  # dialogue "more" arrow
    "\u2014": (8, ["XXXXXXXX"]),  # em dash
}


def main():
    im = Image.open(RAW).convert("RGBA")
    glyphs = {}  # char -> (advance, rows of (y, x0, x1) runs)

    def grab(ch, col, row):
        px0, py0 = OX + col * PITCH, OY + row * PITCH
        ink = [[im.getpixel((px0 + x, py0 + y))[:3] in INK for x in range(PITCH)] for y in range(PITCH)]
        xs = [x for y in range(PITCH) for x in range(PITCH) if ink[y][x]]
        if not xs:
            return
        minx, maxx = min(xs), max(xs)
        runs = []
        for y in range(PITCH):
            x = minx
            while x <= maxx:
                if ink[y][x]:
                    s = x
                    while x <= maxx and ink[y][x]:
                        x += 1
                    runs.append((y, s - minx, x - minx))
                else:
                    x += 1
        glyphs[ch] = (maxx - minx + 1 + 1, runs)

    for row, chars in enumerate((ROW1, ROW2, ROW3)):
        for col, ch in enumerate(chars):
            if ch:
                grab(ch, col, row)
    for ch, (top, rows) in EXTRA.items():
        runs = []
        for dy, line in enumerate(rows):
            x = 0
            while x < len(line):
                if line[x] == "X":
                    s = x
                    while x < len(line) and line[x] == "X":
                        x += 1
                    runs.append((top + dy, s, x))
                else:
                    x += 1
        glyphs[ch] = (max(len(r) for r in rows) + 1, runs)
    glyphs[" "] = (4, [])
    for alias, target in ALIASES.items():
        glyphs[alias] = glyphs[target]

    def name(ch):
        return "space" if ch == " " else f"u{ord(ch):04X}"

    order = [".notdef"] + [name(c) for c in glyphs]
    pen_glyphs, metrics, cmap = {}, {}, {}

    def draw(runs):
        pen = TTGlyphPen(None)
        for (y, x0, x1) in runs:
            top = (ASCENT_ROWS - y) * PX
            bot = top - PX
            # clockwise = filled in TrueType
            pen.moveTo((x0 * PX, bot))
            pen.lineTo((x0 * PX, top))
            pen.lineTo((x1 * PX, top))
            pen.lineTo((x1 * PX, bot))
            pen.closePath()
        return pen.glyph()

    pen_glyphs[".notdef"] = draw([(3 + 0, 0, 5), (3 + 8, 0, 5)] + [(y, 0, 1) for y in range(4, 11)] + [(y, 4, 5) for y in range(4, 11)])
    metrics[".notdef"] = (6 * PX, 0)
    for ch, (adv, runs) in glyphs.items():
        n = name(ch)
        pen_glyphs[n] = draw(runs)
        metrics[n] = (adv * PX, 0)
        cmap[ord(ch)] = n

    fb = FontBuilder(EM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(pen_glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENT_ROWS * PX, descent=-(16 - ASCENT_ROWS) * PX)
    fb.setupNameTable({"familyName": "HGSS Pixel", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=ASCENT_ROWS * PX, sTypoDescender=-(16 - ASCENT_ROWS) * PX, sTypoLineGap=0,
                usWinAscent=ASCENT_ROWS * PX, usWinDescent=(16 - ASCENT_ROWS) * PX)
    fb.setupPost()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fb.save(str(OUT))
    print("wrote", OUT, len(glyphs), "glyphs")


if __name__ == "__main__":
    main()
