"""Draws the logo and the promotional tiles of the store listings, from the geometry of assets/svg/logo.svg.

    python3 store/make-graphics.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent / "graphics"
BLUE = (37, 99, 235)
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def logo(size: int, background=None) -> Image.Image:
    """The logo of the extension at any size (the geometry of the svg, on a 128 grid)."""
    scale = 4
    s = size * scale
    k = s / 128
    image = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    draw.rounded_rectangle((0, 0, s - 1, s - 1), radius=28 * k, fill=BLUE + (255,))
    for x in (20, 52, 84):
        draw.rounded_rectangle((x * k, 24 * k, (x + 24) * k, 104 * k), radius=6 * k, fill=(255, 255, 255, 56))
    for x, y in ((23, 30), (23, 52), (55, 30), (55, 52), (55, 74), (87, 30)):
        draw.rounded_rectangle((x * k, y * k, (x + 18) * k, (y + 16) * k), radius=4 * k, fill=(255, 255, 255, 255))
    return image.resize((size, size), Image.LANCZOS)


def tile(width: int, height: int, title: str, tagline: str, name: str) -> None:
    image = Image.new("RGB", (width, height), (15, 23, 42))
    draw = ImageDraw.Draw(image)
    # A soft band of blue on the left side, to give the tile some depth.
    for x in range(width):
        shade = max(0, 1 - x / (width * 0.9))
        draw.line((x, 0, x, height), fill=(int(15 + 22 * shade), int(23 + 76 * shade), int(42 + 193 * shade)))
    if width < 800:
        # The small tile: the logo, then the name on two lines, then the line under it.
        pad = int(height * 0.1)
        mark = int(height * 0.3)
        image.paste(logo(mark), (pad, pad), logo(mark))
        title_font = ImageFont.truetype(FONT_BOLD, int(height * 0.12))
        tagline_font = ImageFont.truetype(FONT, int(height * 0.062))
        draw.text((pad + mark + pad // 2, pad + int(mark * 0.08)), "Job Application", font=title_font, fill=(255, 255, 255))
        draw.text((pad + mark + pad // 2, pad + int(mark * 0.08) + int(height * 0.14)), "Tracker", font=title_font, fill=(255, 255, 255))
        for index, line in enumerate(tagline.split("\n")):
            draw.text((pad, int(height * 0.58) + index * int(height * 0.1)), line, font=tagline_font, fill=(203, 213, 225))
    else:
        mark = int(height * 0.46)
        image.paste(logo(mark), (int(height * 0.12), (height - mark) // 2), logo(mark))
        left = int(height * 0.12) + mark + int(height * 0.1)
        title_font = ImageFont.truetype(FONT_BOLD, int(height * 0.13))
        tagline_font = ImageFont.truetype(FONT, int(height * 0.075))
        draw.text((left, int(height * 0.22)), title, font=title_font, fill=(255, 255, 255))
        for index, line in enumerate(tagline.split("\n")):
            draw.text((left, int(height * 0.22 + height * 0.17 + index * height * 0.11)), line, font=tagline_font, fill=(203, 213, 225))
    image.save(OUT / name, optimize=True)


OUT.mkdir(exist_ok=True)
for size in (128, 300, 512):
    logo(size).save(OUT / f"logo-{size}.png", optimize=True)
tile(440, 280, "Job Application\nTracker".replace("\n", " "), "Follow every application,\nin your browser.", "promo-small-en-440x280.png")
tile(440, 280, "Job Application\nTracker".replace("\n", " "), "Suivez chaque candidature,\ndans votre navigateur.", "promo-small-fr-440x280.png")
tile(1400, 560, "Job Application Tracker", "Keep the offers you saw.\nFollow each application.\nEverything stays in your browser.", "promo-marquee-en-1400x560.png")
tile(1400, 560, "Job Application Tracker", "Gardez les offres que vous avez vues.\nSuivez chaque candidature.\nTout reste dans votre navigateur.", "promo-marquee-fr-1400x560.png")
print("done")
