#!/usr/bin/env bash
# Recall setup + run script.
# Installs deps (via uv, or venv+pip fallback), runs tests, reports model
# status, optionally seeds demo data, then starts the API.
# Usage:
#   ./script.sh [--port 8000] [--host 127.0.0.1] [--extras test,pdf]
#               [--skip-tests] [--prefetch-models] [--seed]
set -euo pipefail

PORT="8000"
HOST="127.0.0.1"
EXTRAS="test,pdf"
SKIP_TESTS="0"
PREFETCH="0"
SEED="0"

usage() {
  echo "Usage: ./script.sh [--port PORT] [--host HOST] [--extras a,b] [--skip-tests] [--prefetch-models] [--seed]"
  echo "  --extras: comma-separated uv extras (default: test,pdf). Use 'all' for ai,ocr,pdf,test."
  echo "  --prefetch-models: download embedding model now so first search is warm."
  echo "  --seed: insert 2 demo memories so search works immediately."
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --extras) EXTRAS="$2"; shift 2 ;;
    --skip-tests) SKIP_TESTS="1"; shift 1 ;;
    --prefetch-models) PREFETCH="1"; shift 1 ;;
    --seed) SEED="1"; shift 1 ;;
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

mkdir -p data data/uploads

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
  RUN_PREFIX="uv run"
else
  echo "[recall] uv not found, falling back to venv+pip..."
  [ -d .venv ] || python3 -m venv .venv
  # shellcheck disable=SC1091
  . .venv/bin/activate
  python -m pip install --upgrade pip
  python -m pip install -e ".[test]"
  RUN_PREFIX=""
fi

run_py() {
  if [ "$USE_UV" = "1" ]; then uv run python "$@"; else python "$@"; fi
}

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

echo ""
echo "[recall] model + dependency status:"
run_py -c "
from backend.app import models_info
import importlib.util
for k, m in models_info.models_status().items():
    state = 'READY' if m.get('ready') else 'fallback/offline-ok'
    print(f\"  {k:12s} {m.get('name','?')[:52]:52s} [{state}]\")
print('  (AI extras install: ./script.sh --extras all ; search works without them)')
"

if [ "$PREFETCH" = "1" ]; then
  echo ""
  echo "[recall] prefetching embedding model (first download only)..."
  run_py -c "
from backend.app import config, embeddings
v = embeddings.embed_texts(['warmup probe'], dim=config.EMBED_DIM)
print('  embedded OK, dim', v.shape)
" || echo "  (prefetch skipped: sentence-transformers not installed; search uses offline fallback)"
fi

if [ "$SEED" = "1" ]; then
  echo ""
  echo "[recall] seeding demo memories..."
  run_py -c "
import os
from backend.app import config, db
from backend.app import ingestion as ing
os.environ.setdefault('RECALL_DATA_DIR', './data')
db.init_db(config.DB_PATH)
ing.create_memory_record(config.DB_PATH, 'image', 'GitHub DNS error screenshot', '', 'https://github.com/example', 'Linux terminal showing failed GitHub connection caused by DNS resolution error', 'A screenshot of a Linux terminal showing a failed GitHub connection caused by a DNS resolution error.', '', '')
ing.create_memory_record(config.DB_PATH, 'text', 'FAISS notes', '', 'https://example.com', 'FAISS is a library for efficient dense vector similarity search with Flat and IVF indexes.', '', '', '')
ing.rebuild_index(config.DB_PATH)
print('  seeded.')
"
fi

echo ""
echo "[recall] how to add data:"
echo "  1. Browser UI  -> open http://$HOST:$PORT and use the Upload tab"
echo "     (drag-drop files, quick note form, or API examples)"
echo "  2. File upload -> curl -F \"files=@shot.png\" -F \"source=https://github.com/..\" http://$HOST:$PORT/api/upload"
echo "  3. Text note   -> curl -X POST http://$HOST:$PORT/api/memories -H 'Content-Type: application/json' -d '{\"title\":\"t\",\"content\":\"c\"}'"
echo "  4. Server path -> curl -X POST http://$HOST:$PORT/api/ingest -H 'Content-Type: application/json' -d '{\"path\":\"/abs/file.pdf\"}'"
echo ""
echo "[recall] starting server on http://$HOST:$PORT ..."
echo "[recall] health: curl http://$HOST:$PORT/api/health"
if [ "$USE_UV" = "1" ]; then
  # shellcheck disable=SC2086
  exec uv run uvicorn backend.app.main:app --host "$HOST" --port "$PORT"
else
  exec uvicorn backend.app.main:app --host "$HOST" --port "$PORT"
fi
