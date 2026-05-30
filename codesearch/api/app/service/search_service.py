import os
import time
import asyncio
import re
from app.domain.entities import CodeChunk
from app.adapter.retrieval.fusion import hybrid_search
from app.adapter.retrieval.rerank import rerank
from app.adapter.retrieval.query_classifier import classify_query
from app.adapter.llm.groq import expand_query, generate_hypothetical_documents, decompose_query, build_prompt, stream_generate, reset_request_stats, get_request_stats, get_key_debug_stats
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


def _build_repo_prefixed_path(prefix: str, repo_name: str, file_path: str) -> str:
    normalized = file_path.lstrip('/').replace('\\', '/')
    if '://' in prefix:
        return f"{prefix.rstrip('/')}/{repo_name}/{normalized}"
    return os.path.join(prefix, repo_name, normalized)


def _normalize_citation_file(citation: dict) -> str:
    if not citation:
        return ''

    declared_file = citation.get('file') or citation.get('path') or ''
    if declared_file:
        if os.path.exists(declared_file) or '://' in declared_file:
            return declared_file

    file_path = citation.get('path') or ''
    repo_name = citation.get('repo')
    candidates: list[str] = []
    if file_path and repo_name:
        repo_path = get_repo_path(repo_name)
        if repo_path:
            candidates.append(os.path.join(repo_path, file_path))
        if settings.host_repo_path:
            candidates.append(os.path.join(settings.host_repo_path, repo_name, file_path))
        if settings.vscode_path_prefix:
            candidates.append(_build_repo_prefixed_path(settings.vscode_path_prefix, repo_name, file_path))

    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    for candidate in candidates:
        if '://' in candidate:
            return candidate

    return declared_file


def _normalize_citations(citations: list[dict]) -> list[dict]:
    return [
        {**citation, 'file': _normalize_citation_file(citation)}
        for citation in citations
    ]


def _cache_key(query: str, repo: str | None, language: str | None, top_k: int) -> str:
    knobs = {
        'schema': settings.cache_schema_version,
        'repo': repo or '',
        'language': language or '',
        'top_k': top_k,
        'max_exp': settings.retrieval_max_expansions,
        'base_k': settings.retrieval_base_k,
        'max_k': settings.retrieval_max_k,
        'rerank_k': settings.rerank_input_k,
        'adaptive': settings.enable_adaptive_retrieval,
        'diversity': settings.enable_diversity_packing,
        'exact_boost': settings.retrieval_exact_match_boost,
        'conf_thr': settings.retrieval_confidence_threshold,
        'hard_k': settings.rerank_hard_query_k,
        'evidence_n': settings.min_distinct_evidence_points,
        'gate': settings.enable_low_confidence_gating,
    }
    return f"{query}|{knobs}"


def _pack_diverse(chunks: list[CodeChunk], top_k: int) -> list[CodeChunk]:
    if not settings.enable_diversity_packing or len(chunks) <= top_k:
        return chunks[:top_k]

    by_file = {}
    for c in chunks:
        by_file.setdefault(c.file_path, []).append(c)

    packed = []
    while len(packed) < top_k:
        progressed = False
        for file_path in list(by_file.keys()):
            bucket = by_file[file_path]
            if not bucket:
                continue
            packed.append(bucket.pop(0))
            progressed = True
            if len(packed) >= top_k:
                break
        if not progressed:
            break

    return packed[:top_k]


def _component_key(file_path: str) -> str:
    """Extract a component key from file path using directory structure.
    
    Uses the top two directory segments as the component boundary.
    Works for any project structure without hardcoded keywords.
    
    Examples:
        frontend/src/api/client.ts -> frontend/src
        backend/routes/handler.go -> backend/routes
        src/components/Button.tsx -> src/components
        lib/utils/helpers.ts -> lib/utils
    """
    parts = (file_path or '').replace('\\', '/').strip('/').split('/')
    if len(parts) >= 2:
        return '/'.join(parts[:2])
    if len(parts) == 1:
        return parts[0]
    return 'root'


def _pack_component_diverse(chunks: list[CodeChunk], top_k: int) -> list[CodeChunk]:
    """Ensure results span multiple components for architectural queries.
    
    Groups chunks by their top-level directory structure and round-robins
    across groups to guarantee coverage of different parts of the codebase.
    """
    by_component: dict[str, list[CodeChunk]] = {}
    for c in chunks:
        comp = _component_key(c.file_path)
        by_component.setdefault(comp, []).append(c)

    # Sort components by count (largest first) for fair round-robin
    sorted_components = sorted(by_component.keys(), key=lambda k: len(by_component[k]), reverse=True)

    packed = []
    while len(packed) < top_k:
        progressed = False
        for comp in sorted_components:
            bucket = by_component.get(comp, [])
            if bucket:
                packed.append(bucket.pop(0))
                progressed = True
            if len(packed) >= top_k:
                break
        if not progressed:
            break

    return packed[:top_k]


def _low_confidence_answer(top_chunks: list[CodeChunk], reasons: list[str], confidence: float) -> str:
    lines = [
        f"I don't have enough strong evidence to provide a high-confidence explanation yet (confidence={confidence:.2f}).",
        "Most relevant code locations:",
    ]
    for c in top_chunks[:5]:
        lines.append(f"- {c.file_path}:{c.start_line}-{c.end_line} ({c.function_name or 'symbol'})")
    lines.append(f"Why: {', '.join(reasons)}")
    lines.append('Please refine the question with a specific function, file path, or component boundary.')
    return '\n'.join(lines)


def _service_inventory_fallback(top_chunks: list[CodeChunk]) -> str:
    service_map: dict[str, str] = {}
    for c in top_chunks:
        m = re.search(r"services/([^/]+)", c.file_path or "")
        if not m:
            continue
        svc = m.group(1)
        if svc in service_map:
            continue
        one_liner = f"- {svc}: likely handles logic around `{(c.function_name or 'core flow')}` [{c.file_path}:{c.start_line}-{c.end_line}]"
        service_map[svc] = one_liner

    if not service_map:
        return _low_confidence_answer(top_chunks, ['no_service_signals'], 0.0)

    lines = [
        "LLM generation is temporarily unavailable, but here is a service inventory from retrieved code evidence:",
        *service_map.values(),
        "Ask again in ~30-60s for richer natural-language summaries per service.",
    ]
    return '\n'.join(lines)


def _verify_citations(answer: str, top_chunks: list[CodeChunk]) -> str:
    valid_paths = {c.file_path for c in top_chunks}
    valid_functions = {c.function_name for c in top_chunks if c.function_name}

    citation_pattern = re.compile(r'\[([^\]]+?)(?::(\d+)(?:-(\d+))?)?\]')
    citations = citation_pattern.findall(answer)

    has_unsupported = False
    for path_ref, _, _ in citations:
        if not path_ref:
            continue
        path_clean = path_ref.strip()
        if path_clean in valid_paths:
            continue
        if path_clean in valid_functions:
            continue
        if any(path_clean in vp or vp.endswith(path_clean) for vp in valid_paths):
            continue
        has_unsupported = True
        break

    if not has_unsupported:
        return answer

    source_list = '\n'.join(
        f'- {c.file_path}:{c.start_line}-{c.end_line} ({c.function_name or "N/A"})'
        for c in top_chunks[:5]
    )

    warning = (
        '\n\n⚠️ **Note:** Some claims above could not be verified against the retrieved code. '
        'Trust only claims backed by `[file:line]` citations. '
        'Verified sources:\n' + source_list
    )
    return answer + warning


async def search(query: str, bm25, language: str | None = None, top_k: int = 8, repo: str | None = None, history: list[dict] | None = None):
    reset_request_stats()
    start = time.perf_counter()
    effective_top_k = min(max(1, top_k), settings.rerank_input_k)
    cache_key = _cache_key(query, repo, language, effective_top_k)

    cached = await cache.get(cache_key)
    if cached:
        QUERY_LATENCY.observe(time.perf_counter() - start)
        cached_citations = _normalize_citations(cached.get('citations', []))
        if cached.get('meta'):
            yield {'type': 'meta', 'data': cached['meta']}
        yield {'type': 'citations', 'data': cached_citations}
        yield {'type': 'answer', 'data': cached['answer'], 'citations': cached_citations}
        yield {'type': '[DONE]'}
        return

    yield {'type': 'progress', 'data': 'Expanding query...'}
    classified = classify_query(query)
    queries = await expand_query(query, repo=repo)
    yield {'type': 'debug', 'data': {'stage': 'post_expand', 'llm': get_request_stats(), 'repo': repo}}
    yield {'type': 'expanded_queries', 'data': queries}

    # For architectural queries, decompose into sub-questions for multi-component coverage
    sub_queries = []
    if classified.is_architectural:
        yield {'type': 'progress', 'data': 'Decomposing architectural query...'}
        try:
            sub_queries = await asyncio.wait_for(
                decompose_query(query, repo=repo), timeout=3.0
            )
        except (asyncio.TimeoutError, Exception):
            sub_queries = []
        if sub_queries:
            yield {'type': 'debug', 'data': {'sub_queries': sub_queries}}

    # Generate HyDE documents in parallel with main search
    yield {'type': 'progress', 'data': 'Retrieving with semantic search...'}
    
    # Start HyDE generation async (non-blocking)
    hyde_task = asyncio.create_task(generate_hypothetical_documents(query, repo=repo))
    
    # Run main hybrid search
    candidates, diag = await hybrid_search(query, bm25, queries, repo=repo, hyde_docs=None)

    # Run sub-query searches and merge results for architectural queries
    if sub_queries:
        from app.adapter.retrieval.dense import dense_search
        from app.adapter.retrieval.sparse import BM25Index
        seen_ids = {c.id for c in candidates}
        for sq in sub_queries:
            try:
                sq_queries = await expand_query(sq, repo=repo)
                sq_candidates, sq_diag = await hybrid_search(sq, bm25, sq_queries, repo=repo)
                for c in sq_candidates:
                    if c.id not in seen_ids:
                        candidates.append(c)
                        seen_ids.add(c.id)
            except Exception as e:
                logger.debug(f"Sub-query search failed for '{sq}': {e}")
    
    # Try to get HyDE results if available (with short timeout)
    try:
        hyde_docs = await asyncio.wait_for(hyde_task, timeout=1.5)
        if hyde_docs:
            yield {'type': 'debug', 'data': {'hyde_generated': len(hyde_docs), 'docs': hyde_docs}}
            # Re-run hybrid search with HyDE documents for better results
            candidates, diag = await hybrid_search(query, bm25, queries, repo=repo, hyde_docs=hyde_docs)
    except asyncio.TimeoutError:
        hyde_task.cancel()
        # Continue with candidates from first search without HyDE

    answer_mode = 'high_confidence'
    if settings.enable_low_confidence_gating and diag.confidence < settings.retrieval_confidence_threshold:
        answer_mode = 'low_confidence'

    yield {
        'type': 'meta',
        'data': {
            'retrieval_confidence': diag.confidence,
            'answer_mode': answer_mode,
            'confidence_reason': diag.confidence_reason,
            'source_breakdown': getattr(diag, 'source_breakdown', {}),
        },
    }

    corrected = queries[0] if queries else query

    yield {'type': 'progress', 'data': 'Reranking results...'}
    if answer_mode == 'low_confidence':
        rerank_k = min(settings.rerank_hard_query_k, len(candidates))
    else:
        rerank_k = min(settings.rerank_input_k, max(effective_top_k, settings.retrieval_base_k))

    top_chunks = await rerank(corrected, candidates[:rerank_k], top_k=effective_top_k)
    if classified.is_architectural:
        top_chunks = _pack_component_diverse(top_chunks, effective_top_k)
    else:
        top_chunks = _pack_diverse(top_chunks, effective_top_k)

    citations = []
    for c in top_chunks:
        citation_file = _normalize_citation_file({
            'path': c.file_path,
            'repo': c.repo,
        })
        if not citation_file:
            continue

        citations.append({
            'file': citation_file,
            'path': c.file_path,
            'function': c.function_name,
            'start_line': c.start_line,
            'end_line': c.end_line,
            'repo': c.repo,
        })

    yield {'type': 'citations', 'data': citations}

    if answer_mode == 'low_confidence':
        full_answer = _low_confidence_answer(top_chunks, diag.confidence_reason, diag.confidence)
        await cache.set(cache_key, {
            'answer': full_answer,
            'citations': citations,
            'meta': {
                'retrieval_confidence': diag.confidence,
                'answer_mode': answer_mode,
                'confidence_reason': diag.confidence_reason,
            },
        }, ttl=settings.query_cache_ttl)
        QUERY_LATENCY.observe(time.perf_counter() - start)
        yield {'type': 'debug', 'data': {'stage': 'low_confidence_return', 'llm': get_request_stats(), 'repo': repo}}
        yield {'type': 'answer', 'data': full_answer, 'citations': citations}
        yield {'type': '[DONE]'}
        return

    # Use pre-classified query intent for prompt engineering
    is_architectural = classified.is_architectural
    
    prompt = build_prompt(query, top_chunks, history=history, is_architectural=is_architectural)

    yield {'type': 'progress', 'data': 'Generating answer with LLM...'}
    full_answer = ''
    llm_err = ''
    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        if attempt > 1:
            yield {'type': 'progress', 'data': f'LLM retry {attempt}/{max_attempts}...'}
            await asyncio.sleep(1.5 * attempt)
        try:
            candidate = ''
            async for token in stream_generate(prompt):
                candidate += token
                yield {'type': 'token', 'data': token}
            if candidate.strip():
                full_answer = candidate
                break
        except Exception as e:
            llm_err = str(e)

    full_answer = _verify_citations(full_answer, top_chunks)

    if not full_answer.strip():
        yield {'type': 'error', 'data': f'LLM unavailable after retries: {llm_err or "empty generation"}'}
        full_answer = 'LLM is temporarily unavailable after multiple retries. Please try again in about a minute.'

    yield {'type': 'debug', 'data': {'stage': 'final_answer', 'llm': get_request_stats(), 'key_rotation': get_key_debug_stats(), 'repo': repo}}

    await cache.set(cache_key, {
        'answer': full_answer,
        'citations': citations,
        'meta': {
            'retrieval_confidence': diag.confidence,
            'answer_mode': answer_mode,
            'confidence_reason': diag.confidence_reason,
            'query_intent': classified.intent.value,
        },
    }, ttl=settings.query_cache_ttl)
    QUERY_LATENCY.observe(time.perf_counter() - start)

    yield {'type': 'answer', 'data': full_answer, 'citations': citations}
    yield {'type': '[DONE]'}
