"""Card-art depth estimation with Depth Anything V2 Small (Apache-2.0).

The Small model is the only checkpoint whose license allows commercial use, so
quality comes from what surrounds it: inference on an upscaled copy at three
input sizes, each averaged with its mirror image, edges snapped to the colour
image with a guided filter, and foreground silhouettes grown a few pixels so
parallax pulls background away from a subject instead of smearing it.
"""
from __future__ import annotations

import hashlib
import os
import sys
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

DEPTH_HOME = Path(os.environ.get("DEPTH_HOME", Path.home() / ".cache" / "0uroboros-depth"))
REPO = DEPTH_HOME / "repo"
CHECKPOINT = DEPTH_HOME / "checkpoints" / "depth_anything_v2_vits.pth"

# Output never exceeds this on its long side; larger uploads are reduced first.
MAX_LONG_SIDE = 1600
# Inference runs on a copy at least this large so the ViT sees fine structure.
WORK_LONG_SIDE = 1036
INPUT_SIZES = (518, 770, 1036)
# Matches the card art window background, so transparent art composites the way it displays.
MATTE = (0x10, 0x13, 0x1D)


@dataclass
class EncodeSettings:
    color_lossless: bool = True
    color_quality: int = 95
    depth_lossless: bool = True
    depth_quality: int = 95
    depth_scale: float = 1.0


@dataclass
class DepthResult:
    color: np.ndarray  # H x W x 3 uint8 RGB
    depth: np.ndarray  # H x W float32, 0 = at the card window, 1 = farthest
    focus: float


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _device() -> str:
    import torch
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_model():
    import torch
    sys.path.insert(0, str(REPO))
    from depth_anything_v2.dpt import DepthAnythingV2  # type: ignore

    model = DepthAnythingV2(encoder="vits", features=64, out_channels=[48, 96, 192, 384])
    model.load_state_dict(torch.load(CHECKPOINT, map_location="cpu"))
    return model.to(_device()).eval()


def load_rgb(path: Path) -> np.ndarray:
    image = Image.open(path)
    image.load()
    if image.mode in ("RGBA", "LA", "P"):
        image = image.convert("RGBA")
        matte = Image.new("RGBA", image.size, MATTE + (255,))
        image = Image.alpha_composite(matte, image)
    rgb = np.asarray(image.convert("RGB"))
    h, w = rgb.shape[:2]
    if max(h, w) > MAX_LONG_SIDE:
        k = MAX_LONG_SIDE / max(h, w)
        rgb = cv2.resize(rgb, (round(w * k), round(h * k)), interpolation=cv2.INTER_AREA)
    return rgb


def _align(reference: np.ndarray, value: np.ndarray) -> np.ndarray:
    """Least-squares scale and shift: each pass predicts disparity only up to an affine map."""
    a = np.stack([value.ravel(), np.ones(value.size, dtype=np.float32)], axis=1)
    (scale, shift), *_ = np.linalg.lstsq(a, reference.ravel(), rcond=None)
    return value * scale + shift


def _guided_filter(guide: np.ndarray, source: np.ndarray, radius: int, eps: float) -> np.ndarray:
    size = (2 * radius + 1, 2 * radius + 1)
    mean = lambda x: cv2.boxFilter(x, cv2.CV_32F, size, borderType=cv2.BORDER_REFLECT)
    mean_i, mean_p = mean(guide), mean(source)
    cov_ip = mean(guide * source) - mean_i * mean_p
    var_i = mean(guide * guide) - mean_i * mean_i
    a = cov_ip / (var_i + eps)
    b = mean_p - a * mean_i
    return mean(a) * guide + mean(b)


def estimate(model, rgb: np.ndarray) -> DepthResult:
    h, w = rgb.shape[:2]
    k = max(1.0, WORK_LONG_SIDE / max(h, w))
    work = cv2.resize(rgb, (round(w * k), round(h * k)), interpolation=cv2.INTER_LANCZOS4) if k > 1 else rgb
    bgr = cv2.cvtColor(work, cv2.COLOR_RGB2BGR)
    mirrored = np.ascontiguousarray(bgr[:, ::-1])

    passes = []
    for size in INPUT_SIZES:
        passes.append(model.infer_image(bgr, size).astype(np.float32))
        passes.append(model.infer_image(mirrored, size)[:, ::-1].astype(np.float32))
    reference = passes[0]
    disparity = np.median(np.stack([reference] + [_align(reference, p) for p in passes[1:]]), axis=0)

    lo, hi = np.percentile(disparity, (0.5, 99.5))
    disparity = np.clip((disparity - lo) / max(hi - lo, 1e-6), 0, 1).astype(np.float32)

    # Tight radius and low eps: wide, soft depth edges stretch the background into a halo under parallax.
    guide = cv2.cvtColor(work, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    radius = max(1, round(2 * k))
    disparity = np.clip(_guided_filter(guide, disparity, radius, 1e-4), 0, 1)

    grow = max(1, round(2 * k))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1))
    disparity = cv2.dilate(disparity, kernel)
    disparity = cv2.GaussianBlur(disparity, (0, 0), 0.4 * k)

    if k > 1:
        disparity = cv2.resize(disparity, (w, h), interpolation=cv2.INTER_AREA)
    depth = 1.0 - np.clip(disparity, 0, 1)

    # The zero-parallax plane sits at the typical depth of the middle of the frame, where the subject usually is.
    center = depth[h // 4: h - h // 4, w // 4: w - w // 4]
    focus = float(np.clip(np.median(center), 0.0, 1.0))
    return DepthResult(color=rgb, depth=depth.astype(np.float32), focus=round(focus, 4))


def encode(result: DepthResult, color_path: Path, depth_path: Path, settings: EncodeSettings) -> None:
    color_path.parent.mkdir(parents=True, exist_ok=True)
    color = Image.fromarray(result.color, "RGB")
    if settings.color_lossless:
        color.save(color_path, "WEBP", lossless=True, quality=100, method=6)
    else:
        color.save(color_path, "WEBP", quality=settings.color_quality, method=6)

    depth = result.depth
    if settings.depth_scale != 1.0:
        h, w = depth.shape
        depth = cv2.resize(depth, (max(1, round(w * settings.depth_scale)), max(1, round(h * settings.depth_scale))), interpolation=cv2.INTER_AREA)
    depth8 = Image.fromarray(np.round(depth * 255).astype(np.uint8), "L").convert("RGB")
    if settings.depth_lossless:
        depth8.save(depth_path, "WEBP", lossless=True, quality=100, method=6)
    else:
        depth8.save(depth_path, "WEBP", quality=settings.depth_quality, method=6)
