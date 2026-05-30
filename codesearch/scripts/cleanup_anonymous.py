#!/usr/bin/env python3
"""Delete all 'anonymous' chunks from Qdrant and re-index repos.

Usage:
    python scripts/cleanup_anonymous.py

Requires Qdrant running on localhost:6333.
"""
import json
import subprocess
import sys
import urllib.request

QDRANT_URL = "http://localhost:6333"
COLLECTION = "codebase"


def qdrant_post(path: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{QDRANT_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def count_anonymous() -> int:
    result = qdrant_post(
        f"/collections/{COLLECTION}/points/count",
        {"filter": {"must": [{"key": "function_name", "match": {"value": "anonymous"}}]}},
    )
    return result["result"]["count"]


def delete_anonymous() -> int:
    result = qdrant_post(
        f"/collections/{COLLECTION}/points/delete",
        {
            "filter": {"must": [{"key": "function_name", "match": {"value": "anonymous"}}]},
            "wait": True,
        },
    )
    return result["status"] == "ok"


def get_anonymous_repos() -> list[str]:
    result = qdrant_post(
        f"/collections/{COLLECTION}/points/scroll",
        {
            "filter": {"must": [{"key": "function_name", "match": {"value": "anonymous"}}]},
            "limit": 200,
            "with_payload": ["repo"],
        },
    )
    repos = set()
    for p in result["result"]["points"]:
        repo = p["payload"].get("repo", "")
        if repo:
            repos.add(repo)
    return sorted(repos)


def main():
    before = count_anonymous()
    print(f"Found {before} chunks with function_name='anonymous'")

    if before == 0:
        print("Nothing to clean up.")
        return

    repos = get_anonymous_repos()
    print(f"Affected repos: {', '.join(repos)}")

    print("Deleting anonymous chunks from Qdrant...")
    if delete_anonymous():
        after = count_anonymous()
        print(f"Deleted. Remaining anonymous: {after}")
    else:
        print("ERROR: Delete failed")
        sys.exit(1)

    print("\nTo re-index, run for each repo:")
    for repo in repos:
        print(f"  REPO_PATH=/Users/cvlikhith/Manthan/codesearch/repos/target/{repo} REPO_NAME={repo} ONESHOT=true go run ./cmd/indexer")


if __name__ == "__main__":
    main()
