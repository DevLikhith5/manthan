#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
API_PORT=8000
FRONTEND_PORT=5173
EMBED_PORT=8081

stop_all() {
  echo "Stopping all processes..."
  pkill -f "uvicorn app.main:app" 2>/dev/null || true
  pkill -f "vite" 2>/dev/null || true
  pkill -f indexer 2>/dev/null || true
  sleep 1
  echo "All stopped"
}

start_all() {
  echo "Loading environment variables..."
  [ -f "$ROOT/.env" ] && set -a && source "$ROOT/.env" && set +a

  echo "Starting embedding service..."
  cd "$ROOT/embedding-service"
  screen -dmS embed bash -c "python3 -m uvicorn main:app --host 0.0.0.0 --port $EMBED_PORT"
  sleep 2

  echo "Starting API..."
  cd "$ROOT/api"
  export GROQ_API_KEY="${GROQ_API_KEY:-}"
  export INDEXER_PATH=/tmp/indexer
  export HOST_REPO_PATH=$ROOT/repos/target
  screen -dmS api bash -c "python3 -m uvicorn app.main:app --host 0.0.0.0 --port $API_PORT"
  sleep 3

  echo "Starting frontend..."
  cd "$ROOT/frontend"
  screen -dmS frontend bash -c "npm run dev"
  sleep 2

  echo ""
  echo "================================="
  echo " All services running"
  echo "================================="
  echo " Frontend  : http://localhost:$FRONTEND_PORT"
  echo " API       : http://localhost:$API_PORT"
  echo " Embedding : http://localhost:$EMBED_PORT"
  echo ""
  echo " Stop with: ./run.sh stop"
  echo "================================="
}

reset_collection() {
  echo "Deleting Qdrant collection 'codebase'..."
  curl -s -X DELETE "http://localhost:6333/collections/codebase" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','error'))"
  echo "Done. Re-add your repo from the UI."
}

case "${1:-}" in
  stop)
    stop_all
    ;;
  reset)
    stop_all
    reset_collection
    ;;
  restart)
    stop_all
    sleep 1
    start_all
    ;;
  *)
    start_all
    ;;
esac
