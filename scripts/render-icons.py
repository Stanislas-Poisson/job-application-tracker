"""
Render the icons of the extension from assets/svg/logo.svg into public/icon/.

Usage: python3 scripts/render-icons.py
Requires: pip install cairosvg
"""

from pathlib import Path

import cairosvg

ROOT = Path(__file__).parent.parent
SOURCE = ROOT / "assets" / "svg" / "logo.svg"
OUT = ROOT / "public" / "icon"

for size in (16, 32, 48, 96, 128):
    target = OUT / f"{size}.png"
    cairosvg.svg2png(url=str(SOURCE), write_to=str(target), output_width=size, output_height=size)
    print(f"{target.relative_to(ROOT)}")
