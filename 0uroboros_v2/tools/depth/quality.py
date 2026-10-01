"""Pick the smallest depth-asset encoding that still looks like the lossless reference.

For a sample of card art, renders the same relief-mapped parallax the game shader draws at
nine eye positions (centre, edges and corners of the tilt range). The reference uses the
source colour and full-precision depth; each candidate uses decoded WebP files. Candidates are
scored by mean and worst-case SSIM across all views and cards, then ranked by bytes.

    python quality.py [--sample 12] [--threshold 0.99] [--json out.json]
"""
from __future__ import annotations

import argparse
import io
import json
import sys
from itertools import product
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from skimage.metrics import structural_similarity

from depth_core import estimate, load_model, load_rgb, sha256_file

ROOT = Path(__file__).resolve().parents[2]
BASE_SHIFT = 0.055
INTENSITY = 1.35  # the inspect view, where artefacts are easiest to see
STEPS = 64
EYES = [(x, y) for x in (-1, 0, 1) for y in (-1, 0, 1)]


def sample_bilinear(image: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    h, w = image.shape[:2]
    x = np.clip(u * w - 0.5, 0, w - 1).astype(np.float32)
    y = np.clip(v * h - 0.5, 0, h - 1).astype(np.float32)
    return cv2.remap(image, x, y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def render(color: np.ndarray, depth: np.ndarray, focus: float, eye: tuple[float, float]) -> np.ndarray:
    """CPU twin of parallaxShader.ts at the image's own aspect ratio and resolution."""
    h, w = color.shape[:2]
    aspect = w / h
    ex, ey = eye
    length = max(1.0, (ex * ex + ey * ey) ** 0.5)
    ex, ey = ex / length, ey / length
    margin = BASE_SHIFT * INTENSITY * max(focus, 1 - focus)
    zoom = min(1.0, 1 / (1 + 2 * margin), 1 / (1 + 2 * margin * aspect))
    shift_x, shift_y = ex * BASE_SHIFT * INTENSITY * zoom, ey * BASE_SHIFT * INTENSITY * aspect * zoom
    v, u = np.meshgrid((np.arange(h) + 0.5) / h, (np.arange(w) + 0.5) / w, indexing="ij")
    bu, bv = 0.5 + (u - 0.5) * zoom, 0.5 + (v - 0.5) * zoom
    at = lambda t: (bu - shift_x * (t - focus), bv - shift_y * (t - focus))
    step = 1 / STEPS
    t = np.zeros_like(bu, dtype=np.float32)
    prev = np.zeros_like(t)
    hit = sample_bilinear(depth, bu + shift_x * focus, bv + shift_y * focus) <= 0
    for _ in range(STEPS):
        active = ~hit
        if not active.any():
            break
        prev = np.where(active, t, prev)
        t = np.where(active, t + step, t)
        du, dv = at(t)
        hit |= sample_bilinear(depth, du, dv) <= t
    a, b = prev, np.minimum(t, 1)
    for _ in range(6):
        m = 0.5 * (a + b)
        du, dv = at(m)
        inside = sample_bilinear(depth, du, dv) <= m
        b, a = np.where(inside, m, b), np.where(inside, a, m)
    du, dv = at(b)
    return sample_bilinear(color, np.clip(du, 0, 1), np.clip(dv, 0, 1))


def webp_roundtrip(image: Image.Image, lossless: bool, quality: int) -> tuple[np.ndarray, int]:
    buffer = io.BytesIO()
    image.save(buffer, "WEBP", lossless=lossless, quality=100 if lossless else quality, method=6)
    size = buffer.tell()
    buffer.seek(0)
    return np.asarray(Image.open(buffer).convert("RGB")), size


def ssim(a: np.ndarray, b: np.ndarray) -> float:
    """SSIM on luma. Per-channel RGB SSIM overstates WebP's 4:2:0 chroma subsampling, which the eye barely sees."""
    luma = lambda x: cv2.cvtColor(x, cv2.COLOR_RGB2YCrCb)[..., 0]
    return float(structural_similarity(luma(a), luma(b), data_range=255))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", type=int, default=12)
    parser.add_argument("--threshold", type=float, default=0.99)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()

    art_root = ROOT / "assets/card_art"
    unique = {}
    for path in sorted(art_root.rglob("*")):
        if not path.is_file() or "depth" in path.relative_to(art_root).parts or path.name.startswith("."):
            continue
        try:
            Image.open(path).verify()
        except Exception:
            continue
        unique.setdefault(sha256_file(path), "/assets/" + path.relative_to(ROOT / "assets").as_posix())
    urls = sorted(unique.values())
    picks = [urls[round(i * (len(urls) - 1) / max(1, args.sample - 1))] for i in range(min(args.sample, len(urls)))]

    color_options = [("lossless", True, 100)] + [(f"q{q}", False, q) for q in (95, 92, 90, 85, 80)]
    depth_options = [("full-lossless", 1.0, True, 100), ("full-q90", 1.0, False, 90), ("full-q80", 1.0, False, 80), ("full-q70", 1.0, False, 70),
                     ("half-lossless", 0.5, True, 100), ("half-q90", 0.5, False, 90)]

    model = load_model()
    scores = {(c[0], d[0]): {"ssim": [], "bytes": 0} for c, d in product(color_options, depth_options)}
    for index, url in enumerate(picks, 1):
        src = ROOT / "assets" / url[len("/assets/"):]
        result = estimate(model, load_rgb(src))
        h, w = result.depth.shape
        references = [render(result.color, result.depth, result.focus, eye) for eye in EYES]
        colors = {name: webp_roundtrip(Image.fromarray(result.color), lossless, q) for name, lossless, q in color_options}
        depths = {}
        for name, scale, lossless, q in depth_options:
            small = result.depth if scale == 1 else cv2.resize(result.depth, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
            decoded, size = webp_roundtrip(Image.fromarray(np.round(small * 255).astype(np.uint8)).convert("RGB"), lossless, q)
            plane = decoded[..., 0].astype(np.float32) / 255
            depths[name] = (cv2.resize(plane, (w, h), interpolation=cv2.INTER_LINEAR) if scale != 1 else plane, size)
        for (cname, _, _), (dname, _, _, _) in product(color_options, depth_options):
            color, csize = colors[cname]
            depth, dsize = depths[dname]
            views = [ssim(ref, render(color, depth, result.focus, eye)) for ref, eye in zip(references, EYES)]
            scores[(cname, dname)]["ssim"].extend(views)
            scores[(cname, dname)]["bytes"] += csize + dsize
        print(f"[{index}/{len(picks)}] {url}", file=sys.stderr)

    rows = []
    for (cname, dname), score in scores.items():
        values = np.array(score["ssim"])
        rows.append({"color": cname, "depth": dname, "mean_ssim": round(float(values.mean()), 5), "min_ssim": round(float(values.min()), 5), "avg_bytes": round(score["bytes"] / len(picks))})
    rows.sort(key=lambda row: row["avg_bytes"])
    passing = [row for row in rows if row["mean_ssim"] >= args.threshold and row["min_ssim"] >= args.threshold - 0.02]
    best = passing[0] if passing else None
    reference = next(row for row in rows if row["color"] == "lossless" and row["depth"] == "full-lossless")
    for row in rows:
        flag = "  <== smallest passing" if row is best else ""
        print(f"{row['color']:>9} + {row['depth']:<14} mean {row['mean_ssim']:.4f}  min {row['min_ssim']:.4f}  {row['avg_bytes'] / 1024:7.1f} KB{flag}")
    if best:
        print(f"\nBest: colour {best['color']}, depth {best['depth']}: {best['avg_bytes'] / 1024:.1f} KB per card vs {reference['avg_bytes'] / 1024:.1f} KB lossless ({100 * best['avg_bytes'] / reference['avg_bytes']:.0f}%)")
    if args.json:
        args.json.write_text(json.dumps({"sample": picks, "threshold": args.threshold, "best": best, "reference": reference, "rows": rows}, indent=2))


if __name__ == "__main__":
    main()
