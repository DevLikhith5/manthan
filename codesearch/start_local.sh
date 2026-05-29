#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
API_DIR="$ROOT_DIR/api"
EMBED_DIR="$ROOT_DIR/embedding-service"
FRONTEND_DIR="$ROOT_DIR/frontend"

start_qdrant() {
    if docker ps --format '{{.Names}}' | grep -q '^qdrant$'; then
        echo "Qdrant already running"
    else
        echo ">>> Starting Qdrant..."
        docker run -d --name qdrant \
            -p 6333:6333 -p 6334:6334 \
            qdrant/qdrant:v1.9.0
        echo "Qdrant started"
    fi
}

start_redis() {
    if redis-cli ping >/dev/null 2>&1; then
        echo "Redis already running"
    else
        echo ">>> Starting Redis..."
        redis-server --daemonize yes
        echo "Redis started"
    fi
}

wait_for_service() {
    local url=$1
    local name=$2
    echo ">>> Waiting for $name..."
    for i in $(seq 1 30); do
        if curl -sf "$url" >/dev/null 2>&1; then
            echo "$name ready!"
            return 0
        fi
        sleep 2
    done
    echo "Timed out waiting for $name"
    return 1
}

stop_all() {
    echo ">>> Stopping all services..."

    # Kill screen sessions
    screen -ls | grep -E 'manthan-api|manthan-embed|manthan-frontend' | awk -F. '{print $1}' | awk '{print $1}' | while read pid; do
        screen -S "$pid" -X quit 2>/dev/null || true
    done

    # Kill any leftover uvicorn processes on our ports
    pkill -f "uvicorn app.main:app --host 0.0.0.0 --port 8000" 2>/dev/null || true
    pkill -f "uvicorn main:app --host 0.0.0.0 --port 8081" 2>/dev/null || true

    echo "All services stopped"
}

start_api() {
    echo ">>> Starting API..."
    screen -dmS manthan-api bash -c "cd '$API_DIR' && VSCODE_PATH_PREFIX=/Users/cvlikhith/Manthan/codesearch/repos/target uvicorn app.main:app --host 0.0.0.0 --port 8000"
    echo "API started in screen 'manthan-api'"
}

start_embedding() {
    echo ">>> Starting Embedding Service..."
    screen -dmS manthan-embed bash -c "cd '$EMBED_DIR' && python3 -m uvicorn main:app --host 0.0.0.0 --port 8081"
    echo "Embedding started in screen 'manthan-embed'"
}

start_frontend() {
    echo ">>> Starting Frontend..."
    screen -dmS manthan-frontend bash -c "cd '$FRONTEND_DIR' && npm run dev"
    echo "Frontend started in screen 'manthan-frontend'"
}

status_check() {
    echo ""
    echo "=== Service Status ==="
    echo -n "Qdrant:     "; docker ps --format '{{.Names}}' | grep -q '^qdrant$' && echo "running" || echo "NOT running"
    echo -n "Redis:      "; redis-cli ping >/dev/null 2>&1 && echo "running" || echo "NOT running"
    echo -n "Embedding:  "; curl -sf http://localhost:8081/health >/dev/null 2>&1 && echo "running" || echo "NOT running"
    echo -n "API:        "; curl -sf http://localhost:8000/api/health >/dev/null 2>&1 && echo "running" || echo "NOT running"
    echo -n "Frontend:   "; curl -sf -o /dev/null -w "%{http_code}" http://localhost:5173/ | grep -q "200" && echo "running" || echo "NOT running"
    echo ""
    echo "=== Screen Sessions ==="
    screen -ls | grep -E 'manthan' || echo "No manthan screens"
    echo ""
    echo "URLs:"
    echo "  Frontend: http://localhost:5173"
    echo "  API:      http://localhost:8000"
}

usage() {
    echo "Usage: $0 [start|stop|restart|status]"
    echo ""
    echo "  start   - Start all services (default)"
    echo "  stop    - Stop all services"
    echo "  restart - Stop and start all services"
    echo "  status  - Check service status"
}

case "${1:-start}" in
    start)
        echo ">>> Starting Manthan services..."
        start_qdrant
        start_redis
        start_embedding
        start_api
        wait_for_service http://localhost:8000/api/health "API"
        start_frontend
        wait_for_service http://localhost:8081/health "Embedding"
        status_check
        echo ""
        echo "All services started! Use 'screen -r' to attach to sessions."
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        sleep 2
        $0 start
        ;;
    status)
        status_check
        ;;
    *)
        usage
        exit 1
        ;;
esac
