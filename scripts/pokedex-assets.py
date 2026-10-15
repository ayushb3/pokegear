"""Copy the Pokedex's Black/White animated sprites into public/assets/dex/ (+ a still first frame each, used
under prefers-reduced-motion). Raw pack is read-only. Prints each sprite's native size for assets.json."""
from pathlib import Path
from PIL import Image

from raw_assets import raw_dir
RAW = raw_dir() / "bw-animated"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "dex"
SPRITES = {"rotom": "479-rotom", "munchlax": "446-munchlax", "meowth": "52-meowth", "jigglypuff": "39-jigglypuff"}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, src in SPRITES.items():
        gif = RAW / f"{src}.gif"
        (OUT / f"{name}.gif").write_bytes(gif.read_bytes())
        im = Image.open(gif)
        im.seek(0)
        im.convert("RGBA").save(OUT / f"{name}-still.png")
        print(name, im.size, im.n_frames, "frames")


if __name__ == "__main__":
    main()
