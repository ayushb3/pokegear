"""Slice the raw sprite pack into normalized sheets. Raw pack is never modified."""
from pathlib import Path
import os
import shutil
import subprocess
from PIL import Image

from raw_assets import raw_dir
RAW = raw_dir()
OUT = Path(__file__).resolve().parent.parent / "public" / "assets"
CELL = 32


def ethan():
    img = Image.open(RAW / "characters" / "ethan-walk.png").convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, _ = px[x, y]
            if (r, g, b) == (0, 128, 255):
                px[x, y] = (0, 0, 0, 0)
    xs, ys, w, h = [5, 26, 47], [5, 33, 61, 89], 21, 28
    # Neighbouring frames overlap the nominal cell boxes by a pixel or two, so label
    # 8-connected components over the walk block and give each to the cell holding
    # its centroid, instead of hard-cropping.
    X0, Y0, X1, Y1 = 0, 0, 5 + 3 * w + 5, 5 + 4 * h + 5
    labels = {}
    comps = []
    for y in range(Y0, Y1):
        for x in range(X0, X1):
            if px[x, y][3] and (x, y) not in labels:
                stack, pts = [(x, y)], []
                labels[(x, y)] = len(comps)
                while stack:
                    cx, cy = stack.pop()
                    pts.append((cx, cy))
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = cx + dx, cy + dy
                            if X0 <= nx < X1 and Y0 <= ny < Y1 and px[nx, ny][3] and (nx, ny) not in labels:
                                labels[(nx, ny)] = len(comps)
                                stack.append((nx, ny))
                comps.append(pts)
    sheet = Image.new("RGBA", (CELL * 3, CELL * 4), (0, 0, 0, 0))
    for pts in comps:
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        col = int((cx - 5) // w)
        row = int((cy - 5) // h)
        if not (0 <= col < 3 and 0 <= row < 4):
            continue
        for (x, y) in pts:
            dx = col * CELL + (CELL - w) // 2 + (x - xs[col])
            dy = row * CELL + (CELL - h) + (y - ys[row])
            if 0 <= dx < CELL * 3 and 0 <= dy < CELL * 4:
                sheet.putpixel((dx, dy), px[x, y])
    sheet.save(OUT / "sprites" / "ethan.png")


def lyra():
    """Same 3x4 layout as Ethan but with different origins/pitch, so find frames by
    connected component and cluster them into the 3 columns x 4 rows."""
    img = Image.open(RAW / "characters" / "lyra-walk.png").convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            if px[x, y][:3] == (0, 128, 255):
                px[x, y] = (0, 0, 0, 0)
    X1, Y1 = 100, 125  # walk block (verified visually); other sprites lie beyond
    seen, comps = set(), []
    for y in range(Y1):
        for x in range(X1):
            if px[x, y][3] and (x, y) not in seen:
                stack, pts = [(x, y)], []
                seen.add((x, y))
                while stack:
                    cx, cy = stack.pop()
                    pts.append((cx, cy))
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            n = (cx + dx, cy + dy)
                            if 0 <= n[0] < X1 and 0 <= n[1] < Y1 and px[n][3] and n not in seen:
                                seen.add(n)
                                stack.append(n)
                comps.append(pts)
    comps = [c for c in comps if len(c) > 6]

    def cluster(vals, k):
        vals = sorted(vals)
        gaps = sorted(range(1, len(vals)), key=lambda i: vals[i] - vals[i - 1], reverse=True)[: k - 1]
        cuts = sorted(vals[i] for i in gaps)
        return lambda v: sum(v >= c for c in cuts)

    cx = [sum(p[0] for p in c) / len(c) for c in comps]
    cy = [sum(p[1] for p in c) / len(c) for c in comps]
    col_of, row_of = cluster(cx, 3), cluster(cy, 4)
    cells = {}
    for c, x, y in zip(comps, cx, cy):
        cells.setdefault((row_of(y), col_of(x)), []).extend(c)
    assert len(cells) == 12, f"expected 12 lyra frames, got {len(cells)}"
    sheet = Image.new("RGBA", (CELL * 3, CELL * 4), (0, 0, 0, 0))
    for row in range(4):
        bottom = max(max(p[1] for p in cells[(row, c)]) for c in range(3))
        for col in range(3):
            pts = cells[(row, col)]
            minx, maxx = min(p[0] for p in pts), max(p[0] for p in pts)
            ox = col * CELL + (CELL - (maxx - minx + 1)) // 2 - minx
            oy = row * CELL + (CELL - 1) - bottom
            for (x, y) in pts:
                sheet.putpixel((x + ox, y + oy), px[x, y])
    sheet.save(OUT / "sprites" / "lyra.png")


def interior():
    """Cut furniture from the HGSS interior tileset. The checker background is baked in
    (204/178 grey), so it is keyed out; (115,115,115) is the baked drop shadow."""
    img = Image.open(RAW / "tiles" / "ultimatetraveler-hgss-interior.png").convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, _ = px[x, y]
            if (r, g, b) in ((204, 204, 204), (178, 178, 178)):
                px[x, y] = (0, 0, 0, 0)
            elif (r, g, b) == (115, 115, 115):
                px[x, y] = (0, 0, 0, 70)
    (OUT / "objects").mkdir(parents=True, exist_ok=True)
    # bounding boxes found by pixel analysis (non-checker pixels in each region)
    # tv updated to HGSS CRT cabinet (64,208,112,256) → 48x48 raw crop; content after
    # keying is 32x30 px (x=0-31, y=6-35) so we trim to that bounding box.
    boxes = {"bed": (122, 201, 153, 242), "pc-desk": (16, 214, 48, 244)}
    for name, box in boxes.items():
        img.crop(box).save(OUT / "objects" / f"{name}.png")
    # CRT TV: HGSS wood-cabinet CRT, screen ON. Raw crop (64,208,112,256) → 48x48;
    # after keying the checker the non-transparent content is x=0-31, y=6-35 (32x30 px).
    crt_full = img.crop((64, 208, 112, 256))
    crt_trimmed = crt_full.crop((0, 6, 32, 36))  # 32x30 – the tight content bounding box
    crt_trimmed.save(OUT / "objects" / "tv.png")


def _keyed(name, keys):
    img = Image.open(RAW / "tiles" / name).convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            if px[x, y][:3] in keys:
                px[x, y] = (0, 0, 0, 0)
    return img


def yard_grass():
    """The front yard's lawn and tall grass (decor.lawn, decor.grass), from the ThatsSoWitty OUTDOOR tileset.
    Tall grass = the green leafy autotile block at (0, 4240) (3 x 3 tiles: rounded corners, edges, fill), composed into the
    5 x 6 patch the yard lays out; its checker/key colours are keyed out so the lawn shows around the rounded edge.
    Lawn = the plain light-green brushed fill at (0, 64) (64 x 64), tiled over the whole yard (14 x 8 tiles, rows 2-9).
    The pack has no rustle / step-in-grass frames (no field-effect sheet either), so grass_fx() derives them from this patch."""
    tw = _keyed("thatssowitty-public-outdoor.png", {(255, 242, 0), (0, 183, 239), (0, 174, 239)})
    t = lambda cx, cy: tw.crop((cx * 16, 4240 + cy * 16, cx * 16 + 16, 4240 + cy * 16 + 16))
    cols, rows = 5, 6
    patch = Image.new("RGBA", (16 * cols, 16 * rows), (0, 0, 0, 0))
    for y in range(rows):
        for x in range(cols):
            cx = 0 if x == 0 else 2 if x == cols - 1 else 1
            cy = 0 if y == 0 else 2 if y == rows - 1 else 1
            patch.paste(t(cx, cy), (x * 16, y * 16))
    patch.save(OUT / "decor" / "grass.png")
    grass_fx(patch, top_edge=t(1, 0))
    fill = tw.crop((0, 64, 64, 128))
    lawn = Image.new("RGBA", (16 * 14, 16 * 8))
    for y in range(0, lawn.height, 64):
        for x in range(0, lawn.width, 64):
            lawn.paste(fill, (x, y))
    lawn.save(OUT / "decor" / "lawn.png")


# Tall-grass field effects, derived from the patch (decor.grass `rustle` / `tips`, read by src/world/grassView.ts).
RUSTLE_HEAD = 4  # px of headroom above each tile in the rustle cells, for the leaf pixels


def _shift_rows(src, rows, left_dx, right_dx):
    """A 16 x 16 tile with the given rows' left half (cols 0-7) moved by left_dx and right half by right_dx (blades leaning)."""
    out = src.copy()
    sp, op = src.load(), out.load()
    for y in rows:
        for x in range(16):
            dx = left_dx if x < 8 else right_dx
            sx = x - dx
            lo, hi = (0, 8) if x < 8 else (8, 16)
            op[x, y] = sp[sx, y] if lo <= sx < hi else (0, 0, 0, 0)
    return out


def _rustle_tile(tile, f):
    """Rustle frame f (1..3) of one 16 x 16 grass tile, as a 16 x (16 + RUSTLE_HEAD) cell: 1 = the blades part and lean out,
    2 = they spring back half way and leaves pop up, 3 = they overshoot inward, the leaves fly higher. A gap the shift opens
    over pixels the tile had is filled with the tile's darkest green (the shadow between parted blades), so the static
    tile under the effect never shows through."""
    px = tile.load()
    opaque = [px[x, y] for y in range(16) for x in range(16) if px[x, y][3]]
    if not opaque:
        return Image.new("RGBA", (16, 16 + RUSTLE_HEAD), (0, 0, 0, 0))
    dark = min(opaque, key=lambda c: c[0] + c[1] + c[2])
    light = max(opaque, key=lambda c: c[0] + c[1] + c[2])
    if f == 1:
        t = _shift_rows(tile, range(0, 10), -1, 1)
        t = _shift_rows(t, range(0, 5), -1, 1)
        leaves = []
    elif f == 2:
        t = _shift_rows(tile, range(0, 6), -1, 1)
        leaves = [(4, 2), (10, 3), (12, 1)]
    else:
        t = _shift_rows(tile, range(0, 4), 1, -1)
        leaves = [(3, 0), (11, 1)]
    tp = t.load()
    for y in range(16):
        for x in range(16):
            if px[x, y][3] and not tp[x, y][3]:
                tp[x, y] = dark
    cell = Image.new("RGBA", (16, 16 + RUSTLE_HEAD), (0, 0, 0, 0))
    cell.paste(t, (0, RUSTLE_HEAD))
    cp = cell.load()
    for (x, y) in leaves:
        if px[x, 0][3]:  # only above tiles whose top row has blades
            cp[x, y] = light
    return cell


def grass_fx(patch, top_edge):
    """decor/grass-rustle.png: frames 1-3 of every tile of the patch; frame f at x = (f-1) * patch width, tile (tx, ty) at
    (tx * 16, ty * (16 + RUSTLE_HEAD)). decor/grass-tips.png: frames 0-3 (0 = at rest = the patch's own pixels, so a tips
    sprite on a resting tile is invisible except over a sprite) of the blades that hide an actor's legs: each tile's rows
    8-15, the top 3 rows cut to the blade silhouette of the patch's own top edge (`top_edge` rows 0-2)."""
    cols, rows = patch.width // 16, patch.height // 16
    ch = 16 + RUSTLE_HEAD
    rustle = Image.new("RGBA", (patch.width * 3, rows * ch), (0, 0, 0, 0))
    tips = Image.new("RGBA", (patch.width * 4, patch.height), (0, 0, 0, 0))
    ep = top_edge.load()
    for ty in range(rows):
        for tx in range(cols):
            tile = patch.crop((tx * 16, ty * 16, tx * 16 + 16, ty * 16 + 16))
            for f in range(4):
                cell = tile if f == 0 else _rustle_tile(tile, f)
                if f:
                    rustle.paste(cell, ((f - 1) * patch.width + tx * 16, ty * ch))
                body = cell if f == 0 else cell.crop((0, RUSTLE_HEAD, 16, ch))
                tip = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
                bp, tq = body.load(), tip.load()
                for y in range(8, 16):
                    for x in range(16):
                        jag = ep[x, y - 8][3] if y < 11 else 255
                        if jag and bp[x, y][3]:
                            tq[x, y] = bp[x, y]
                tips.paste(tip, (f * patch.width + tx * 16, ty * 16))
    rustle.save(OUT / "decor" / "grass-rustle.png")
    tips.save(OUT / "decor" / "grass-tips.png")


def decor():
    """Non-interactive room decoration (decor.* slots), cut from the tile packs.
    Boxes were found by connected-component analysis of each sheet (backgrounds keyed out)."""
    (OUT / "decor").mkdir(parents=True, exist_ok=True)
    yard_grass()
    ut = _keyed("ultimatetraveler-hgss-interior.png", {(204, 204, 204), (178, 178, 178)})
    upx = ut.load()
    for y in range(ut.height):
        for x in range(ut.width):
            if upx[x, y][:3] == (115, 115, 115):
                upx[x, y] = (0, 0, 0, 70)
    for name, box in {"window": (20, 120, 60, 138), "plant": (96, 160, 112, 194), "door-mat": (64, 166, 80, 189)}.items():
        ut.crop(box).save(OUT / "decor" / f"{name}.png")
    # ThatsSoWitty: the olive/wood shop shelf (checker keyed out) works as a low bookshelf
    tw = _keyed("thatssowitty-public-interior.png", {(0, 183, 239), (255, 242, 0)})
    tw.crop((32, 1906, 64, 1938)).save(OUT / "decor" / "bookshelf.png")
    # Downstairs (all ThatsSoWitty, native 16 px tiles, same style as the bedroom pieces)
    tw.crop((81, 2401, 97, 2433)).save(OUT / "objects" / "fridge.png")  # white-blue fridge, exactly 1 x 2 tiles
    # Stairs: ThatsSoWitty interior sheet is native 16 px tiles — no scaling.
    # stairs-down (bedroom, player descends): enclosed red-brick box stairway, 36x40 px native incl. padding.
    # The component is 34 px wide (2 px of drop shadow on the right): pad 2 px on the LEFT (36 wide, even) so the 32 px
    # body stays centred on the warp tile under the bottom-centre anchor and the shadow hangs to the right.
    sd = Image.new("RGBA", (36, 40), (0, 0, 0, 0))
    sd.paste(tw.crop((32, 1200, 66, 1240)), (2, 0))
    sd.save(OUT / "decor" / "stairs-down.png")
    # stairs-up (downstairs, player ascends): mirrored enclosed stairway (the glued 16 px arrival mat is dropped), 32x40 px native.
    # Cropped from x=80 (not 78): the 2 left columns are shadow that would hang up-left; without them the body is exactly
    # 32 px wide, even and centred, and the drop shadow only falls down-right (art rule 5).
    tw.crop((80, 1264, 112, 1304)).save(OUT / "decor" / "stairs-up.png")
    # Kitchen appliances: separate stove and sink (replacing the old combined counter composite).
    # Stove: standalone stove+oven, 32x32 native px (even width = clean half-pixel-free anchor).
    tw.crop((96, 2400, 128, 2432)).save(OUT / "decor" / "stove.png")
    # Rugs: ThatsSoWitty native rounded rugs (62x38), padded to an even 64x38 (1 px transparent each side).
    # Bedroom = blue (objects/rug.png, slot decor.rug), downstairs = beige (decor/rug-beige.png, slot decor.rug-beige).
    for name, box, dest in (("rug", (1, 2997, 63, 3035), OUT / "objects"), ("rug-beige", (1, 3046, 63, 3084), OUT / "decor")):
        rug = Image.new("RGBA", (64, 38), (0, 0, 0, 0))
        rug.paste(tw.crop(box), (1, 0))
        rug.save(dest / f"{name}.png")
    # Sink B#1: kitchen sink + cabinet, 32x32 native px.
    tw.crop((64, 2816, 96, 2848)).save(OUT / "decor" / "sink.png")
    # Mom NPC sprite: mom-walk.png is 2x-upscaled art (256x256, 4x4 grid of 64x64 cells).
    # Row 0 = facing down; col 1 = standing frame.
    # Step 1: halve the 64x64 cell to 32x32 (lossless nearest-neighbour, same pixel density as the player).
    # Step 2: tight-crop to sprite content.
    mom_img = Image.open(RAW / "characters" / "mom-walk.png").convert("RGBA")
    mom_cell_2x = mom_img.crop((64, 0, 128, 64))  # col 1, row 0 (down-facing stand), 64x64 2x art
    mom_cell = mom_cell_2x.resize((32, 32), Image.NEAREST)   # halve to 32x32 native
    mom_px = mom_cell.load()
    pts = [(x, y) for y in range(32) for x in range(32) if mom_px[x, y][3] > 0]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    mom_cell.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1)).save(OUT / "objects" / "mom.png")
    # Dining table: Mew 32 px RMXP table (96 x 72), halved nearest-neighbour to the 16 px grid
    mew = Image.open(RAW / "tiles" / "mew-gen4-interior-new.png").convert("RGBA")
    mt = mew.crop((0, 1048, 96, 1120))
    mt.resize((48, 36), Image.NEAREST).save(OUT / "decor" / "table.png")


def emotes():
    """Slice HGSS emotion bubbles from characters/emotions.png.

    The sheet is native-density pixel art: 140 x 130 px.
    Orange background (255, 128, 0) is keyed to transparent.

    Cell layout (measured from orange gap analysis):
      Column x-starts: 4, 20, 38, 54, 72, 88, 106, 122  (each cell 15 px wide)
      Row y-starts:    4, 21, 38                         (each cell 16 px tall)
      8 columns x 3 rows of bubble emotes; rows 3-4 hold a character sprite + watermark.

    Each emote occupies 2 consecutive cells (frame0=col, frame1=col+1).
    We export a 2-frame horizontal strip: 30 x 16 px per emote.
    Frame 0 = first cell (filled colour = pop-complete pose, shown after pop-in).
    Frame 1 = second cell (alternate pose, not used in current pop-in animation).

    Emote → (row, col0):
        ellipsis  (…): row 0, col 0
        note      (♪): row 0, col 2
        exclaim   (!): row 1, col 0
        heart     (♥): row 1, col 2
        question  (?): row 2, col 0
    """
    src = Image.open(RAW / "characters" / "emotions.png").convert("RGBA")
    px = src.load()
    bg = (255, 128, 0)
    for y in range(src.height):
        for x in range(src.width):
            if px[x, y][:3] == bg:
                px[x, y] = (0, 0, 0, 0)

    # x-start of each of the 8 columns; each cell is CW px wide
    COL_X = [4, 20, 38, 54, 72, 88, 106, 122]
    # y-start of each of the 3 bubble rows; each cell is CH px tall
    ROW_Y = [4, 21, 38]
    CW, CH = 15, 16   # native cell dimensions

    (OUT / "emotes").mkdir(parents=True, exist_ok=True)

    def save_emote(name: str, row: int, col0: int):
        """Extract two consecutive cells (col0 and col0+1) as a 2-frame horizontal strip."""
        y0 = ROW_Y[row]
        strip = Image.new("RGBA", (CW * 2, CH), (0, 0, 0, 0))
        for frame, col in enumerate([col0, col0 + 1]):
            x0 = COL_X[col]
            cell = src.crop((x0, y0, x0 + CW, y0 + CH))
            strip.paste(cell, (frame * CW, 0))
        strip.save(OUT / "emotes" / f"{name}.png")

    save_emote("ellipsis", 0, 0)
    save_emote("note",     0, 2)
    save_emote("exclaim",  1, 0)
    save_emote("heart",    1, 2)
    save_emote("question", 2, 0)


def oshawott():
    img = Image.open(RAW / "pokemon-overworld" / "gen5-overworld-fan.png").convert("RGBA")
    x0 = 0
    # output rows: down, left, up, right; cols: 2 walk frames
    src = {
        "down": [(x0, 448), (x0, 480)],
        "left": [(32, 384), (32, 416)],
        "up": [(x0, 384), (x0, 416)],
        "right": [(32, 448), (32, 480)],
    }
    sheet = Image.new("RGBA", (CELL * 2, CELL * 4), (0, 0, 0, 0))
    for row, d in enumerate(["down", "left", "up", "right"]):
        for col, (x, y) in enumerate(src[d]):
            sheet.paste(img.crop((x, y, x + CELL, y + CELL)), (col * CELL, row * CELL))
    sheet.save(OUT / "sprites" / "oshawott.png")


def journal_stand():
    """Draw a 16x22 commit-log stand: a small side table (palette from the in-room pc-desk)
    with a flat open book lying on its surface, seen from the HGSS top-down angle.

    Art layout (bottom-centre anchored on 1x1 footprint = 16px):
      y  0-5   book lying flat on table (6px, drawn top-down: spine=1px top, pages=4px, edge=1px)
      y  6-9   table top surface (#e8d8a0 / #c0b068 highlight, matching pc-desk surface rows 10-17)
      y 10-13  table front face (#808860 / #000000, matching pc-desk rows 18-23)
      y 14-21  table legs (grey #cccccc/#b2b2b2, 8px, matching pc-desk dark leg area)

    Overhang: 22-16=6px → top 6 rows (book) go to foreground layer.  The bottom 16px (table
    surface + face + legs) sit in the background.  The book is thus visible resting on the
    table surface edge, not floating mid-air.

    Colors taken directly from pc-desk.png (the existing room desk), keeping the same palette.
    No raw-pack source needed — drawn from palette only (native 1x).
    """
    from PIL import ImageDraw

    W, H = 16, 22
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)

    # Palette from pc-desk (ultimatetraveler interior sheet, checker-keyed, 1x native)
    OUTLINE    = (0x40, 0x40, 0x40, 255)
    TBL_HI     = (0xc0, 0xb0, 0x68, 255)   # golden highlight edge (#c0b068)
    TBL_SURF   = (0xe8, 0xd8, 0xa0, 255)   # main tan surface (#e8d8a0)
    TBL_FRONT  = (0x80, 0x88, 0x60, 255)   # lower front face (#808860)
    TBL_DARK   = (0x00, 0x00, 0x00, 255)   # deep shadow / outline (#000000)
    LEG_WOOD   = (0xc0, 0xb0, 0x68, 255)   # wood legs: the table's own highlight tan
    LEG_WOOD_D = (0x80, 0x88, 0x60, 255)   # wood leg shadow: the table's front-face olive
    DROP       = (0x00, 0x00, 0x00, 70)    # drop shadow (alpha 70 like every pack shadow and the piano)

    # --- y=0-5: open book lying flat, seen from above/slightly front ---
    # The book is 14px wide (1px margin each side), 6px tall.
    # Row 0: outline top edge (spine visible as dark line at back)
    d.rectangle([1, 0, 14, 0], fill=OUTLINE)
    # Row 1: spine color (teal #2f6f8f matching the book frame color from the original art)
    SPINE = (0x2f, 0x6f, 0x8f, 255)
    d.rectangle([1, 1, 14, 1], fill=SPINE)
    # Rows 2-4: open pages (cream #f0e8d0, with a centre crease line and text lines)
    PAGE   = (0xf0, 0xe8, 0xd0, 255)
    INK    = (0x60, 0x60, 0x70, 255)
    d.rectangle([1, 2, 14, 4], fill=PAGE)
    # centre crease (gutter between left and right pages)
    d.rectangle([7, 2, 8, 4], fill=SPINE)
    # tiny ink lines on left page
    d.rectangle([2, 2, 5, 2], fill=INK)
    d.rectangle([2, 4, 5, 4], fill=INK)
    # tiny ink lines on right page
    d.rectangle([9, 2, 12, 2], fill=INK)
    d.rectangle([9, 4, 12, 4], fill=INK)
    # Row 5: outline bottom edge of book (where it meets the table surface)
    d.rectangle([1, 5, 14, 5], fill=OUTLINE)

    # --- y=6-7: table top surface highlight band ---
    d.rectangle([0, 6, 15, 6], fill=OUTLINE)   # top border of table
    d.rectangle([0, 7, 15, 7], fill=TBL_HI)

    # --- y=8-9: main table surface (tan) ---
    d.rectangle([0, 8, 15, 9], fill=TBL_SURF)

    # --- y=10-11: lower surface edge ---
    d.rectangle([0, 10, 15, 10], fill=TBL_HI)
    d.rectangle([0, 11, 15, 11], fill=TBL_FRONT)

    # --- y=12-13: table front face ---
    d.rectangle([0, 12, 15, 12], fill=TBL_FRONT)
    d.rectangle([0, 13, 15, 13], fill=TBL_DARK)

    # --- y=14-21: table legs (2 legs, grey, with drop shadow) ---
    # leg positions: left leg x=1-3, right leg x=12-14
    for lx in (1, 12):
        d.rectangle([lx,     14, lx + 2, 21], fill=LEG_WOOD)
        d.rectangle([lx + 2, 14, lx + 2, 21], fill=LEG_WOOD_D)
        d.rectangle([lx,     21, lx + 2, 21], fill=OUTLINE)
    # drop shadow under the legs
    # (row 21 holds the legs' bottom outline at x 1-3 and 12-14; draw the shadow only between/after them)
    for x in range(0, 16):
        if not (1 <= x <= 3 or 12 <= x <= 14):
            d.point((x, 21), fill=DROP)

    canvas.save(OUT / "objects" / "journal.png")


if __name__ == "__main__":
    (OUT / "sprites").mkdir(parents=True, exist_ok=True)
    (OUT / "fonts").mkdir(parents=True, exist_ok=True)
    ethan(); lyra(); oshawott(); interior(); decor(); journal_stand(); emotes()  # fonts: build-font.py
    print("ok")
