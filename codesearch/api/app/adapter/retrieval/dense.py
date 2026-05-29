import asyncio
import httpx
import logging
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue
from app.config import settings
from app.domain.entities import CodeChunk
from app.infra.retry import retry_with_backoff
from app.infra.circuit_breaker import CircuitBreaker

logger = logging.getLogger(__name__)

qdrant = AsyncQdrantClient(settings.qdrant_url)
_http_client = httpx.AsyncClient(timeout=60.0)
_embed_cb = CircuitBreaker(name='embedding', failure_threshold=5, recovery_timeout=30.0)
_embed_sem = asyncio.Semaphore(4)

async def _do_embed(text: str) -> list[float]:
    async with _embed_sem:
        resp = await _http_client.post(
            f'{settings.embedding_service_url}/embed',
            json={'texts': [text]},
        )
        resp.raise_for_status()
        data = resp.json()
        return data['embeddings'][0]

async def embed_query(text: str) -> list[float]:
    async def call():
        return await _embed_cb.call(_do_embed, text)
    return await retry_with_backoff(
        call,
        max_retries=settings.embedding_retry_max,
        base_delay=0.5,
    )

def _build_filter(language: str | None = None, repo: str | None = None) -> Filter | None:
    conditions = []
    if language:
        conditions.append(FieldCondition(key='language', match=MatchValue(value=language)))
    if repo:
        conditions.append(FieldCondition(key='repo', match=MatchValue(value=repo)))
    if not conditions:
        return None
    return Filter(must=conditions)

async def dense_search(
    query: str,
    vector_name: str = 'code',
    k: int = 50,
    language: str | None = None,
    repo: str | None = None,
) -> list[CodeChunk]:
    query_vec = await embed_query(query)

    results = await qdrant.search(
        collection_name='codebase',
        query_vector=(vector_name, query_vec),
        query_filter=_build_filter(language, repo),
        limit=k,
        with_payload=True,
        with_vectors=False,
    )

    return [
        CodeChunk(
            id=str(r.id),
            score=r.score,
            content=r.payload.get('content', ''),
            file_path=r.payload.get('file_path', ''),
            function_name=r.payload.get('function_name', ''),
            start_line=r.payload.get('start_line', 0),
            end_line=r.payload.get('end_line', 0),
            language=r.payload.get('language', ''),
            signature=r.payload.get('signature', ''),
            parent_class=r.payload.get('parent_class', ''),
            repo=r.payload.get('repo', ''),
        )
        for r in results
    ]
