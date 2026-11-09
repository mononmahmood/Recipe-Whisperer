#!/usr/bin/env python3
"""Generate the app icons without any image library.

The mark is the original Recipe Whisperer one: a cream plate with three
rising steam ribbons, cream and saffron on the deep-green brand tile.
No animation in the static icon.
"""
import math
import struct
import zlib

GREEN = (23, 63, 51)
GREEN_2 = (35, 87, 67)
GREEN_DARK = (16, 43, 35)
CREAM = (250, 246, 236)
SAFFRON = (233, 162, 59)

SS = 2  # supersampling factor


def px(buf, w, h, x, y, color, alpha=1.0):
    if not (0 <= x < w and 0 <= y < h):
        return
    i = (y * w + x) * 4
    if alpha >= 0.999:
        buf[i:i + 4] = bytes((*color, 255))
    else:
        old = buf[i:i + 3]
        mixed = tuple(round(old[c] * (1 - alpha) + color[c] * alpha) for c in range(3))
        buf[i:i + 4] = bytes((*mixed, 255))


def draw_circle(buf, w, h, cx, cy, radius, color):
    for y in range(int(cy - radius) - 1, int(cy + radius) + 2):
        for x in range(int(cx - radius) - 1, int(cx + radius) + 2):
            if math.hypot(x - cx, y - cy) <= radius:
                px(buf, w, h, x, y, color)


def draw_capsule(buf, w, h, x1, y1, x2, y2, width, color):
    """A line with round caps, drawn as a distance field."""
    half = width / 2
    min_x = int(min(x1, x2) - half) - 1
    max_x = int(max(x1, x2) + half) + 2
    min_y = int(min(y1, y2) - half) - 1
    max_y = int(max(y1, y2) + half) + 2
    dx, dy = x2 - x1, y2 - y1
    length_sq = dx * dx + dy * dy or 1

    for y in range(min_y, max_y):
        for x in range(min_x, max_x):
            t = ((x - x1) * dx + (y - y1) * dy) / length_sq
            t = max(0.0, min(1.0, t))
            nearest_x = x1 + t * dx
            nearest_y = y1 + t * dy
            if math.hypot(x - nearest_x, y - nearest_y) <= half:
                px(buf, w, h, x, y, color)


def draw_ring(buf, w, h, cx, cy, radius, width, color):
    """A full ring, used for the plate."""
    half = width / 2
    for y in range(int(cy - radius - half) - 1, int(cy + radius + half) + 2):
        for x in range(int(cx - radius - half) - 1, int(cx + radius + half) + 2):
            if abs(math.hypot(x - cx, y - cy) - radius) <= half:
                px(buf, w, h, x, y, color)


def draw_mark(buf, w, h, s):
    """Draw the plate and steam in 512-coordinate units multiplied by s."""
    # Steam ribbons rise first so the plate can sit in front of them.
    draw_capsule(buf, w, h, 186 * s, 196 * s, 186 * s, 118 * s, 30 * s, SAFFRON)
    draw_capsule(buf, w, h, 256 * s, 184 * s, 256 * s, 92 * s, 32 * s, CREAM)
    draw_capsule(buf, w, h, 326 * s, 196 * s, 326 * s, 118 * s, 30 * s, SAFFRON)

    # A small saffron accent, kept from the first version.
    draw_circle(buf, w, h, 388 * s, 120 * s, 17 * s, SAFFRON)

    # The plate: a thick cream ring.
    draw_ring(buf, w, h, 256 * s, 336 * s, 116 * s, 26 * s, CREAM)


def draw_icon(size):
    w = h = size * SS
    buf = bytearray(w * h * 4)

    # background with a very soft diagonal light
    for y in range(h):
        for x in range(w):
            dx = (x - w * 0.24) / (w * 0.92)
            dy = (y - h * 0.18) / (h * 0.92)
            d = min(1.0, math.sqrt(dx * dx + dy * dy))
            col = tuple(round(GREEN_2[c] * (1 - d) + GREEN[c] * d) for c in range(3))
            px(buf, w, h, x, y, col)

    # subtle inset border
    margin = 12 * SS
    for y in range(margin, h - margin):
        for x in range(margin, w - margin):
            if x < margin + SS or x >= w - margin - SS or y < margin + SS or y >= h - margin - SS:
                px(buf, w, h, x, y, (255, 255, 255), 0.06)

    s = size / 512 * SS
    draw_mark(buf, w, h, s)

    # downsample
    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            totals = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    i = (((y * SS + sy) * w) + (x * SS + sx)) * 4
                    for c in range(4):
                        totals[c] += buf[i + c]
            n = SS * SS
            oi = (y * size + x) * 4
            out[oi:oi + 4] = bytes((totals[0] // n, totals[1] // n, totals[2] // n, totals[3] // n))

    raw = bytearray()
    for y in range(size):
        raw.append(0)
        raw.extend(out[y * size * 4:(y + 1) * size * 4])

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    return png


if __name__ == '__main__':
    for size in (512, 192):
        import os
        out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons', f'icon-{size}.png')
        with open(out, 'wb') as f:
            f.write(draw_icon(size))
        print(f'wrote {out}')
