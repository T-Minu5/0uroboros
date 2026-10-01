#!/usr/bin/env python3
"""Download a YouTube video at low resolution, sample frames, and build a GPT-4o vision payload.

Works alongside youtube-full (transcripts via TranscriptAPI). This tool is the visual path.
Always deletes the downloaded video when finished.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import ssl
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

MAX_WIDTH = 768
DEFAULT_INTERVAL = 5.0
DEFAULT_MAX_FRAMES = 24
DEFAULT_PROMPT = (
    "These frames are a visual timeline of a YouTube video, in chronological order, "
    "sampled every few seconds. Describe what happens on screen over time: subjects, "
    "setting, text/UI, actions, scene changes, and anything a transcript would miss. "
    "Call out timestamps you can infer from the frame order. Be concrete."
)

YOUTUBE_RE = re.compile(
    r"(https?://)?(www\.)?(youtube\.com|youtu\.be)/",
    re.IGNORECASE,
)


def die(message: str, code: int = 1) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(code)


def find_ffmpeg() -> Optional[str]:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def assert_youtube_url(url: str) -> None:
    if not YOUTUBE_RE.search(url) and "youtube.com" not in url.lower() and "youtu.be" not in url.lower():
        if re.fullmatch(r"[A-Za-z0-9_-]{11}", url):
            return
        die("Input must be a YouTube URL or 11-character video ID.")


def resolve_url(url: str) -> str:
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", url):
        return "https://www.youtube.com/watch?v={}".format(url)
    return url


def download_video(url: str, dest_dir: Path, ffmpeg: Optional[str]) -> Path:
    from yt_dlp import YoutubeDL

    dest_dir.mkdir(parents=True, exist_ok=True)
    outtmpl = str(dest_dir / "video.%(ext)s")
    opts: Dict[str, Any] = {
        "outtmpl": outtmpl,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        # Single-file worst progressive stream so ffmpeg merge is optional.
        "format": "worst[ext=mp4]/worst[height<=360][ext=mp4]/worst[ext=webm]/worst",
        "overwrites": True,
    }
    if ffmpeg:
        opts["ffmpeg_location"] = str(Path(ffmpeg).parent)
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        if not info:
            die("yt-dlp returned no video info.")
        prepared = Path(ydl.prepare_filename(info))
        if prepared.exists():
            return prepared
    matches = list(dest_dir.glob("video.*"))
    if not matches:
        die("Download finished but no video file was found.")
    return matches[0]


def resize_frame(frame: Any, max_width: int) -> Any:
    import cv2

    height, width = frame.shape[:2]
    if width <= max_width:
        return frame
    scale = max_width / float(width)
    new_size = (max_width, max(1, int(round(height * scale))))
    return cv2.resize(frame, new_size, interpolation=cv2.INTER_AREA)


def frame_to_jpeg_b64(frame: Any, quality: int = 80) -> str:
    import cv2

    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        die("Failed to encode a JPEG frame.")
    return base64.b64encode(buf.tobytes()).decode("ascii")


def extract_frames(
    video_path: Path,
    interval_sec: float,
    max_width: int,
    max_frames: int,
) -> List[Tuple[float, str]]:
    import cv2

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        die("OpenCV could not open the downloaded video.")

    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0
    duration = (frame_count / fps) if fps > 1e-3 else 0.0

    frames: List[Tuple[float, str]] = []
    t = 0.0
    while True:
        if duration and t > duration + 0.05:
            break
        if fps > 1e-3:
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if not ok:
            break
        jpeg = frame_to_jpeg_b64(resize_frame(frame, max_width))
        frames.append((round(t, 2), jpeg))
        if len(frames) >= max_frames:
            break
        t += interval_sec
        if duration <= 0 and len(frames) >= 1 and t > interval_sec * max_frames:
            break

    cap.release()
    if not frames:
        die("No frames could be extracted.")
    return frames


def openai_payload(frames: List[Tuple[float, str]], prompt: str) -> Dict[str, Any]:
    content: List[Dict[str, Any]] = [{"type": "text", "text": prompt}]
    for timestamp, jpeg in frames:
        content.append({"type": "text", "text": "Frame at {}s".format(timestamp)})
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": "data:image/jpeg;base64,{}".format(jpeg),
                    "detail": "low",
                },
            }
        )
    return {
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 1200,
    }


def anthropic_payload(frames: List[Tuple[float, str]], prompt: str) -> Dict[str, Any]:
    content: List[Dict[str, Any]] = [{"type": "text", "text": prompt}]
    for timestamp, jpeg in frames:
        content.append({"type": "text", "text": "Frame at {}s".format(timestamp)})
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": jpeg,
                },
            }
        )
    return {
        "model": "claude-3-5-sonnet-latest",
        "max_tokens": 1200,
        "messages": [{"role": "user", "content": content}],
    }


def post_json(url: str, headers: Dict[str, str], body: Dict[str, Any]) -> Dict[str, Any]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=context, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        die("Vision API HTTP {}: {}".format(exc.code, detail[:800]))
    return json.loads(raw)


def call_openai(payload: Dict[str, Any], api_key: str) -> str:
    headers = {
        "Authorization": "Bearer {}".format(api_key),
        "Content-Type": "application/json",
    }
    result = post_json("https://api.openai.com/v1/chat/completions", headers, payload)
    return result["choices"][0]["message"]["content"]


def call_anthropic(payload: Dict[str, Any], api_key: str) -> str:
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    result = post_json("https://api.anthropic.com/v1/messages", headers, payload)
    parts = result.get("content") or []
    texts = [p.get("text", "") for p in parts if p.get("type") == "text"]
    return "\n".join(texts).strip()


def dependency_report() -> Dict[str, Any]:
    ffmpeg = find_ffmpeg()
    yt = False
    cv2 = False
    imageio = False
    try:
        import yt_dlp  # noqa: F401

        yt = True
    except Exception:
        pass
    try:
        import cv2  # noqa: F401

        cv2 = True
    except Exception:
        pass
    try:
        import imageio_ffmpeg  # noqa: F401

        imageio = True
    except Exception:
        pass
    missing = []
    if not yt:
        missing.append("yt-dlp")
    if not cv2:
        missing.append("opencv-python")
    if not ffmpeg and not imageio:
        missing.append("imageio-ffmpeg (bundled ffmpeg; system ffmpeg is also missing)")
    return {
        "python": sys.version.split()[0],
        "ffmpeg": ffmpeg or "MISSING",
        "yt-dlp": yt,
        "opencv-python": cv2,
        "imageio-ffmpeg": imageio,
        "missing": missing,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Watch a YouTube video as sampled frames for a vision LLM."
    )
    parser.add_argument("url", nargs="?", help="YouTube URL or 11-character video ID")
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL,
        help="Seconds between frames (default: 5)",
    )
    parser.add_argument("--max-width", type=int, default=MAX_WIDTH)
    parser.add_argument("--max-frames", type=int, default=DEFAULT_MAX_FRAMES)
    parser.add_argument(
        "--provider",
        choices=("openai", "anthropic"),
        default="openai",
        help="Vision payload format. Default: OpenAI GPT-4o",
    )
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument(
        "--payload-out",
        help="Write the vision payload JSON here (images included). Default: no file",
    )
    parser.add_argument(
        "--analyze",
        action="store_true",
        help="Call the vision API. Requires OPENAI_API_KEY or ANTHROPIC_API_KEY",
    )
    parser.add_argument(
        "--check-deps",
        action="store_true",
        help="Print dependency status and exit",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.check_deps:
        print(json.dumps(dependency_report(), indent=2))
        return 0
    if not args.url:
        die("A YouTube URL is required.")
    if args.interval <= 0:
        die("--interval must be greater than 0.")

    report = dependency_report()
    if report["missing"]:
        die(
            "Missing dependencies: {}\nInstall with: python3 -m pip install -r requirements.txt".format(
                ", ".join(report["missing"])
            )
        )

    assert_youtube_url(args.url)
    url = resolve_url(args.url)
    ffmpeg = find_ffmpeg()
    work = Path(tempfile.mkdtemp(prefix="ytwatch-"))
    try:
        video_path = download_video(url, work, ffmpeg)
        frames = extract_frames(video_path, args.interval, args.max_width, args.max_frames)
        payload = (
            openai_payload(frames, args.prompt)
            if args.provider == "openai"
            else anthropic_payload(frames, args.prompt)
        )
        summary = {
            "url": url,
            "interval_sec": args.interval,
            "frame_count": len(frames),
            "timestamps": [t for t, _ in frames],
            "max_width": args.max_width,
            "provider": args.provider,
            "ffmpeg": ffmpeg,
        }
        if args.payload_out:
            Path(args.payload_out).write_text(json.dumps(payload), encoding="utf-8")
            summary["payload_out"] = args.payload_out

        analysis = None
        if args.analyze:
            if args.provider == "openai":
                key = os.environ.get("OPENAI_API_KEY")
                if not key:
                    die("--analyze needs OPENAI_API_KEY.")
                analysis = call_openai(payload, key)
            else:
                key = os.environ.get("ANTHROPIC_API_KEY")
                if not key:
                    die("--analyze needs ANTHROPIC_API_KEY.")
                analysis = call_anthropic(payload, key)

        print(json.dumps({"ok": True, "summary": summary, "analysis": analysis}, indent=2))
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
