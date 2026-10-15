"""Bag icons for the downstairs objects (fridge, tv, corkboard, mom). Same rule as the bedroom's: a 2:1 majority
reduction of the object art, or a 1:1 top-16-row crop for the tall pieces (fridge, mom); no palette of our own.
The logic lives in make-icons.py (`make_downstairs`); this wrapper regenerates just these four.
Run: python scripts/make-downstairs-icons.py"""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("make_icons", Path(__file__).with_name("make-icons.py"))
mi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mi)

if __name__ == "__main__":
    mi.write(mi.make_downstairs())
