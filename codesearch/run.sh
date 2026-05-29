#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

case "${1:-up}" in
  up)
    echo ">>> Building images..."
    docker compose build
    echo ">>> Launching all services..."
    docker compose --env-file .env up -d
    echo ">>> Waiting for API... (slow imports ~60s)"
    for i in $(seq 1 30); do
      if curl -sf http://localhost:8000/api/health >/dev/null 2>&1; then
        echo ">>> API ready! http://localhost:8000"
        exit 0
      fi
      sleep 2
    done
    echo "Timed out waiting for API"
    exit 1
    ;;
  down)
    docker compose down
    ;;
  logs)
    shift
    docker compose logs -f "$@"
    ;;
  search)
    shift
    curl -s -N -X POST http://localhost:8000/api/search \
      -H 'Content-Type: application/json' \
      -d "$(jo query="${1:-how does WAL work}" top_k=5)"
    ;;
  health)
    curl -s http://localhost:8000/api/health | python3 -m json.tool
    ;;
  ps)
    docker compose ps
    ;;
  rebuild)
    shift
    for svc in "$@"; do
      docker compose build --no-cache "$svc"
    done
    docker compose up -d "$@"
    ;;
  *)
    echo "Usage: $0 [up|down|logs|search|health|ps|rebuild]"
    ;;
esac
