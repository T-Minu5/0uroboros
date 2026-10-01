---
name: youtube-watch
description: >
  Visually watch a YouTube video by sampling frames with yt-dlp and OpenCV, then
  send a GPT-4o (or Claude 3.5 Sonnet) vision payload. Use when the user wants to
  see what happens on screen, analyze a visual timeline, watch a video, extract
  frames, or combine visuals with a transcript. Complements youtube-full, which
  handles transcripts, search, channels, and playlists without yt-dlp.
triggers:
  - watch youtube
  - youtube video
  - visual timeline
  - what happens on screen
  - extract frames
  - opencv youtube
  - gpt-4o vision
negatives:
  - transcript only
  - captions only
  - upload a video
  - live stream chat
---

# YouTube Watch

Visual companion to `youtube-full`. Use both on the same URL when the user wants to watch a video: `youtube-full` for the transcript, this skill for sampled frames.

Do not use this skill for transcript-only requests. Do not use yt-dlp inside `youtube-full`.

## Interpreter

Prefer the shared venv so every Cursor project uses the same install:

```bash
~/.cursor/skills/youtube-watch/.venv/bin/python \
  ~/.cursor/skills/youtube-watch/scripts/watch_youtube.py
```

If that venv is missing, create it once:

```bash
/usr/bin/python3 -m venv ~/.cursor/skills/youtube-watch/.venv
~/.cursor/skills/youtube-watch/.venv/bin/pip install -r ~/.cursor/skills/youtube-watch/requirements.txt
```

System `ffmpeg` is optional. The venv includes `imageio-ffmpeg` as a bundled binary for yt-dlp.

## Workflow

1. If the user also wants words, run `youtube-full` transcript first (TranscriptAPI).
2. Check deps: `.../watch_youtube.py --check-deps`
3. Sample frames (default: 1 frame every 5 seconds, max width 768px, max 24 frames):

```bash
~/.cursor/skills/youtube-watch/.venv/bin/python \
  ~/.cursor/skills/youtube-watch/scripts/watch_youtube.py \
  "YOUTUBE_URL" \
  --interval 5 \
  --analyze
```

`--analyze` calls OpenAI GPT-4o and needs `OPENAI_API_KEY`. For Claude 3.5 Sonnet:

```bash
.../watch_youtube.py "YOUTUBE_URL" --provider anthropic --analyze
```

That needs `ANTHROPIC_API_KEY`.

4. If no API key is available, omit `--analyze` and pass `--payload-out /tmp/yt-payload.json`. Then send that JSON to the vision endpoint yourself. The script still deletes the downloaded video.
5. Read the JSON `analysis` (or payload) and summarize the visual timeline for the user.
6. Combine with the `youtube-full` transcript when both exist.

## Defaults

| Flag | Default | Meaning |
| --- | --- | --- |
| `--interval` | 5 | Seconds between frames |
| `--max-width` | 768 | Resize before JPEG/base64 |
| `--max-frames` | 24 | Cap token use on long videos |
| `--provider` | `openai` | GPT-4o `image_url` payload |

The downloaded file lives in a temp directory and is always removed in a `finally` block.

## Missing software on this Mac (checked 2026-09-06)

- System `ffmpeg`: not installed, Homebrew not installed
- Fallback: `imageio-ffmpeg` inside the skill venv
- pip packages required: `yt-dlp`, `opencv-python`, `imageio-ffmpeg`

## Guardrails

- YouTube URLs or 11-character IDs only
- Lowest single-file resolution (`worst` mp4/webm) to limit bandwidth
- JPEG quality 80, `detail: low` on OpenAI images
- Never print API keys
- Never keep the video after the run
