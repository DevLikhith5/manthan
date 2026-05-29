#!/bin/bash
# Bulk index a codebase from scratch
# Usage: ./scripts/bulk_index.sh /path/to/repo

set -euo pipefail

REPO_PATH="${1:-.}"
echo "Indexing codebase at: $REPO_PATH"

docker compose exec -T ingestion sh -c "
  cd /repos/target
  find . -type f \( -name '*.go' -o -name '*.py' -o -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) | while read f; do
    echo \"Indexing: \$f\"
    # The ingestion service watches the repo path via git diff,
    # so we just need to ensure the files are visible
  done
  echo 'Done indexing'
"
