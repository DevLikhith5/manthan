import re
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


def _metadata_context(chunk: CodeChunk) -> str:
    fields = []
    if chunk.repo:
        fields.append(f"REPO: {chunk.repo}")
    if chunk.language:
        fields.append(f"LANG: {chunk.language}")
    if chunk.file_path:
        fields.append(f"PATH: {chunk.file_path}")
    if chunk.function_name:
        fields.append(f"FUNC: {chunk.function_name}")
    if chunk.parent_class:
        fields.append(f"CLASS: {chunk.parent_class}")
    if chunk.signature:
        fields.append(f"SIGNATURE: {chunk.signature}")
    return '\n'.join(fields)


def _metadata_boost(query: str, chunk: CodeChunk) -> float:
    tokens = set(re.findall(r"[A-Za-z_][A-Za-z0-9_./-]*", query.lower()))
    meta = ' '.join([
        chunk.repo or '',
        chunk.language or '',
        chunk.file_path or '',
        chunk.function_name or '',
        chunk.parent_class or '',
        chunk.signature or '',
    ]).lower()
    hits = sum(1 for t in tokens if len(t) >= 3 and t in meta)
    return min(0.40, hits * 0.10)


def _path_boost(query: str, chunk: CodeChunk) -> float:
    if not chunk.file_path:
        return 0.0
    q = query.lower().replace('\\', '/')
    path = chunk.file_path.lower().replace('\\', '/')
    basename = path.split('/')[-1]

    if basename and basename in q:
        return 0.45
    if path in q or q in path:
        return 0.45

    tokens = set(re.findall(r"[A-Za-z_][A-Za-z0-9_./-]*", query.lower()))
    if not tokens:
        return 0.0

    path_tokens = set(re.findall(r"[A-Za-z0-9_.-]+", path))
    hits = sum(1 for t in tokens if len(t) >= 3 and (t in path_tokens or t in basename))
    if hits == 0:
        return 0.0
    boost = hits * 0.06
    if '/' in query or '.' in query:
        return min(0.45, boost)
    return min(0.25, boost)


async def rerank(query: str, chunks: list[CodeChunk], top_k: int = 10) -> list[CodeChunk]:
    if not chunks:
        return []

    start = time.perf_counter()
    reranker = get_reranker()

    pairs = []
    for c in chunks:
        content = c.content or ''
        if len(content) > 4096:
            content = content[:3072] + "\n...TRUNCATED...\n" + content[-1024:]
        pairs.append(
            (
                query,
                f"{_metadata_context(c)}\n\n{c.signature}\n\n{content}"
            )
        )

    loop = asyncio.get_running_loop()
    scores = await loop.run_in_executor(
        _executor,
        lambda: reranker.predict(pairs, batch_size=32),
    )

    scores = [float(s) + _metadata_boost(query, chunk) + _path_boost(query, chunk) for s, chunk in zip(scores, chunks)]
    ranked = sorted(zip(scores, chunks), key=lambda x: x[0], reverse=True)

    elapsed = time.perf_counter() - start
    RERANK_LATENCY.observe(elapsed)

    return [chunk for _, chunk in ranked[:top_k]]
