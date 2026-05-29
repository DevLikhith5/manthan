import asyncio
import logging
import time
from app.domain.entities import CodeChunk
from app.adapter.retrieval.dense import dense_search
from app.adapter.retrieval.sparse import BM25Index
from app.metrics.prometheus import RETRIEVAL_LATENCY

logger = logging.getLogger(__name__)

RRF_K = 10

def rrf_score(rank: int) -> float:
    return 1.0 / (RRF_K + rank + 1)

async def hybrid_search(
    query: str,
    bm25: BM25Index,
    queries: list[str],
    k_dense: int = 50,
    k_sparse: int = 50,
    final_k: int = 20,
    repo: str | None = None,
) -> list[CodeChunk]:
    start = time.perf_counter()

    tasks = []

    # Corrected query (queries[0]) searches both code + docstring vectors
    tasks.append(dense_search(queries[0], vector_name='code', k=k_dense, repo=repo))
    tasks.append(dense_search(queries[0], vector_name='docstring', k=k_dense, repo=repo))

    # Expanded queries (variations) search only code vector
    for q in queries[1:]:
        tasks.append(dense_search(q, vector_name='code', k=k_dense, repo=repo))

    all_dense_results = await asyncio.gather(*tasks)

    # Sparse search only on the corrected query
    sparse_results = bm25.search(queries[0], k=k_sparse)
    if repo:
        sparse_results = [c for c in sparse_results if c.repo == repo or not c.repo]

    scores: dict[str, float] = {}
    chunks: dict[str, CodeChunk] = {}

    # Dense results
    for results in all_dense_results:
        for rank, chunk in enumerate(results):
            scores[chunk.id] = scores.get(chunk.id, 0) + rrf_score(rank)
            chunks[chunk.id] = chunk

    # Sparse results
    for rank, chunk in enumerate(sparse_results):
        scores[chunk.id] = scores.get(chunk.id, 0) + rrf_score(rank)
        chunks[chunk.id] = chunk

    sorted_ids = sorted(scores, key=lambda x: scores[x], reverse=True)

    elapsed = time.perf_counter() - start
    RETRIEVAL_LATENCY.observe(elapsed)

    return [chunks[id] for id in sorted_ids[:final_k]]
