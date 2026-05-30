#!/usr/bin/env python3
"""Rebuild BM25 index from Qdrant data in the format the API expects."""
import json
import re
import urllib.request

QDRANT = "http://localhost:6333"
OUTPUT = "/Users/cvlikhith/Manthan/codesearch/data/bm25.pkl"


def qdrant_scroll(offset=None):
    body = {
        "limit": 1000,
        "with_payload": [
            "file_path", "function_name", "content",
            "repo", "language", "signature", "parent_class",
            "start_line", "end_line",
        ],
    }
    if offset:
        body["offset"] = str(offset)
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{QDRANT}/collections/codebase/points/scroll",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


PUNCT = ".,;:!?\"'()[]{}\\/<>=+-_*&^%$#@~`"


def tokenize(text):
    return [t.strip(PUNCT).lower() for t in text.split() if t.strip(PUNCT)]


corpus = []
chunks_data = []
offset = None

while True:
    result = qdrant_scroll(offset)
    points = result["result"]["points"]
    for p in points:
        pl = p["payload"]
        content = pl.get("content", "")
        corpus.append(tokenize(content))
        chunks_data.append({
            "ID": p["id"],
            "Content": content,
            "FilePath": pl.get("file_path", ""),
            "Name": pl.get("function_name", ""),
            "Language": pl.get("language", ""),
            "Repo": pl.get("repo", ""),
            "Signature": pl.get("signature", ""),
            "ParentClass": pl.get("parent_class", ""),
            "StartLine": pl.get("start_line", 0),
            "EndLine": pl.get("end_line", 0),
        })
    offset = result["result"].get("next_page_offset")
    if not offset:
        break

bm25 = {"corpus": corpus, "chunks": chunks_data}
with open(OUTPUT, "w") as f:
    json.dump(bm25, f)

repos = {}
for c in chunks_data:
    r = c["Repo"]
    repos[r] = repos.get(r, 0) + 1
print(f"Rebuilt BM25 with {len(chunks_data)} docs")
for r, cnt in sorted(repos.items(), key=lambda x: -x[1]):
    print(f"  {r}: {cnt}")
