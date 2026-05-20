#!/usr/bin/env bash
# One-click restart for the Relay LLM Gateway dev stack.
#
#   ./restart.sh                 restart backend + frontend
#   START_WORKER=1 ./restart.sh  also (re)start the arq worker
#
# Processes are matched by port (backend :8000, frontend :5173), so Claude Code
# worktree dev servers running on other ports are never touched.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT=8000
FRONTEND_PORT=5173
BACKEND_LOG=/tmp/relay-backend.log
FRONTEND_LOG=/tmp/relay-frontend.log
WORKER_LOG=/tmp/relay-worker.log
START_WORKER=${START_WORKER:-0}

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

wait_for() {  # description, timeout-seconds, test-command...
  local desc=$1 timeout=$2 i=0; shift 2
  while [ "$i" -lt "$timeout" ]; do
    if "$@" >/dev/null 2>&1; then echo "  $desc: up"; return 0; fi
    sleep 1; i=$((i + 1))
  done
  echo "  $desc: NOT up after ${timeout}s"
  return 1
}

echo "==> Stopping..."
kill_port "$BACKEND_PORT" "backend"
kill_port "$FRONTEND_PORT" "frontend"
if [ "$START_WORKER" = 1 ]; then
  pkill -f 'arq app.worker.WorkerSettings' 2>/dev/null \
    && echo "  worker: stopped" || echo "  worker: not running"
fi

echo "==> Starting..."
( cd "$ROOT/backend" && nohup .venv/bin/uvicorn app.main:app \
    --host 127.0.0.1 --port "$BACKEND_PORT" > "$BACKEND_LOG" 2>&1 & )
echo "  backend  -> $BACKEND_LOG"
( cd "$ROOT/frontend" && nohup npm run dev > "$FRONTEND_LOG" 2>&1 & )
echo "  frontend -> $FRONTEND_LOG"
if [ "$START_WORKER" = 1 ]; then
  ( cd "$ROOT/backend" && nohup .venv/bin/arq app.worker.WorkerSettings > "$WORKER_LOG" 2>&1 & )
  echo "  worker   -> $WORKER_LOG"
fi

echo "==> Health check..."
ok=1
wait_for "backend  (:$BACKEND_PORT)" 25 \
  curl -sf -m 2 "http://127.0.0.1:$BACKEND_PORT/readyz" || { ok=0; tail -15 "$BACKEND_LOG"; }
wait_for "frontend (:$FRONTEND_PORT)" 30 \
  lsof -ti tcp:"$FRONTEND_PORT" -sTCP:LISTEN || { ok=0; tail -15 "$FRONTEND_LOG"; }

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
