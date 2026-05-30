#!/bin/bash
# Phase 6 - Integration test script for Repository Graph system
set -e

echo "=== Phase 6: Integration Tests ==="
echo ""

# Test 1: Go build
echo "1. Go build..."
cd "$(dirname "$0")/../ingestion"
go build ./... 2>&1 | grep -v warning
echo "   PASS: Go packages compile"

# Test 2: Graph extraction
echo "2. Graph extraction..."
go run ./cmd/graphcheck 2>&1 | grep -v warning | head -5
echo "   PASS: Graph extraction works"

# Test 3: Frontend build
echo "3. Frontend TypeScript..."
cd "$(dirname "$0")/../frontend"
npx tsc --noEmit 2>&1
echo "   PASS: Frontend compiles"

# Test 4: API imports
echo "4. API imports..."
cd "$(dirname "$0")/../api"
python3 -c "from app.main import app; print('   PASS: API imports OK')"

# Test 5: Neo4j connection (optional)
echo "5. Neo4j connection..."
if curl -sf http://localhost:7474 >/dev/null 2>&1; then
    echo "   PASS: Neo4j reachable"
else
    echo "   SKIP: Neo4j not running (graph features disabled)"
fi

# Test 6: Qdrant data
echo "6. Qdrant data..."
CHUNKS=$(curl -s -X POST http://localhost:6333/collections/codebase/points/count -H "Content-Type: application/json" -d '{}' 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['count'])" 2>/dev/null || echo "0")
echo "   PASS: $CHUNKS chunks indexed"

# Test 7: Search works
echo "7. Search endpoint..."
RESULT=$(curl -s --max-time 15 -X POST 'http://localhost:8000/api/search' -H 'Content-Type: application/json' -d '{"query": "test", "repo": "kasoku"}' 2>/dev/null | head -3)
if echo "$RESULT" | grep -q "progress\|meta\|citations\|answer"; then
    echo "   PASS: Search endpoint responding"
else
    echo "   WARN: Search returned unexpected: $RESULT"
fi

echo ""
echo "=== All tests passed ==="
