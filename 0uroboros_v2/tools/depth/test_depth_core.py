"""Pipeline checks that need no model: run with the depth venv's python -m pytest or python test_depth_core.py."""
from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from depth_core import MAX_LONG_SIDE, DepthResult, EncodeSettings, _align, _guided_filter, encode, load_rgb, sha256_file


def test_align_recovers_affine_scale():
    reference = np.linspace(0, 1, 100, dtype=np.float32).reshape(10, 10)
    assert np.allclose(_align(reference, reference * 3 + 2), reference, atol=1e-4)


def test_guided_filter_keeps_flat_regions_flat():
    guide = np.zeros((32, 32), np.float32); guide[:, 16:] = 1
    source = guide.copy()
    out = _guided_filter(guide, source, 3, 1e-4)
    assert abs(out[:, :12].mean()) < 1e-3 and abs(out[:, 20:].mean() - 1) < 1e-3


def test_load_rgb_composites_alpha_and_caps_size():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "big.png"
        Image.new("RGBA", (MAX_LONG_SIDE * 2, 100), (255, 0, 0, 0)).save(path)
        rgb = load_rgb(path)
        assert rgb.shape[1] == MAX_LONG_SIDE and tuple(rgb[0, 0]) == (0x10, 0x13, 0x1D)


def test_encode_is_deterministic_and_lossless_depth_roundtrips():
    depth = np.tile(np.linspace(0, 1, 64, dtype=np.float32), (48, 1))
    result = DepthResult(color=np.full((48, 64, 3), 120, np.uint8), depth=depth, focus=0.5)
    with tempfile.TemporaryDirectory() as tmp:
        first = [Path(tmp) / "a.color.webp", Path(tmp) / "a.depth.webp"]
        second = [Path(tmp) / "b.color.webp", Path(tmp) / "b.depth.webp"]
        encode(result, *first, EncodeSettings())
        encode(result, *second, EncodeSettings())
        assert [sha256_file(p) for p in first] == [sha256_file(p) for p in second]
        decoded = np.asarray(Image.open(first[1]).convert("L")).astype(np.float32) / 255
        assert np.abs(decoded - np.round(depth * 255) / 255).max() < 1e-6


if __name__ == "__main__":
    for name, test in list(globals().items()):
        if name.startswith("test_"):
            test(); print(f"ok  {name}")
