#!/usr/bin/env bash
# Keep LIVE_OPENAI autonomous delivery alive across host interruptions.
set -u
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="$ROOT/tools/agent-harness/delivery/autonomous.log"
LOCK="$ROOT/tools/agent-harness/delivery/delivery.lock"
STATE="$ROOT/tools/agent-harness/delivery/state.json"
PIDFILE="$ROOT/tools/agent-harness/delivery/autonomous.pid"
WATCHLOG="$ROOT/tools/agent-harness/delivery/watchdog.log"
MAX_RESTARTS=8
DEADLINE=$(( $(date +%s) + 90*60 ))
restarts=0

ensure_vite() {
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:5176/?look=1" || true)
  if [ "$code" = "200" ]; then return 0; fi
  nohup npx vite --host 127.0.0.1 --port 5176 --strictPort > "$ROOT/tools/agent-harness/delivery/vite.log" 2>&1 &
  echo $! > "$ROOT/tools/agent-harness/delivery/vite.pid"
  for i in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:5176/?look=1" || true)
    [ "$code" = "200" ] && return 0
    sleep 0.5
  done
  return 1
}

clear_stale_lock() {
  if [ ! -f "$LOCK" ]; then return 0; fi
  pid=$(python3 -c "import json; print(json.load(open('$LOCK')).get('pid',0))")
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$LOCK"
    echo "$(date -u +%FT%TZ) cleared stale lock pid=$pid" >> "$WATCHLOG"
  fi
}

prepare_state() {
  python3 - <<'PY'
import json
from pathlib import Path
p=Path('tools/agent-harness/delivery/state.json')
s=json.loads(p.read_text())
s['stop_reason']='NONE'
s['paused_for_human']=False
s['worker_mode']='LIVE_OPENAI'
notes=list(dict.fromkeys([*(s.get('checkpoint_notes') or []), 'watchdog-keepalive']))
s['checkpoint_notes']=notes
p.write_text(json.dumps(s, indent=2)+'\n')
print(s['iteration'], s.get('next_objective'), round(s['budget']['known_spend_usd'],3))
PY
}

stop_reason() {
  python3 -c "import json; print(json.load(open('$STATE')).get('stop_reason','NONE'))"
}

echo "$(date -u +%FT%TZ) watchdog start" >> "$WATCHLOG"
ensure_vite || { echo "vite failed" >> "$WATCHLOG"; exit 2; }
prepare_state >> "$WATCHLOG"

while [ $(date +%s) -lt $DEADLINE ]; do
  reason=$(stop_reason)
  case "$reason" in
    HUMAN_DIRECTION_CHECKPOINT|BUDGET_LIMIT|UNRECOVERABLE_TECHNICAL_BLOCKER|HUMAN_RULE_DECISION_REQUIRED|AUTHORITY_BLOCK|USER_CANCELLED)
      echo "$(date -u +%FT%TZ) valid stop=$reason restarts=$restarts" >> "$WATCHLOG"
      exit 0
      ;;
  esac

  if pgrep -f 'src/delivery/cli.ts autonomous' >/dev/null; then
    sleep 20
    continue
  fi

  if [ "$restarts" -ge "$MAX_RESTARTS" ]; then
    echo "$(date -u +%FT%TZ) max restarts exhausted" >> "$WATCHLOG"
    exit 3
  fi

  clear_stale_lock
  prepare_state >> "$WATCHLOG"
  echo "$(date -u +%FT%TZ) launching autonomous restart=$restarts" >> "$WATCHLOG"
  nohup npm run delivery -- autonomous --tests-passed >> "$LOG" 2>&1 &
  echo $! > "$PIDFILE"
  restarts=$((restarts+1))
  sleep 30
done

echo "$(date -u +%FT%TZ) deadline reached restarts=$restarts" >> "$WATCHLOG"
exit 4
