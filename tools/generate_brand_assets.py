#!/usr/bin/env python3
"""HD2Lab Lýra brand assets: OG card, PWA icons, apple touch icon.

Palette: Navy & Lavender (the app's dark tone) with Soft Iris accents.
Run: python3 tools/generate_brand_assets.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

BG_TOP = (9, 13, 28)
BG_BOTTOM = (15, 22, 44)
PANEL = (18, 25, 46)
BORDER = (52, 68, 114)
INK = (238, 242, 255)
BODY = (198, 208, 233)
MUTED = (148, 163, 196)
ACCENT = (167, 139, 250)
ACCENT_BRIGHT = (196, 181, 253)
IRIS = (139, 108, 232)
TINTS = [(167, 139, 250), (108, 165, 232), (95, 191, 166), (232, 165, 108)]

FONT_REGULAR = "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf"
FONT_LATIN = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_MONO = "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    if Path(path).exists():
        return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def gradient(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGB", size, BG_TOP)
    draw = ImageDraw.Draw(image)
    width, height = size
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = tuple(int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * ratio) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color)
    return image


def add_glow(image: Image.Image, center: tuple[int, int], radius: int, color: tuple[int, int, int], strength: float) -> None:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    steps = 30
    for step in range(steps, 0, -1):
        r = int(radius * step / steps)
        alpha = int(255 * strength * (1 - step / steps) ** 1.7)
        draw.ellipse([center[0] - r, center[1] - r, center[0] + r, center[1] + r], fill=(*color, alpha))
    image.paste(Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB"), (0, 0))


def rounded_panel(image: Image.Image, inset: int, radius: int) -> None:
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle(
        [inset, inset, image.width - inset, image.height - inset],
        radius=radius,
        outline=(*BORDER, 190),
        width=1,
    )
    image.paste(Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB"), (0, 0))


def mark(image: Image.Image, x: int, y: int, scale: float = 1.0, color=ACCENT_BRIGHT) -> None:
    """HD2Lab dual-square mark, same skew as the CSS .mark."""
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    width, height = 15 * scale, 20 * scale

    def skewed(offset_x: float, offset_y: float) -> list[tuple[float, float]]:
        skew = 0.42
        points = [(0, 0), (width, 0), (width, height), (0, height)]
        return [
            (x + offset_x + px - (py * 0) + (0), y + offset_y + py + px * skew)
            for px, py in points
        ]

    draw.polygon(skewed(0, 0), outline=color)
    draw.polygon(skewed(7 * scale, 6 * scale), outline=color)
    draw.line(skewed(0, 0) + [skewed(0, 0)[0]], fill=color, width=max(1, int(2 * scale)))
    image.paste(Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB"), (0, 0))


def ring(
    image: Image.Image,
    center: tuple[int, int],
    radius: int,
    progress: float,
    tint: tuple[int, int, int],
    bars: int = 4,
    amplitude: float = 0.5,
) -> None:
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    cx, cy = center
    box = [cx - radius, cy - radius, cx + radius, cy + radius]
    draw.ellipse(box, outline=(46, 60, 98, 255), width=3)
    # bar ticks
    for index in range(bars):
        angle = -math.pi / 2 + index * (2 * math.pi / bars)
        x1 = cx + math.cos(angle) * (radius - 12)
        y1 = cy + math.sin(angle) * (radius - 12)
        x2 = cx + math.cos(angle) * (radius - 19)
        y2 = cy + math.sin(angle) * (radius - 19)
        draw.line([(x1, y1), (x2, y2)], fill=(60, 76, 118, 255), width=1)
    draw.arc(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        start=-90,
        end=-90 + int(360 * max(0.0, min(1.0, progress))),
        fill=(*tint, 255),
        width=3,
    )
    inner = int(radius * 0.5)
    for i in range(18):
        x = cx - inner + int(i * (inner * 2) / 18)
        height = int(inner * 0.55 * amplitude * (0.45 + 0.55 * abs(math.sin(i * 1.7))))
        draw.line([(x, cy - height), (x, cy + height)], fill=(*tint, 210), width=2)
    image.paste(Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB"), (0, 0))


def chip(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, face, color=BODY) -> int:
    pad_x, pad_y = 14, 9
    box = draw.textbbox((0, 0), text, font=face)
    width = box[2] - box[0] + pad_x * 2
    height = box[3] - box[1] + pad_y * 2
    draw.rounded_rectangle([x, y, x + width, y + height], radius=height // 2, outline=(*BORDER, 255), width=1)
    draw.text((x + pad_x, y + pad_y - box[1]), text, font=face, fill=color)
    return width


def og_card() -> Image.Image:
    width, height = 1200, 630
    image = gradient((width, height))
    add_glow(image, (980, 120), 420, (110, 80, 200), 0.55)
    add_glow(image, (760, 620), 380, (80, 110, 200), 0.28)
    rounded_panel(image, 34, 30)

    draw = ImageDraw.Draw(image)
    # brand row
    mark(image, 78, 74, 1.35)
    draw = ImageDraw.Draw(image)
    word = font(FONT_LATIN, 27)
    draw.text((124, 70), "HD2Lab", font=word, fill=INK)
    draw.line([(258, 78), (258, 108)], fill=BORDER, width=1)
    app_font = font(FONT_REGULAR, 31)
    draw.text((276, 66), "Lýra", font=app_font, fill=ACCENT_BRIGHT, stroke_width=1, stroke_fill=ACCENT_BRIGHT)

    # headline
    headline = font(FONT_REGULAR, 66)
    draw.text((78, 162), "네 개의 트랙,", font=headline, fill=INK, stroke_width=1, stroke_fill=INK)
    draw.text((78, 238), "하나의 루프.", font=headline, fill=ACCENT_BRIGHT, stroke_width=1, stroke_fill=ACCENT_BRIGHT)

    subtitle = font(FONT_REGULAR, 25)
    draw.text((80, 336), "브라우저에서 바로 연주하고, 겹쳐 녹음하고, 내보냅니다.", font=subtitle, fill=BODY)
    draw.text((80, 372), "Multi-track loop station — instruments, FX and stems.", font=subtitle, fill=MUTED)

    label = font(FONT_REGULAR, 18)
    x = 80
    for text in ("가상악기 · 드럼", "트랙 FX · 리버브", "WAV · MP3 · Stems"):
        x += chip(draw, x, 430, text, label) + 10

    mono = font(FONT_MONO, 17)
    draw.text((80, 528), "hyangdan2.github.io/PKPilot0019", font=mono, fill=MUTED)
    badge = font(FONT_LATIN, 14)
    chip(draw, 470, 521, "100% BROWSER", badge, ACCENT_BRIGHT)

    # loop cluster, kept clear of the copy column
    ring(image, (884, 232), 74, 1.0, TINTS[0], bars=4, amplitude=0.9)
    ring(image, (1044, 302), 62, 0.72, TINTS[1], bars=4, amplitude=0.7)
    ring(image, (892, 424), 58, 0.42, TINTS[2], bars=3, amplitude=0.8)
    ring(image, (1052, 452), 46, 0.24, TINTS[3], bars=2, amplitude=0.6)

    draw = ImageDraw.Draw(image)
    caption = font(FONT_MONO, 13)
    for cx, cy, radius, text, tint in (
        (884, 232, 74, "T1 PLAY", TINTS[0]),
        (1044, 302, 62, "T2 REC", TINTS[1]),
        (892, 424, 58, "T3 OVERDUB", TINTS[2]),
        (1052, 452, 46, "T4 STOP", TINTS[3]),
    ):
        bbox = draw.textbbox((0, 0), text, font=caption)
        draw.text(
            (cx - (bbox[2] - bbox[0]) / 2, cy + radius + 14),
            text,
            font=caption,
            fill=tint,
        )
    return image


def app_icon(size: int) -> Image.Image:
    image = Image.new("RGB", (size, size), BG_TOP)
    add_glow(image, (int(size * 0.7), int(size * 0.25)), int(size * 0.7), (110, 80, 200), 0.7)
    draw = ImageDraw.Draw(image)
    margin = max(1, size // 24)
    radius = size // 5
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        outline=(*BORDER, 255),
        width=max(1, size // 110),
    )
    cx = cy = size // 2
    r = int(size * 0.31)
    track = max(2, size // 42)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(52, 68, 114), width=track)
    draw.arc([cx - r, cy - r, cx + r, cy + r], start=-90, end=200, fill=ACCENT, width=track)
    for i in range(5):
        x = cx - int(r * 0.52) + int(i * r * 1.04 / 5)
        height = int(r * (0.28 if i % 2 else 0.5))
        draw.line([(x, cy - height), (x, cy + height)], fill=ACCENT_BRIGHT, width=max(2, size // 120))
    draw.ellipse([cx - size // 22, cy - size // 22, cx + size // 22, cy + size // 22], fill=ACCENT_BRIGHT)
    return image


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    og = og_card()
    og.save(PUBLIC / "og-image.png", optimize=True)
    for size, name in ((512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")):
        app_icon(size).save(PUBLIC / name, optimize=True)
    print("wrote", PUBLIC / "og-image.png", og.size)


if __name__ == "__main__":
    main()
