import os
import time
from app.domain.entities import CodeChunk
from app.adapter.retrieval.fusion import hybrid_search
from app.adapter.retrieval.rerank import rerank
from app.adapter.llm.groq import expand_query, build_prompt, stream_generate
from app.adapter.cache.redis import QueryCache
from app.config import settings
from app.metrics.prometheus import QUERY_LATENCY

cache = QueryCache()
repos_dir = '/tmp/codesearch_repos'

def get_repo_path(repo_name: str) -> str | None:
    path = os.path.join(repos_dir, repo_name)
    if os.path.exists(path):
        return path
    if settings.host_repo_path:
        path = os.path.join(settings.host_repo_path, repo_name)
        if os.path.exists(path):
            return path
    return None

async def search(query: str, bm25, language: str | None = None, top_k: int = 8, repo: str | None = None):
    start = time.perf_counter()

    cached = await cache.get(query)
    if cached:
        QUERY_LATENCY.observe(time.perf_counter() - start)
        yield {'type': 'citations', 'data': cached['citations']}
        yield {'type': 'answer', 'data': cached['answer'], 'citations': cached['citations']}
        yield {'type': '[DONE]'}
        return

    yield {'type': 'progress', 'data': 'Expanding query...'}
    queries = await expand_query(query)
    yield {'type': 'expanded_queries', 'data': queries}

    yield {'type': 'progress', 'data': 'Searching dense + sparse indexes...'}
    candidates = await hybrid_search(query, bm25, queries, repo=repo)

    corrected = queries[0] if queries else query

    yield {'type': 'progress', 'data': 'Reranking results...'}
    top_chunks = await rerank(corrected, candidates, top_k=top_k)

    # Build citations for UI.
    citations = []
    for c in top_chunks:
        repo_path = get_repo_path(c.repo) if c.repo else None
        base_path = repo_path or settings.host_repo_path or ''
        full_path = os.path.join(base_path, c.file_path) if base_path else c.file_path
        if os.path.exists(full_path):
            vscode_path = os.path.join(settings.vscode_path_prefix, c.repo, c.file_path) if settings.vscode_path_prefix and c.repo else full_path
            citations.append({
                'file': vscode_path,
                'path': c.file_path,
                'function': c.function_name,
                'start_line': c.start_line,
                'end_line': c.end_line,
                'repo': c.repo,
            })

    yield {'type': 'citations', 'data': citations}

    prompt = build_prompt(query, top_chunks)

    yield {'type': 'progress', 'data': 'Generating answer with LLM...'}
    full_answer = ''
    async for token in stream_generate(prompt):
        full_answer += token
        yield {'type': 'token', 'data': token}

    await cache.set(query, {'answer': full_answer, 'citations': citations})
    QUERY_LATENCY.observe(time.perf_counter() - start)

    yield {'type': '[DONE]'}
