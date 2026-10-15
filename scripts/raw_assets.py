"""Locate the raw asset pack (private repo ayushb3/portfolio-assets).

Order: $PORTFOLIO_ASSETS, then a `portfolio-assets` clone next to this repo,
then next to the worktree folder (portfolio-wt/<name>/ -> ../../portfolio-assets).
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def raw_dir() -> Path:
    env = os.environ.get("PORTFOLIO_ASSETS")
    candidates = [Path(env)] if env else []
    candidates += [ROOT.parent / "portfolio-assets", ROOT.parent.parent / "portfolio-assets"]
    for c in candidates:
        if c.is_dir():
            return c
    raise SystemExit(
        "Raw asset pack not found. Clone it next to this repo:\n"
        "  gh repo clone ayushb3/portfolio-assets ../portfolio-assets\n"
        "or set PORTFOLIO_ASSETS to its path."
    )
