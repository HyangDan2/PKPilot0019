#!/usr/bin/env python3
"""HD2Lab Lýra brand assets — one mark, one card.

Everything here derives from the official Web-HQ dual-skew geometry that
PKPilot0018 (Sigrún) uses: two sheared frames (vertical sides, 26.57° rise on
the top and bottom edges) crossing each other, the front frame offset right and
down. The app header, favicon set, PWA icons and the Open Graph card all read
from `geometry()`, so the four can never drift apart again.

The card is the HD2Lab standard layout in Soft Iris light: #FAFAFD with a faint
40px lavender grid, the lockup top-left, a mono eyebrow, a two-line headline,
sub-copy, pill chips, the project URL bottom-right, and a white panel on the
right carrying a session preview drawn from the real app palette.

    python3 tools/generate_brand_assets.py

Outputs (public/): og-image.png (1200x630), favicon.svg, favicon-32x32.png,
apple-touch-icon.png (180), favicon.ico (16/32/48), icon-192.png, icon-512.png.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public"

# ── palette (Soft Iris) ────────────────────────────────────────────────────
BACKGROUND = "#FAFAFD"
SURFACE = "#FFFFFF"
SURFACE_2 = "#F4F1FC"
BORDER = "#E8E4F2"
BORDER_SOFT = "#EFEBF7"
LINE_STRONG = "#D4CCE8"
INK = "#1D192B"
BODY = "#544E68"
MUTED = "#7C7690"
ACCENT = "#8B6CE8"
ACCENT_TEXT = "#6B4CD6"
ACCENT_SOFT = "#F1ECFE"
RECORD = "#E0524A"
OVERDUB = "#D98A4B"
OK = "#2F8A5B"
TINTS = ["#8B6CE8", "#5B9BD5", "#3FA88A", "#D98A4B"]

FONT_REGULAR = "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf"
FONT_MONO_KR = "/usr/share/fonts/pickle-hwp/NotoSansMonoCJKkr-Regular.otf"
FONT_LATIN_B = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_LATIN = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
FONT_MONO = "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf"
FONT_MONO_B = "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf"

# ── the official mark, in 64-viewBox units ─────────────────────────────────
ANG = 0.5          # tan of the rise of the top/bottom edges (26.57 deg)
W, H, T = 20.0, 32.8, 4.0   # frame width, frame height, stroke
DX, DY = 14.0, 11.1         # front frame offset, right and down
CENTRE = (32.0, 33.4)       # optical centre inside the 64 box


def _offset(poly, d: float):
    """Offset a convex polygon by d (positive = outward) with miter joins."""
    n = len(poly)
    area = 0.0
    for i in range(n):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % n]
        area += x0 * y1 - x1 * y0
    sign = 1.0 if area > 0 else -1.0
    lines = []
    for i in range(n):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % n]
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy)
        nx, ny = sign * dy / length, -sign * dx / length
        lines.append((nx, ny, nx * x0 + ny * y0 + d))
    out = []
    for i in range(n):
        a1, b1, c1 = lines[i - 1]
        a2, b2, c2 = lines[i]
        det = a1 * b2 - a2 * b1
        out.append(((c1 * b2 - c2 * b1) / det, (a1 * c2 - a2 * c1) / det))
    return out


def _frame(x: float, ytop: float):
    rect = [(x, ytop), (x + W, ytop), (x + W, ytop + H), (x, ytop + H)]
    sheared = [(px, py - ANG * px) for px, py in rect]
    return _offset(sheared, T / 2), _offset(sheared, -T / 2)


def geometry():
    """Both frame rings, centred in the 64-unit viewBox."""
    o1, i1 = _frame(0.0, 0.0)
    o2, i2 = _frame(DX, DY)
    xs = [p[0] for p in o1 + o2]
    ys = [p[1] for p in o1 + o2]
    ox = CENTRE[0] - (min(xs) + max(xs)) / 2
    oy = CENTRE[1] - (min(ys) + max(ys)) / 2
    shift = lambda poly: [(x + ox, y + oy) for x, y in poly]  # noqa: E731
    return shift(o1), shift(i1), shift(o2), shift(i2)


def _path(outer, inner) -> str:
    pts = lambda poly: "M" + "L".join(f"{x:.3f} {y:.3f}" for x, y in poly) + "Z"  # noqa: E731
    return pts(outer) + pts(inner)


def mark_paths() -> tuple[str, str]:
    o1, i1, o2, i2 = geometry()
    return _path(o1, i1), _path(o2, i2)


def svg() -> str:
    first, second = mark_paths()
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">'
        f'<rect width="64" height="64" rx="12" fill="{BACKGROUND}" stroke="{BORDER}" stroke-width="2"/>'
        f'<path fill="{ACCENT}" fill-rule="evenodd" d="{first}"/>'
        f'<path fill="{ACCENT}" fill-rule="evenodd" d="{second}"/>'
        "</svg>\n"
    )


def icon(size: int, *, rounded: bool = True) -> Image.Image:
    """Rounded-square icon carrying the official mark, at `size` px."""
    ss = 8 if size <= 64 else 4
    S = size * ss
    u = S / 64.0
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(
        [0, 0, S - 1, S - 1], radius=12 * u, fill=BACKGROUND, outline=BORDER,
        width=max(1, round(2 * u)),
    )
    o1, i1, o2, i2 = geometry()
    mask = np.zeros((S, S), dtype=bool)
    for o, i in ((o1, i1), (o2, i2)):
        ring = Image.new("L", (S, S), 0)
        rd = ImageDraw.Draw(ring)
        rd.polygon([(x * u, y * u) for x, y in o], fill=255)
        rd.polygon([(x * u, y * u) for x, y in i], fill=0)
        mask |= np.array(ring) > 127
    img.paste(Image.new("RGBA", (S, S), ACCENT), (0, 0),
              Image.fromarray((mask * 255).astype("uint8")))
    return img.resize((size, size), Image.LANCZOS)


# ── OG card ────────────────────────────────────────────────────────────────
S = 2                      # supersample factor
CW, CH = 1200, 630


def _font(path: str, size: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, int(round(size * S)))


def _xy(x: float, y: float):
    return (x * S, y * S)


def _box(x0: float, y0: float, x1: float, y1: float):
    return [x0 * S, y0 * S, x1 * S, y1 * S]


def text(draw, x, y, value, font, fill, anchor="la"):
    draw.text(_xy(x, y), value, font=font, fill=fill, anchor=anchor)


def spaced(draw, x, y, value, font, fill, spacing):
    for ch in value:
        draw.text(_xy(x, y), ch, font=font, fill=fill, anchor="la")
        x += draw.textlength(ch, font=font) / S + spacing


def dashed(draw, p0, p1, fill, width=1.0, dash=5, gap=4):
    x0, y0 = p0
    x1, y1 = p1
    length = math.hypot(x1 - x0, y1 - y0)
    if not length:
        return
    ux, uy = (x1 - x0) / length, (y1 - y0) / length
    pos = 0.0
    while pos < length:
        end = min(length, pos + dash)
        draw.line([_xy(x0 + ux * pos, y0 + uy * pos), _xy(x0 + ux * end, y0 + uy * end)],
                  fill=fill, width=max(1, int(width * S)))
        pos = end + gap


def stroke(img, poly, color, width):
    """Fill a convex polygon's ring (miter corners) onto img."""
    scaled = [(x * S, y * S) for x, y in poly]
    half = width * S / 2
    mask = Image.new("L", img.size, 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.polygon(_offset(scaled, half), fill=255)
    mdraw.polygon(_offset(scaled, -half), fill=0)
    img.paste(Image.new("RGBA", img.size, color), (0, 0), mask)


def skewed_rect(x, y, w, h):
    """CSS `transform: skewY(-23deg)` around the rect's top-left corner."""
    t = math.tan(math.radians(23))
    return [(x, y), (x + w, y - w * t), (x + w, y + h - w * t), (x, y + h)]


def brand_mark(img, x, y, scale, color=ACCENT):
    """Draw the two-frame mark with its top-left corner at (x, y)."""
    o1, i1, o2, i2 = geometry()
    for o, i in ((o1, i1), (o2, i2)):
        shift = [( (px - 8) * scale + x, (py - 8) * scale + y) for px, py in o]
        inner = [( (px - 8) * scale + x, (py - 8) * scale + y) for px, py in i]
        stroke(img, shift, color, 0.0)
        mask = Image.new("L", img.size, 0)
        md = ImageDraw.Draw(mask)
        md.polygon([(px * S, py * S) for px, py in shift], fill=255)
        md.polygon([(px * S, py * S) for px, py in inner], fill=0)
        img.paste(Image.new("RGBA", img.size, color), (0, 0), mask)


def chip(draw, x, y, label, font, height=33):
    tw = draw.textlength(label, font=font) / S
    w = tw + 30
    draw.rounded_rectangle(_box(x, y, x + w, y + height), radius=height / 2,
                           fill=SURFACE, outline=BORDER, width=int(1.1 * S))
    text(draw, x + 15, y + height / 2 - font.size / (2 * S) + 1.2, label, font, BODY)
    return w


def ring_preview(draw, cx, cy, radius, progress, tint, bars=4):
    draw.ellipse(_box(cx - radius, cy - radius, cx + radius, cy + radius),
                 outline=BORDER_SOFT, width=int(4.5 * S))
    draw.arc(_box(cx - radius, cy - radius, cx + radius, cy + radius),
             start=-90, end=-90 + int(360 * progress), fill=tint, width=int(4.5 * S))
    for index in range(bars):
        angle = -math.pi / 2 + index * (2 * math.pi / bars)
        draw.line([
            _xy(cx + math.cos(angle) * (radius - 3), cy + math.sin(angle) * (radius - 3)),
            _xy(cx + math.cos(angle) * (radius - 9), cy + math.sin(angle) * (radius - 9)),
        ], fill=LINE_STRONG, width=S)


def wave(draw, cx, cy, width, height, tint, seed=0.0):
    bars = 17
    step = width / bars
    for i in range(bars):
        amp = height * (0.32 + 0.68 * abs(math.sin(i * 1.7 + seed)))
        x = cx - width / 2 + i * step + step / 2
        draw.line([_xy(x, cy - amp / 2), _xy(x, cy + amp / 2)], fill=tint,
                  width=max(1, int(1.9 * S)))


def og_card() -> Image.Image:
    image = Image.new("RGB", (CW * S, CH * S), BACKGROUND)

    # faint 40px lavender grid
    grid = Image.new("RGBA", image.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, CW + 1, 40):
        gd.line([_xy(x, 0), _xy(x, CH)], fill=(139, 108, 232, 6), width=S)
    for y in range(0, CH + 1, 40):
        gd.line([_xy(0, y), _xy(CW, y)], fill=(139, 108, 232, 6), width=S)
    image = Image.alpha_composite(image.convert("RGBA"), grid).convert("RGB")

    # white wash top-left, lavender glow bottom-right
    glow = Image.new("L", image.size, 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse(_box(-320, -420, 560, 320), fill=130)
    image.paste(Image.new("RGB", image.size, (255, 255, 255)), (0, 0),
                glow.filter(ImageFilter.GaussianBlur(150 * S)))
    glow = Image.new("L", image.size, 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse(_box(860, 380, 1520, 1040), fill=30)
    image.paste(Image.new("RGB", image.size, (167, 139, 250)), (0, 0),
                glow.filter(ImageFilter.GaussianBlur(150 * S)))

    # ── lockup: mark + HD2Lab | Lýra + LOOP STATION ────────────────────────
    brand_mark(image, 66, 56, 1.16)
    draw = ImageDraw.Draw(image)
    text(draw, 126, 78, "HD2Lab", _font(FONT_LATIN_B, 34), INK, anchor="lm")
    w_hd2 = draw.textlength("HD2Lab", font=_font(FONT_LATIN_B, 34)) / S
    div_x = 126 + w_hd2 + 18
    draw.line([_xy(div_x, 62), _xy(div_x, 94)], fill=LINE_STRONG, width=int(1.1 * S))
    text(draw, div_x + 16, 78, "Lýra", _font(FONT_LATIN_B, 27), ACCENT_TEXT, anchor="lm")
    w_lyra = draw.textlength("Lýra", font=_font(FONT_LATIN_B, 27)) / S
    badge_x = div_x + 16 + w_lyra + 16
    f_badge = _font(FONT_MONO_B, 11)
    bw = draw.textlength("LOOP STATION", font=f_badge) / S + 20
    draw.rounded_rectangle(_box(badge_x, 66, badge_x + bw, 90), radius=5,
                           fill=SURFACE_2, outline=BORDER, width=S)
    spaced(draw, badge_x + 10, 71, "LOOP STATION", f_badge, MUTED, 1.1)

    # ── eyebrow ───────────────────────────────────────────────────────────
    r = 4.6
    draw.ellipse(_box(64 - r, 181 - r, 64 + r, 181 + r), fill=ACCENT)
    spaced(draw, 80, 174, "PKPILOT 0019 · LÝRA — HD2LAB MULTI-TRACK LOOP STATION",
           _font(FONT_MONO, 12.5), MUTED, 2.1)

    # ── headline ──────────────────────────────────────────────────────────
    h1 = _font(FONT_REGULAR, 72)
    draw.text(_xy(64, 292), "네 개의 트랙,", font=h1, fill=INK, anchor="ls",
              stroke_width=int(1.3 * S), stroke_fill=INK)
    draw.text(_xy(64, 372), "하나의 루프.", font=h1, fill=ACCENT, anchor="ls",
              stroke_width=int(1.3 * S), stroke_fill=ACCENT)

    # ── sub-copy ──────────────────────────────────────────────────────────
    f_sub = _font(FONT_REGULAR, 19)
    for i, line in enumerate((
        "브라우저에서 바로 연주하고, 겹쳐 녹음하고, 내보냅니다.",
        "가상악기 · 드럼 · 트랙 FX — 설치도, 업로드도 없습니다.",
    )):
        text(draw, 64, 436 + i * 32, line, f_sub, BODY)

    # ── pills + URL footer ────────────────────────────────────────────────
    f_pill = _font(FONT_REGULAR, 14.5)
    cx = 64
    for label in ("100% 브라우저", "4–6 트랙", "WAV · MP3 · Stems"):
        cx += chip(draw, cx, 520, label, f_pill) + 10

    f_foot = _font(FONT_MONO, 13.5)
    f_foot_b = _font(FONT_MONO_B, 13.5)
    host, slug = "hyangdan2.github.io/", "PKPilot0019"
    w_host = draw.textlength(host, font=f_foot) / S
    w_slug = draw.textlength(slug, font=f_foot_b) / S
    fx = 1136 - w_host - w_slug
    text(draw, fx, 578, host, f_foot, MUTED, anchor="ls")
    text(draw, fx + w_host, 578, slug, f_foot_b, ACCENT_TEXT, anchor="ls")

    # ── session preview panel ─────────────────────────────────────────────
    card = (742, 150, 1136, 476)
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(_box(card[0], card[1] + 10, card[2], card[3] + 16), radius=16,
                         fill=(29, 25, 43, 42))
    image = Image.alpha_composite(image.convert("RGBA"),
                                  shadow.filter(ImageFilter.GaussianBlur(16 * S))).convert("RGB")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(_box(*card), radius=16, fill=SURFACE, outline=BORDER,
                           width=int(1.1 * S))

    spaced(draw, 762, 168, "SESSION", _font(FONT_MONO_B, 9.5), ACCENT, 1.6)
    text(draw, 762, 186, "Lo-Fi Chill Groove", _font(FONT_LATIN_B, 15), INK)
    text(draw, 1116, 170, "92 BPM · 4/4 · 2 BARS", _font(FONT_MONO, 9), MUTED, anchor="ra")

    draw.line([_xy(742 + 20, 210), _xy(1136 - 20, 210)], fill=BORDER_SOFT, width=S)

    strips = (
        ("T1", "Lo-Fi Drums", 1.0, "PLAY", TINTS[0]),
        ("T2", "Warm EP Chords", 0.62, "PLAY", TINTS[1]),
        ("T3", "Sub Bass", 0.38, "REC", RECORD),
        ("T4", "Pluck Melody", 0.24, "STOP", TINTS[3]),
    )
    x0, y0, w, gap = 762.0, 222.0, 82.0, 8.0
    for index, (label, name, progress, state, tint) in enumerate(strips):
        x = x0 + index * (w + gap)
        draw.rounded_rectangle(_box(x, y0, x + w, y0 + 176), radius=10, fill=BACKGROUND,
                               outline=BORDER_SOFT, width=S)
        draw.rectangle(_box(x + 6, y0 + 1, x + w - 6, y0 + 2.2), fill=tint)
        text(draw, x + 8, y0 + 10, label, _font(FONT_MONO_B, 9), tint)
        cx_, cy_ = x + w / 2, y0 + 68
        ring_preview(draw, cx_, cy_, 27, progress, tint)
        wave(draw, cx_, cy_, 26, 16, tint, seed=index)
        name_font = _font(FONT_LATIN_B, 8.5)
        text(draw, cx_, y0 + 106, name, name_font, INK, anchor="ma")
        state_color = {"PLAY": tint, "REC": RECORD, "STOP": MUTED}[state]
        pill_w = draw.textlength(state, font=_font(FONT_MONO_B, 8)) / S + 16
        draw.rounded_rectangle(_box(cx_ - pill_w / 2, y0 + 120, cx_ + pill_w / 2, y0 + 138),
                               radius=9, fill=SURFACE, outline=BORDER, width=S)
        text(draw, cx_, y0 + 129, state, _font(FONT_MONO_B, 8), state_color, anchor="mm")
        for pad in range(4):
            px = x + 9 + pad * (w - 18) / 4
            draw.rounded_rectangle(_box(px, y0 + 148, px + (w - 22) / 4, y0 + 162),
                                   radius=3, fill=ACCENT_SOFT if pad == 0 else SURFACE_2,
                                   outline=BORDER, width=S)

    # transport strip under the strips
    ty = 412.0
    draw.line([_xy(762, ty - 12), _xy(1116, ty - 12)], fill=BORDER_SOFT, width=S)
    draw.ellipse(_box(762, ty, 776, ty + 14), fill=ACCENT)
    draw.polygon([_xy(768.4, ty + 4), _xy(768.4, ty + 10), _xy(773, ty + 7)], fill="#FFFFFF")
    text(draw, 786, ty + 7, "2 bars · 5.22 s", _font(FONT_MONO, 9), MUTED, anchor="lm")
    meter_x = 930.0
    draw.rounded_rectangle(_box(meter_x, ty + 4, 1026, ty + 10), radius=3, fill=SURFACE_2,
                           outline=BORDER_SOFT, width=S)
    draw.rounded_rectangle(_box(meter_x, ty + 4, meter_x + 62, ty + 10), radius=3, fill=ACCENT)
    text(draw, 1116, ty + 7, "MASTER  -6.0", _font(FONT_MONO, 9), MUTED, anchor="rm")

    return image.resize((CW, CH), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "favicon.svg").write_text(svg(), encoding="utf-8")
    icon(32).save(OUT / "favicon-32x32.png")
    icon(180).save(OUT / "apple-touch-icon.png")
    icon(192).save(OUT / "icon-192.png")
    icon(512).save(OUT / "icon-512.png")
    icon(48).save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    og = og_card()
    og.save(OUT / "og-image.png", "PNG", optimize=True)
    first, second = mark_paths()
    print("wrote favicon.svg, favicon-32x32.png, apple-touch-icon.png, icon-192.png,",
          "icon-512.png, favicon.ico, og-image.png", og.size)
    print("MARK_PATH_1:", first)
    print("MARK_PATH_2:", second)


if __name__ == "__main__":
    main()
