#!/usr/bin/env bash
# Recall setup + run script.
# Installs deps (via uv, or venv+pip fallback), runs tests, starts the API.
# Usage:
#   ./script.sh [--port 8000] [--host 127.0.0.1] [--extras test] [--skip-tests]
set -euo pipefail

PORT="8000"
HOST="127.0.0.1"
EXTRAS="test"
SKIP_TESTS="0"

usage() {
  echo "Usage: ./script.sh [--port PORT] [--host HOST] [--extras a,b] [--skip-tests]"
  echo "  --extras: comma-separated uv extras (default: test). Use 'all' for ai,ocr,pdf,test."
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --extras) EXTRAS="$2"; shift 2 ;;
    --skip-tests) SKIP_TESTS="1"; shift 1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

cd "$(dirname "$0")"

if [ "$EXTRAS" = "all" ]; then
  EXTRAS="ai,ocr,pdf,test"
fi

command -v python3 >/dev/null || { echo "ERROR: python3 not found (>=3.10 required)."; exit 1; }
python3 -c "import sys; assert sys.version_info >= (3,10), sys.version" \
  || { echo "ERROR: Python >=3.10 required."; exit 1; }

mkdir -p data

USE_UV="0"
if command -v uv >/dev/null 2>&1; then
  USE_UV="1"
fi

if [ "$USE_UV" = "1" ]; then
  echo "[recall] syncing deps via uv (extras: $EXTRAS)..."
  EXTRA_ARGS=""
  OLD_IFS="$IFS"; IFS=","
  # shellcheck disable=SC2162
  for e in $EXTRAS; do
    e="$(echo "$e" | tr -d ' ')"
    [ -n "$e" ] && EXTRA_ARGS="$EXTRA_ARGS --extra $e"
  done
  IFS="$OLD_IFS"
  # shellcheck disable=SC2086
  uv sync $EXTRA_ARGS
  RUN="uv run"
else
  echo "[recall] uv not found, falling back to venv+pip..."
  [ -d .venv ] || python3 -m venv .venv
  # shellcheck disable=SC1091
  . .venv/bin/activate
  python -m pip install --upgrade pip
  python -m pip install -e ".[test]"
  RUN=""
fi

if [ "$SKIP_TESTS" = "0" ]; then
  echo "[recall] running tests..."
  if [ "$USE_UV" = "1" ]; then
    uv run pytest -q
  else
    python -m pytest -q
  fi
else
  echo "[recall] skipping tests."
fi

export RECALL_DATA_DIR="${RECALL_DATA_DIR:-./data}"

echo "[recall] starting server on http://$HOST:$PORT ..."
echo "[recall] health: curl http://$HOST:$PORT/api/health"
if [ "$USE_UV" = "1" ]; then
  # shellcheck disable=SC2086
  exec uv run uvicorn backend.app.main:app --host "$HOST" --port "$PORT"
else
  # shellcheck disable=SC2086
  exec $RUN uvicorn backend.app.main:app --host "$HOST" --port "$PORT"
fi
