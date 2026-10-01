#!/usr/bin/env bash
# Installs the depth toolchain outside the Dropbox project: a Python 3.11 venv, the
# Depth Anything V2 source at a pinned commit, and the Apache-2.0 Small checkpoint.
set -euo pipefail

DEPTH_HOME="${DEPTH_HOME:-$HOME/.cache/0uroboros-depth}"
COMMIT=a561b849ebae10a6f5ef49e26c83cbbcd36c71bf
HERE="$(cd "$(dirname "$0")" && pwd)"

command -v uv >/dev/null || { echo "Install uv first: brew install uv" >&2; exit 1; }
mkdir -p "$DEPTH_HOME/checkpoints"

[ -x "$DEPTH_HOME/venv/bin/python" ] || uv venv --python 3.11 "$DEPTH_HOME/venv"
VIRTUAL_ENV="$DEPTH_HOME/venv" uv pip install -r "$HERE/requirements.txt"

if [ ! -d "$DEPTH_HOME/repo/.git" ]; then
  git clone https://github.com/DepthAnything/Depth-Anything-V2 "$DEPTH_HOME/repo"
fi
git -C "$DEPTH_HOME/repo" fetch --depth 1 origin "$COMMIT" 2>/dev/null || true
git -C "$DEPTH_HOME/repo" checkout -q "$COMMIT"

CKPT="$DEPTH_HOME/checkpoints/depth_anything_v2_vits.pth"
[ -s "$CKPT" ] || curl -fL -o "$CKPT" "https://huggingface.co/depth-anything/Depth-Anything-V2-Small/resolve/main/depth_anything_v2_vits.pth?download=true"

echo "Depth toolchain ready in $DEPTH_HOME"
