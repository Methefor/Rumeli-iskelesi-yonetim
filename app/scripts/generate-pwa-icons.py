"""
Derives the PWA icon set from the EXISTING Rumeli iskele logo (app/public/pwa-512x512.png, the raster of
icon.svg). No new artwork is drawn; the logo is only re-cut into the shapes platforms require:

  pwa-512x512.png / pwa-192x192.png        'any'      rounded square with transparent corners (unchanged)
  pwa-maskable-512x512.png / -192x192.png  'maskable' FULL-BLEED: the transparent rounded corners are filled with the
                                           logo's own vertical sky/sea gradient, so Android's circle/squircle mask
                                           never shows a white corner. The artwork already sits inside the 80% safe zone.
  apple-touch-icon.png                     180x180 full-bleed (iOS rounds it itself; transparency would turn black)
  favicon-32x32.png                        32x32 fallback next to favicon.svg

Run:  python app/scripts/generate-pwa-icons.py        (needs Pillow)
"""
from pathlib import Path

from PIL import Image

PUBLIC = Path(__file__).resolve().parent.parent / "public"
SRC = Image.open(PUBLIC / "pwa-512x512.png").convert("RGBA")
assert SRC.size == (512, 512), SRC.size


def full_bleed(img: Image.Image) -> Image.Image:
    """Fill transparent corner pixels from the same row (the background is a vertical gradient)."""
    out = img.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        left = px[110, y]
        right = px[w - 111, y]
        if left[3] < 255 or right[3] < 255:
            raise SystemExit(f"row {y}: reference pixel is not opaque; the source artwork changed")
        for x in range(w):
            if px[x, y][3] < 255:
                ref = left if x < w // 2 else right
                px[x, y] = (ref[0], ref[1], ref[2], 255)
    return out


bleed = full_bleed(SRC)
bleed512 = bleed.convert("RGB")
bleed512.save(PUBLIC / "pwa-maskable-512x512.png", optimize=True)
bleed512.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "pwa-maskable-192x192.png", optimize=True)
bleed512.resize((180, 180), Image.Resampling.LANCZOS).save(PUBLIC / "apple-touch-icon.png", optimize=True)
SRC.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "pwa-192x192.png", optimize=True)
SRC.resize((32, 32), Image.Resampling.LANCZOS).save(PUBLIC / "favicon-32x32.png", optimize=True)
print("ok")
