#!/usr/bin/env python3
"""Generate PUPSync extension icons (calendar mark, maroon)."""
from pathlib import Path

from PIL import Image, ImageDraw

MAROON = (122, 0, 25)
WHITE = (255, 255, 255)

out = Path(__file__).resolve().parent.parent / "icons"
out.mkdir(parents=True, exist_ok=True)


def draw_calendar_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = max(2, size // 8)
    r = max(2, size // 12)
    x0, y0 = pad, pad + size // 10
    x1, y1 = size - pad, size - pad
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=MAROON)
    band = y0 + (y1 - y0) // 4
    d.rectangle([x0, y0, x1, band], fill=(90, 0, 18))
    cx = (x0 + x1) // 2
    cy = (band + y1) // 2 + 1
    arm = max(1, size // 16)
    d.line([(cx, cy - size // 8), (cx, cy + size // 10)], fill=WHITE, width=arm)
    d.line([(cx - size // 10, cy), (cx + size // 10, cy)], fill=WHITE, width=arm)
    hook = max(1, size // 14)
    d.line([(x0 + size // 5, y0 - pad // 2), (x0 + size // 5, y0 + pad)], fill=WHITE, width=hook)
    d.line([(x1 - size // 5, y0 - pad // 2), (x1 - size // 5, y0 + pad)], fill=WHITE, width=hook)
    return img


for size in (16, 48, 128):
    draw_calendar_icon(size).save(out / f"icon{size}.png")

print("Icons written:", out)
