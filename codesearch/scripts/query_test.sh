#!/bin/bash
# Quick sanity check queries
# Usage: ./scripts/query_test.sh

set -euo pipefail

API_URL="${API_URL:-http://localhost:8000}"

queries=(
  "how does authentication work?"
  "where is the database connection handled?"
  "what functions handle error handling?"
  "how is logging configured?"
  "what is the main entrypoint?"
)

for q in "${queries[@]}"; do
  echo "=== Query: $q ==="
  curl -s -N -X POST "$API_URL/search" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg q "$q" '{query: $q}')" &
  sleep 2
  echo ""
done

wait
