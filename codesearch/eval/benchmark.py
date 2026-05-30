import json
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))

from qdrant_client import AsyncQdrantClient
from app.config import settings
from app.adapter.retrieval.sparse import BM25Index
from app.adapter.retrieval.fusion import hybrid_search
from app.adapter.retrieval.rerank import rerank
from app.adapter.llm.groq import expand_query

qdrant = AsyncQdrantClient(settings.qdrant_url)
bm25 = BM25Index.load(settings.bm25_index_path)

async def resolve_chunk_ids(expected_files: list[str]) -> list[str]:
    """Resolve file paths to actual Qdrant point UUIDs."""
    all_points = []
    next_offset = None
    while True:
        points, next_offset = await qdrant.scroll(
            collection_name=settings.qdrant_collection_name,
            limit=1000,
            offset=next_offset,
            with_payload=['file_path', 'function_name'],
            with_vectors=False,
        )
        all_points.extend(points)
        if not next_offset:
            break

    ids = []
    for file_path in expected_files:
        ids.extend([
            str(p.id) for p in all_points
            if p.payload.get('file_path', '').endswith(file_path)
        ])
    return list(set(ids))

async def retrieve_only(query: str, bm25_obj, queries: list[str]) -> list[str]:
    """Run retrieval + rerank and return chunk IDs."""
    candidates = await hybrid_search(query, bm25_obj, queries)
    corrected = queries[0] if queries else query
    reranked = await rerank(corrected, candidates, top_k=10)
    return [c.id for c in reranked]

def recall_at_k(retrieved_ids: list[str], relevant_ids: list[str], k: int) -> float:
    top_k = set(retrieved_ids[:k])
    relevant = set(relevant_ids)
    if not relevant:
        return 1.0
    return len(top_k & relevant) / len(relevant)

def mrr(retrieved_ids: list[str], relevant_ids: list[str]) -> float:
    relevant = set(relevant_ids)
    for rank, id_ in enumerate(retrieved_ids, 1):
        if id_ in relevant:
            return 1.0 / rank
    return 0.0

async def run_benchmark(test_queries_path: str = 'eval/test_queries.json'):
    with open(test_queries_path) as f:
        test_queries = json.load(f)

    k_values = [1, 3, 5, 10]
    results = {f'recall@{k}': [] for k in k_values}
    results['mrr'] = []
    results['details'] = []

    for i, test in enumerate(test_queries):
        query = test['query']
        expected_files = test['expected_files']

        print(f'[{i+1}/{len(test_queries)}] {query[:50]}...', end=' ', flush=True)

        # Expand query
        queries = await expand_query(query)

        # Retrieve
        corrected = queries[0] if queries else query
        candidates = await hybrid_search(corrected, bm25, queries)

        # Rerank
        reranked = await rerank(corrected, candidates, top_k=10)
        retrieved_ids = [c.id for c in reranked]

        # Resolve expected file paths to chunk IDs
        relevant_ids = await resolve_chunk_ids(expected_files)

        if not relevant_ids:
            print(f'SKIP (no chunks found for {expected_files})')
            continue

        for k in k_values:
            results[f'recall@{k}'].append(recall_at_k(retrieved_ids, relevant_ids, k))
        results['mrr'].append(mrr(retrieved_ids, relevant_ids))

        # Log top 3 results
        top3_files = [c.file_path for c in reranked[:3]]
        print(f'MRR={results["mrr"][-1]:.2f} | Top: {[f.split("/")[-1] for f in top3_files]}')

    print(f'\n{"="*50}')
    print(f'Results over {len(results["mrr"])} queries:')
    for k in k_values:
        vals = results[f'recall@{k}']
        if vals:
            print(f'  Recall@{k}: {sum(vals)/len(vals):.3f}')
    if results['mrr']:
        print(f'  MRR:      {sum(results["mrr"])/len(results["mrr"]):.3f}')
    print(f'{"="*50}')

    return results

if __name__ == '__main__':
    asyncio.run(run_benchmark())
