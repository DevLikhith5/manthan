import time
import asyncio
from concurrent.futures import ThreadPoolExecutor
from sentence_transformers import CrossEncoder
from app.domain.entities import CodeChunk
from app.config import settings
from app.metrics.prometheus import RERANK_LATENCY

_executor = ThreadPoolExecutor(max_workers=1)
_reranker = None

def get_reranker() -> CrossEncoder:
    global _reranker
    if _reranker is None:
        _reranker = CrossEncoder(
            settings.reranker_model,
            max_length=512,
        )
    return _reranker

async def rerank(query: str, chunks: list[CodeChunk], top_k: int = 10) -> list[CodeChunk]:
    if not chunks:
        return []

    start = time.perf_counter()
    reranker = get_reranker()

    pairs = [(query, c.content[:1024]) for c in chunks]

    loop = asyncio.get_running_loop()
    scores = await loop.run_in_executor(
        _executor,
        lambda: reranker.predict(pairs, batch_size=32),
    )

    ranked = sorted(zip(scores, chunks), key=lambda x: x[0], reverse=True)

    elapsed = time.perf_counter() - start
    RERANK_LATENCY.observe(elapsed)

    return [chunk for _, chunk in ranked[:top_k]]
