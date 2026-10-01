"""Long-lived depth worker. One JSON job per stdin line, one JSON reply per stdout line.

Job:   {"id": "...", "src": "/abs/art.png", "color": "/abs/out.color.webp", "depth": "/abs/out.depth.webp",
        "encode": {"color_lossless": true, ...}}
Reply: {"id": "...", "ok": true, "width": 400, "height": 300, "focus": 0.42}
       {"id": "...", "ok": false, "error": "..."}
The first line written is {"ready": true} once the model is loaded.
"""
from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

from depth_core import EncodeSettings, encode, estimate, load_model, load_rgb


def reply(value: dict) -> None:
    sys.stdout.write(json.dumps(value) + "\n")
    sys.stdout.flush()


def main() -> None:
    model = load_model()
    reply({"ready": True})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        job_id = None
        try:
            job = json.loads(line)
            job_id = job.get("id")
            settings = EncodeSettings(**job.get("encode", {}))
            result = estimate(model, load_rgb(Path(job["src"])))
            encode(result, Path(job["color"]), Path(job["depth"]), settings)
            h, w = result.depth.shape
            reply({"id": job_id, "ok": True, "width": w, "height": h, "focus": result.focus})
        except Exception as error:  # a bad image must not take the worker down
            traceback.print_exc(file=sys.stderr)
            reply({"id": job_id, "ok": False, "error": str(error)})


if __name__ == "__main__":
    main()
