#!/usr/bin/env bash
# One-click control for the Relay LLM Gateway dev stack:
#   backend (uvicorn :8000) + frontend (vite :5173) + arq worker.
#
#   ./restart.sh                  stop everything, then start the full stack
#   ./restart.sh stop             stop everything and exit (kill, no restart)
#   ./restart.sh start            alias for the default (stop + start)
#   START_WORKER=0 ./restart.sh   start backend + frontend only (skip worker)
#
# backend/frontend are matched by listening port (:8000 / :5173), so dev
# servers from Claude Code worktrees on other ports are never touched. The arq
# worker has no port, so it is matched by command line — a worktree worker, if
# any, would also be stopped.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT=8000
FRONTEND_PORT=5173
BACKEND_LOG=/tmp/relay-backend.log
FRONTEND_LOG=/tmp/relay-frontend.log
WORKER_LOG=/tmp/relay-worker.log
WORKER_MATCH='arq app.worker.WorkerSettings'
START_WORKER=${START_WORKER:-1}
MODE=${1:-restart}

kill_port() {  # port, label
  local port=$1 label=$2 pids parents="" p pp
  pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')
  if [ -z "${pids// /}" ]; then
    echo "  $label: nothing on :$port"
    return
  fi
  for p in $pids; do
    pp=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
    [ -n "$pp" ] && [ "$pp" != 1 ] && parents="$parents $pp"
  done
  echo "  $label: stopping pid(s)$( printf ' %s' $pids )"
  kill $pids $parents 2>/dev/null
  for _ in 1 2 3 4 5; do
    lsof -ti tcp:"$port" -sTCP:LISTEN >/dev/null 2>&1 || return
    sleep 1
  done
  local left
  left=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')
  [ -n "${left// /}" ] && { echo "  $label: force-killing$( printf ' %s' $left )"; kill -9 $left 2>/dev/null; }
}

kill_worker() {
  if pgrep -f "$WORKER_MATCH" >/dev/null 2>&1; then
    pkill -f "$WORKER_MATCH" 2>/dev/null
    echo "  worker: stopped"
  else
    echo "  worker: nothing running"
  fi
}

wait_for() {  # description, timeout-seconds, test-command...
  local desc=$1 timeout=$2 i=0; shift 2
  while [ "$i" -lt "$timeout" ]; do
    if "$@" >/dev/null 2>&1; then echo "  $desc: up"; return 0; fi
    sleep 1; i=$((i + 1))
  done
  echo "  $desc: NOT up after ${timeout}s"
  return 1
}

# ---------------- stop ----------------
echo "==> Stopping..."
kill_port "$BACKEND_PORT" "backend"
kill_port "$FRONTEND_PORT" "frontend"
kill_worker

if [ "$MODE" = stop ]; then
  echo
  echo "All stopped."
  exit 0
fi

# ---------------- start ----------------
echo "==> Starting..."
( cd "$ROOT/backend" && nohup .venv/bin/uvicorn app.main:app \
    --host 127.0.0.1 --port "$BACKEND_PORT" > "$BACKEND_LOG" 2>&1 & )
echo "  backend  -> $BACKEND_LOG"
( cd "$ROOT/frontend" && nohup npm run dev > "$FRONTEND_LOG" 2>&1 & )
echo "  frontend -> $FRONTEND_LOG"
if [ "$START_WORKER" = 1 ]; then
  ( cd "$ROOT/backend" && nohup .venv/bin/arq app.worker.WorkerSettings > "$WORKER_LOG" 2>&1 & )
  echo "  worker   -> $WORKER_LOG"
else
  echo "  worker   -> skipped (START_WORKER=0)"
fi

# ---------------- health check ----------------
echo "==> Health check..."
ok=1
wait_for "backend  (:$BACKEND_PORT)" 25 \
  curl -sf -m 2 "http://127.0.0.1:$BACKEND_PORT/readyz" || { ok=0; tail -15 "$BACKEND_LOG"; }
wait_for "frontend (:$FRONTEND_PORT)" 30 \
  lsof -ti tcp:"$FRONTEND_PORT" -sTCP:LISTEN || { ok=0; tail -15 "$FRONTEND_LOG"; }
if [ "$START_WORKER" = 1 ]; then
  wait_for "worker   (arq)" 15 pgrep -f "$WORKER_MATCH" || { ok=0; tail -15 "$WORKER_LOG"; }
fi

echo
if [ "$ok" = 1 ]; then
  echo "All up."
  echo "  backend   http://127.0.0.1:$BACKEND_PORT"
  echo "  frontend  http://localhost:$FRONTEND_PORT"
  [ "$START_WORKER" = 1 ] && echo "  worker    running (arq)"
  exit 0
else
  echo "Something failed to start — see the log tail above."
  exit 1
fi
