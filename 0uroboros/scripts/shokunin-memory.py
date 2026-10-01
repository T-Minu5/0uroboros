#!/usr/bin/env python3
"""Project-local Shokunin memory for 0uroboros.

Stdlib only. Works on macOS system Python 3.9. Stores JSONL + markdown under
.cursor/memory/ in this repo. No ChromaDB, no ~/.shokunin, no home filesystem.

CLI:
  python3 scripts/shokunin-memory.py save --type decision --text "..."
  python3 scripts/shokunin-memory.py search "query"
  python3 scripts/shokunin-memory.py sessions
  python3 scripts/shokunin-memory.py end --text "..."
  python3 scripts/shokunin-memory.py index
  python3 scripts/shokunin-memory.py mcp
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

PROJECT = "0uroboros"
VALID_TYPES = {
    "decision",
    "file",
    "command",
    "preference",
    "checkpoint",
    "session_end",
    "general",
    "claim_file",
    "claim_function",
    "claim_flag",
    "claim_api",
}

REPO_ROOT = Path(__file__).resolve().parent.parent
MEMORY_DIR = Path(os.environ.get("SHOKUNIN_MEMORY_DIR", REPO_ROOT / ".cursor" / "memory"))
SESSIONS_DIR = MEMORY_DIR / "sessions"
INDEX_PATH = MEMORY_DIR / "index.md"
SESSION_FILE = MEMORY_DIR / "current-session.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def session_id() -> str:
    if SESSION_FILE.exists():
        try:
            data = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
            if data.get("session_id"):
                return str(data["session_id"])
        except (OSError, json.JSONDecodeError):
            pass
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    sid = "session-{}-{}".format(stamp, uuid.uuid4().hex[:4])
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    SESSION_FILE.write_text(
        json.dumps({"session_id": sid, "project": PROJECT, "started": now_iso()}, indent=2)
        + "\n",
        encoding="utf-8",
    )
    return sid


def tokenize(text: str) -> List[str]:
    return [t for t in re.findall(r"[a-z0-9_./-]+", text.lower()) if len(t) > 1]


def store(
    text: str,
    entry_type: str = "general",
    tags: Optional[List[str]] = None,
    sid: Optional[str] = None,
    role: Optional[str] = None,
) -> Dict[str, Any]:
    if entry_type not in VALID_TYPES:
        raise ValueError("unknown type: {}".format(entry_type))
    sid = sid or session_id()
    entry = {
        "id": str(uuid.uuid4()),
        "t": entry_type,
        "ts": now_iso(),
        "session_id": sid,
        "project": PROJECT,
        "tags": tags or [],
        "content": text.strip(),
    }
    if role:
        entry["role"] = role
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    jsonl = SESSIONS_DIR / "{}.jsonl".format(sid)
    md = SESSIONS_DIR / "{}.md".format(sid)
    with jsonl.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=True) + "\n")
    heading = "### {} · {}".format(entry_type, entry["ts"])
    with md.open("a", encoding="utf-8") as handle:
        handle.write("{}\n\n{}\n\n".format(heading, entry["content"]))
    return {"id": entry["id"], "type": entry_type, "stored": True, "session_id": sid}


def iter_entries() -> Iterable[Dict[str, Any]]:
    if not SESSIONS_DIR.exists():
        return
    for path in sorted(SESSIONS_DIR.glob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def search(query: str, entry_type: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
    q_tokens = set(tokenize(query))
    scored: List[Dict[str, Any]] = []
    now = datetime.now(timezone.utc)
    for entry in iter_entries():
        if entry_type and entry.get("t") != entry_type:
            continue
        blob = "{} {}".format(entry.get("content", ""), " ".join(entry.get("tags") or []))
        tokens = set(tokenize(blob))
        if not tokens:
            continue
        overlap = len(q_tokens & tokens)
        if overlap == 0 and q_tokens:
            continue
        days = 0.0
        try:
            ts = datetime.fromisoformat(entry["ts"].replace("Z", "+00:00"))
            days = max(0.0, (now - ts).total_seconds() / 86400.0)
        except (KeyError, ValueError, TypeError):
            days = 30.0
        recency = pow(2.718281828, -days / 30.0)
        score = overlap + 0.25 * recency
        scored.append(
            {
                "text": entry.get("content", ""),
                "type": entry.get("t"),
                "tags": entry.get("tags") or [],
                "project": entry.get("project"),
                "session_id": entry.get("session_id"),
                "timestamp": entry.get("ts"),
                "score": round(score, 4),
            }
        )
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[: max(1, min(limit, 50))]


def list_sessions(limit: int = 5) -> List[Dict[str, Any]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for entry in iter_entries():
        grouped.setdefault(entry.get("session_id") or "unknown", []).append(entry)
    rows = []
    for sid, items in grouped.items():
        latest = items[-1]
        summary = ""
        for item in reversed(items):
            if item.get("t") in ("session_end", "decision", "checkpoint"):
                summary = (item.get("content") or "")[:180]
                break
        rows.append(
            {
                "session_id": sid,
                "project": PROJECT,
                "entry_count": len(items),
                "latest_type": latest.get("t"),
                "latest_timestamp": latest.get("ts"),
                "summary": summary,
            }
        )
    rows.sort(key=lambda row: row.get("latest_timestamp") or "", reverse=True)
    return rows[: max(1, min(limit, 20))]


def continue_session(sid: str) -> Dict[str, Any]:
    items = [e for e in iter_entries() if e.get("session_id") == sid]
    decisions = [e["content"] for e in items if e.get("t") == "decision"]
    files = [e["content"] for e in items if e.get("t") == "file"]
    commands = [e["content"] for e in items if e.get("t") == "command"]
    return {
        "session_id": sid,
        "decisions": decisions,
        "files": files,
        "commands": commands,
        "entries": items,
    }


def write_index() -> Dict[str, Any]:
    decisions = [e for e in iter_entries() if e.get("t") == "decision"][-12:]
    sessions = list_sessions(5)
    lines = [
        "# 0uroboros memory index",
        "",
        "Project-local Shokunin memory. Regenerated by `python3 scripts/shokunin-memory.py index`.",
        "",
        "## Durable decisions",
        "",
    ]
    if decisions:
        for item in decisions:
            lines.append("- ({}) {}".format(item.get("ts", "?")[:10], item.get("content", "").strip()))
    else:
        lines.append("- None stored yet.")
    lines.extend(["", "## Recent sessions", ""])
    if sessions:
        for row in sessions:
            lines.append(
                "- `{}` · {} entries · {}".format(
                    row["session_id"], row["entry_count"], (row.get("summary") or "")[:120]
                )
            )
    else:
        lines.append("- None yet.")
    lines.append("")
    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text("\n".join(lines), encoding="utf-8")
    return {
        "paths": [str(INDEX_PATH)],
        "sessions": len(sessions),
        "decisions": len(decisions),
        "size_bytes": INDEX_PATH.stat().st_size,
    }


def stats() -> Dict[str, Any]:
    by_type: Dict[str, int] = {}
    total = 0
    for entry in iter_entries():
        total += 1
        key = str(entry.get("t") or "general")
        by_type[key] = by_type.get(key, 0) + 1
    return {
        "total_entries": total,
        "by_type": by_type,
        "by_project": {PROJECT: total},
        "store": str(MEMORY_DIR),
    }


def verify_path(raw: str) -> Dict[str, Any]:
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = (REPO_ROOT / path).resolve()
    else:
        path = path.resolve()
    try:
        path.relative_to(REPO_ROOT)
    except ValueError:
        return {"exists": False, "path": str(path), "error": "outside project root"}
    exists = path.exists()
    kind = "dir" if path.is_dir() else "file" if exists else "missing"
    modified = None
    if exists:
        modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
    return {"exists": exists, "path": str(path), "last_modified": modified, "kind": kind}


def forget(sid: str, pattern: Optional[str] = None) -> Dict[str, Any]:
    note = "Superseded session {}".format(sid)
    if pattern:
        note += " matching {}".format(pattern)
    stored = store(note, "general", tags=["superseded"], sid=sid)
    return {"superseded": True, "session_id": sid, "note_stored": True, "id": stored["id"]}


def cmd_save(args: argparse.Namespace) -> None:
    tags = [t.strip() for t in (args.tags or "").split(",") if t.strip()]
    print(json.dumps(store(args.text, args.type, tags=tags), indent=2))


def cmd_search(args: argparse.Namespace) -> None:
    print(json.dumps(search(args.query, args.type, args.limit), indent=2))


def cmd_sessions(args: argparse.Namespace) -> None:
    print(json.dumps(list_sessions(args.limit), indent=2))


def cmd_continue(args: argparse.Namespace) -> None:
    print(json.dumps(continue_session(args.session_id), indent=2))


def cmd_end(args: argparse.Namespace) -> None:
    print(json.dumps(store(args.text, "session_end"), indent=2))
    print(json.dumps(write_index(), indent=2))


def cmd_index(_args: argparse.Namespace) -> None:
    print(json.dumps(write_index(), indent=2))


def cmd_stats(_args: argparse.Namespace) -> None:
    print(json.dumps(stats(), indent=2))


# --- minimal MCP (JSON-RPC + Content-Length) ---

TOOLS = [
    {
        "name": "store_context",
        "description": "Store a project-local memory entry (decision, file, command, preference, checkpoint, session_end).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "type": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
                "session_id": {"type": "string"},
            },
            "required": ["text"],
        },
    },
    {
        "name": "search_context",
        "description": "Keyword search of project-local 0uroboros memory.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "type": {"type": "string"},
                "n_results": {"type": "integer"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "multi_search_context",
        "description": "Same store as search_context. Prefer this name if you used official Shokunin docs.",
        "inputSchema": {
            "type": "object",
            "properties": {"query": {"type": "string"}, "n_results": {"type": "integer"}},
            "required": ["query"],
        },
    },
    {
        "name": "list_sessions",
        "description": "List recent memory sessions for this project.",
        "inputSchema": {
            "type": "object",
            "properties": {"limit": {"type": "integer"}},
        },
    },
    {
        "name": "continue_session",
        "description": "Load one session's decisions, files, and commands.",
        "inputSchema": {
            "type": "object",
            "properties": {"session_id": {"type": "string"}},
            "required": ["session_id"],
        },
    },
    {
        "name": "save_message",
        "description": "Append a user or assistant message to the current session log.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "role": {"type": "string"},
                "session_id": {"type": "string"},
            },
            "required": ["text"],
        },
    },
    {
        "name": "memory_index",
        "description": "Regenerate .cursor/memory/index.md from stored entries.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "memory_stats",
        "description": "Counts of stored memory entries by type.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "memory_forget",
        "description": "Mark a session as superseded without deleting history.",
        "inputSchema": {
            "type": "object",
            "properties": {"session_id": {"type": "string"}, "text_pattern": {"type": "string"}},
            "required": ["session_id"],
        },
    },
    {
        "name": "verify_file_path",
        "description": "Verify a path exists. Paths outside this project are rejected.",
        "inputSchema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
]


def mcp_call(name: str, arguments: Dict[str, Any]) -> Any:
    if name in ("search_context", "multi_search_context"):
        return search(arguments["query"], arguments.get("type"), int(arguments.get("n_results") or 10))
    if name == "store_context":
        return store(
            arguments["text"],
            arguments.get("type") or "general",
            arguments.get("tags"),
            arguments.get("session_id"),
        )
    if name == "list_sessions":
        return {"sessions": list_sessions(int(arguments.get("limit") or 5))}
    if name == "continue_session":
        return continue_session(arguments["session_id"])
    if name == "save_message":
        return store(
            arguments["text"],
            "general",
            tags=["message"],
            sid=arguments.get("session_id"),
            role=arguments.get("role") or "user",
        )
    if name == "memory_index":
        return write_index()
    if name == "memory_stats":
        return stats()
    if name == "memory_forget":
        return forget(arguments["session_id"], arguments.get("text_pattern"))
    if name == "verify_file_path":
        return verify_path(arguments["path"])
    raise KeyError(name)


def write_rpc(payload: Dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    header = "Content-Length: {}\r\n\r\n".format(len(body)).encode("ascii")
    sys.stdout.buffer.write(header + body)
    sys.stdout.buffer.flush()


def read_rpc() -> Optional[Dict[str, Any]]:
    headers: Dict[str, str] = {}
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return None
        if line in (b"\r\n", b"\n"):
            break
        decoded = line.decode("utf-8", errors="replace")
        if ":" in decoded:
            key, value = decoded.split(":", 1)
            headers[key.strip().lower()] = value.strip()
    length = int(headers.get("content-length") or "0")
    if length <= 0:
        return None
    raw = sys.stdin.buffer.read(length)
    return json.loads(raw.decode("utf-8"))


def cmd_mcp(_args: argparse.Namespace) -> None:
    while True:
        message = read_rpc()
        if message is None:
            return
        method = message.get("method")
        req_id = message.get("id")
        if method == "initialize":
            write_rpc(
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "shokunin-memory", "version": "1.0.0"},
                    },
                }
            )
            continue
        if method == "notifications/initialized":
            continue
        if method == "tools/list":
            write_rpc({"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}})
            continue
        if method == "tools/call":
            params = message.get("params") or {}
            name = params.get("name")
            arguments = params.get("arguments") or {}
            try:
                result = mcp_call(name, arguments)
                write_rpc(
                    {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {
                            "content": [{"type": "text", "text": json.dumps(result, indent=2)}]
                        },
                    }
                )
            except Exception as exc:  # noqa: BLE001
                write_rpc(
                    {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": {"code": -32000, "message": str(exc)},
                    }
                )
            continue
        if req_id is not None:
            write_rpc(
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {"code": -32601, "message": "Method not found"},
                }
            )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Project-local Shokunin memory")
    sub = parser.add_subparsers(dest="cmd", required=True)

    save = sub.add_parser("save")
    save.add_argument("--type", default="general")
    save.add_argument("--text", required=True)
    save.add_argument("--tags", default="")
    save.set_defaults(func=cmd_save)

    srch = sub.add_parser("search")
    srch.add_argument("query")
    srch.add_argument("--type")
    srch.add_argument("--limit", type=int, default=10)
    srch.set_defaults(func=cmd_search)

    sess = sub.add_parser("sessions")
    sess.add_argument("--limit", type=int, default=5)
    sess.set_defaults(func=cmd_sessions)

    cont = sub.add_parser("continue")
    cont.add_argument("session_id")
    cont.set_defaults(func=cmd_continue)

    end = sub.add_parser("end")
    end.add_argument("--text", required=True)
    end.set_defaults(func=cmd_end)

    idx = sub.add_parser("index")
    idx.set_defaults(func=cmd_index)

    st = sub.add_parser("stats")
    st.set_defaults(func=cmd_stats)

    mcp = sub.add_parser("mcp")
    mcp.set_defaults(func=cmd_mcp)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
