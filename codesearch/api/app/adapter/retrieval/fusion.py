import asyncio
import logging
import re
import time
from dataclasses import dataclass, field
from app.domain.entities import CodeChunk
from app.adapter.retrieval.dense import dense_search, hyde_search
from app.adapter.retrieval.sparse import BM25Index
from app.adapter.retrieval.query_classifier import (
    classify_query,
    get_architectural_expansions,
    get_file_type_penalty,
    get_usage_boost,
    QueryIntent,
)
from app.config import settings
from app.metrics.prometheus import RETRIEVAL_LATENCY, RETRIEVAL_CANDIDATE_COUNT, RETRIEVAL_EXPANSION_COUNT, RETRIEVAL_DEDUPE_RATIO

logger = logging.getLogger(__name__)
RRF_K = 10


@dataclass
class RetrievalDiagnostics:
    confidence: float
    confidence_reason: list[str]
    top_fused_score: float
    top3_gap: float
    exact_match_hits: int
    distinct_evidence_points: int
    source_breakdown: dict[str, int] = field(default_factory=dict)
    query_intent: str = ''


def rrf_score(rank: int) -> float:
    return 1.0 / (RRF_K + rank + 1)


def _chunk_key(c: CodeChunk) -> str:
    return f"{c.repo}|{c.file_path}|{c.start_line}|{c.end_line}"


def _normalize_rrf(scores: dict[str, float]) -> dict[str, float]:
    if not scores:
        return {}
    max_score = max(scores.values())
    if max_score <= 0:
        return scores
    return {k: v / max_score for k, v in scores.items()}


def _adaptive_params(expansion_count: int) -> tuple[int, int, int]:
    if not settings.enable_adaptive_retrieval:
        return settings.retrieval_max_k, settings.retrieval_max_k, settings.retrieval_max_k
    base = max(1, settings.retrieval_base_k)
    max_k = max(base, settings.retrieval_max_k)
    dense_k = min(max_k, base + expansion_count * 5)
    sparse_k = dense_k
    final_k = min(max_k, base)
    return dense_k, sparse_k, final_k


def _tokenize_for_exact(text: str) -> list[str]:
    parts = re.findall(r"[A-Za-z_][A-Za-z0-9_./-]*", text.lower())
    out = []
    for p in parts:
        if len(p) >= 3:
            out.append(p)
    return list(dict.fromkeys(out))


def _path_match_boost(query: str, chunk: CodeChunk) -> float:
    if not chunk.file_path:
        return 0.0

    query_norm = query.lower().replace('\\', '/').strip()
    path = chunk.file_path.lower().replace('\\', '/').strip()
    basename = path.split('/')[-1]

    if query_norm and (query_norm == path or query_norm.endswith(path) or path.endswith(query_norm)):
        return min(settings.retrieval_exact_match_boost * 1.2, 0.55)
    if basename and basename in query_norm:
        return min(settings.retrieval_exact_match_boost * 0.65, 0.45)

    q_tokens = set(_tokenize_for_exact(query_norm))
    if not q_tokens:
        return 0.0

    path_tokens = set(re.findall(r"[A-Za-z0-9_.-]+", path))
    overlap = q_tokens & path_tokens
    if not overlap:
        return 0.0

    multiplier = 0.65 if '/' in query or '.' in query else 0.35
    return settings.retrieval_exact_match_boost * multiplier * (len(overlap) / len(q_tokens))


def _extract_entity_tokens(query: str) -> list[str]:
    q = query.lower()
    toks = _tokenize_for_exact(q)
    anchors = ['client', 'handler', 'service', 'api', 'task', 'k8s', 'module']
    out = []
    for t in toks:
        if t in anchors or '_' in t or '/' in t or any(c.isdigit() for c in t):
            out.append(t)
    if not out:
        out = toks[:5]
    return list(dict.fromkeys(out))


def _intent_shaped_queries(query: str, queries: list[str]) -> list[str]:
    if not queries:
        queries = [query]
    corrected = queries[0]
    ql = corrected.lower()
    if 'explain' in ql and ('service' in ql or 'module' in ql):
        anchors = [a for a in ['client', 'handler', 'service', 'api', 'task', 'k8s'] if a in ql]
        if anchors:
            corrected = f"{corrected} {' '.join(anchors)}"
    return [corrected] + queries[1:]


def _has_technical_overlap(expansion: str, base_tokens: set[str]) -> bool:
    toks = set(_tokenize_for_exact(expansion))
    return len(toks & base_tokens) > 0


def _query_weights(queries: list[str]) -> list[tuple[str, float]]:
    if not queries:
        return []
    weighted = [(queries[0], 1.0)]
    for q in queries[1:]:
        weighted.append((q, 0.75))
    return weighted


def _exact_match_boost(query: str, chunk: CodeChunk) -> float:
    q_tokens = _extract_entity_tokens(query)
    if not q_tokens:
        return 0.0

    raw_query = query.lower()
    path_lower = (chunk.file_path or '').lower()
    function_lower = (chunk.function_name or '').lower()

    if path_lower and path_lower in raw_query:
        return settings.retrieval_exact_match_boost * 0.95

    hay = ' '.join([
        chunk.repo or '',
        chunk.file_path or '',
        chunk.function_name or '',
        chunk.parent_class or '',
        chunk.signature or '',
        chunk.content or '',
    ]).lower()
    hits = sum(1 for t in q_tokens if t in hay)
    if hits == 0:
        return 0.0

    score = settings.retrieval_exact_match_boost * (hits / max(1, len(q_tokens)))
    if function_lower and function_lower in raw_query:
        score = max(score, settings.retrieval_exact_match_boost * 0.7)
    return score


def _distinct_evidence(chunks: list[CodeChunk]) -> int:
    return len({f"{c.file_path}|{c.function_name}" for c in chunks})


def _compute_confidence(query: str, ordered: list[CodeChunk], fused_scores: dict[str, float], exact_hits: int) -> RetrievalDiagnostics:
    if not ordered:
        return RetrievalDiagnostics(0.0, ['no_candidates'], 0.0, 0.0, 0, 0)
    top = fused_scores.get(ordered[0].id, 0.0)
    top3 = [fused_scores.get(c.id, 0.0) for c in ordered[:3]]
    top3_avg = sum(top3) / max(1, len(top3))
    gap = max(0.0, top - top3_avg)
    distinct = _distinct_evidence(ordered[:5])

    confidence = min(1.0, 0.45 * top + 0.25 * gap + 0.15 * min(1.0, exact_hits / 2.0) + 0.15 * min(1.0, distinct / 3.0))
    reasons = []
    if top < 0.35:
        reasons.append('low_top_score')
    if gap < 0.05:
        reasons.append('weak_top_gap')
    if exact_hits == 0:
        reasons.append('no_exact_identifier_hits')
    if distinct < settings.min_distinct_evidence_points:
        reasons.append('insufficient_distinct_evidence')
    if not reasons:
        reasons.append('high_confidence_retrieval')

    return RetrievalDiagnostics(confidence, reasons, top, gap, exact_hits, distinct)


def _sparse_search_variants(bm25: BM25Index, queries: list[tuple[str, float]], k: int) -> tuple[dict[str, float], dict[str, CodeChunk]]:
    scores: dict[str, float] = {}
    chunks: dict[str, CodeChunk] = {}
    for query, weight in queries:
        results = bm25.search(query, k=k)
        for rank, chunk in enumerate(results):
            scores[chunk.id] = scores.get(chunk.id, 0.0) + weight * rrf_score(rank)
            chunks[chunk.id] = chunk
    return scores, chunks


async def _dense_search_variants(queries: list[tuple[str, float]], repo: str | None, k: int) -> list[tuple[list[CodeChunk], float]]:
    tasks = [dense_search(query, vector_name='code', k=k, repo=repo) for query, _ in queries]
    results = await asyncio.gather(*tasks)
    return list(zip(results, [weight for _, weight in queries]))


async def hybrid_search(
    query: str,
    bm25: BM25Index,
    queries: list[str],
    k_dense: int = 50,
    k_sparse: int = 50,
    final_k: int = 20,
    repo: str | None = None,
    hyde_docs: list[str] | None = None,
) -> tuple[list[CodeChunk], RetrievalDiagnostics]:
    """Hybrid search combining dense, sparse, and HyDE retrieval.
    
    Args:
        query: Original user query
        bm25: BM25 index for sparse search
        queries: Expanded query variants
        k_dense: Number of dense results to retrieve
        k_sparse: Number of sparse results to retrieve
        final_k: Final number of results to return
        repo: Optional repository filter
        hyde_docs: Optional hypothetical documents for HyDE search
    """
    start = time.perf_counter()

    # Classify query intent for better retrieval strategy
    classified = classify_query(query)
    logger.debug(f"Query classified: intent={classified.intent.value}, symbols={classified.symbols}")

    queries = _intent_shaped_queries(query, queries)
    corrected = queries[0] if queries else query
    base_tokens = set(_tokenize_for_exact(corrected))
    max_expansions = max(0, settings.retrieval_max_expansions)
    expansions_raw = queries[1:1 + max_expansions]
    expansions = [q for q in expansions_raw if _has_technical_overlap(q, base_tokens)]
    
    # Add architectural expansions for architectural queries
    if classified.is_architectural and classified.symbols:
        arch_expansions = get_architectural_expansions(query, classified.symbols)
        expansions.extend(arch_expansions[:max_expansions - len(expansions)])
    
    RETRIEVAL_EXPANSION_COUNT.observe(len(expansions))

    dense_k, sparse_k, adaptive_final_k = _adaptive_params(len(expansions))
    if settings.enable_adaptive_retrieval:
        final_k = adaptive_final_k
    else:
        dense_k, sparse_k = k_dense, k_sparse

    weighted_queries = _query_weights([corrected] + expansions)

    # Main dense retrieval from query and expansions.
    dense_variant_results = await _dense_search_variants(weighted_queries, repo, k=dense_k)
    dense_scores: dict[str, float] = {}
    chunks_by_id: dict[str, CodeChunk] = {}
    source_breakdown: dict[str, int] = {
        'dense_code': 0,
        'dense_docstring': 0,
        'hyde': 0,
        'sparse': 0,
    }
    for results, weight in dense_variant_results:
        for rank, chunk in enumerate(results):
            dense_scores[chunk.id] = dense_scores.get(chunk.id, 0.0) + weight * rrf_score(rank)
            chunks_by_id[chunk.id] = chunk
            source_breakdown['dense_code'] += 1

    # Docstring retrieval on the main corrected query only.
    docstring_results = await dense_search(corrected, vector_name='docstring', k=dense_k, repo=repo)
    for rank, chunk in enumerate(docstring_results):
        dense_scores[chunk.id] = dense_scores.get(chunk.id, 0.0) + 0.8 * rrf_score(rank)
        chunks_by_id[chunk.id] = chunk
        source_breakdown['dense_docstring'] += 1

    # HyDE retrieval if hypothetical documents exist.
    if hyde_docs:
        hyde_tasks = [hyde_search(doc, k=max(10, dense_k // 2), repo=repo) for doc in hyde_docs[:2]]
        hyde_results = await asyncio.gather(*hyde_tasks)
        for results in hyde_results:
            for rank, chunk in enumerate(results):
                dense_scores[chunk.id] = dense_scores.get(chunk.id, 0.0) + 0.65 * rrf_score(rank)
                chunks_by_id[chunk.id] = chunk
                source_breakdown['hyde'] += 1

    # Sparse retrieval on corrected query and expansions.
    sparse_scores, sparse_chunks = _sparse_search_variants(bm25, weighted_queries, k_sparse)
    if repo:
        sparse_chunks = {cid: chunk for cid, chunk in sparse_chunks.items() if chunk.repo == repo}
        sparse_scores = {cid: score for cid, score in sparse_scores.items() if cid in sparse_chunks}

    for cid, chunk in sparse_chunks.items():
        chunks_by_id[cid] = chunk
        source_breakdown['sparse'] += 1

    dense_scores = _normalize_rrf(dense_scores)
    sparse_scores = _normalize_rrf(sparse_scores)

    fused_scores: dict[str, float] = {}
    exact_hits = 0
    for cid, chunk in chunks_by_id.items():
        boost = _exact_match_boost(corrected, chunk)
        path_boost = _path_match_boost(corrected, chunk)
        
        # Apply metadata-based boosts/penalties based on query intent
        if classified.is_architectural:
            file_penalty = get_file_type_penalty(chunk.file_path)
            usage_boost = get_usage_boost(chunk.file_path, chunk.function_name)
            boost += file_penalty + usage_boost
        
        if boost > 0:
            exact_hits += 1
        fused_scores[cid] = dense_scores.get(cid, 0.0) + sparse_scores.get(cid, 0.0) + boost + path_boost

    sorted_ids = sorted(fused_scores, key=lambda x: fused_scores[x], reverse=True)
    ordered = [chunks_by_id[cid] for cid in sorted_ids]
    RETRIEVAL_CANDIDATE_COUNT.observe(len(ordered))

    deduped = []
    seen = set()
    for c in ordered:
        key = _chunk_key(c)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(c)

    if ordered:
        RETRIEVAL_DEDUPE_RATIO.observe(len(deduped) / len(ordered))

    graph_expanded_count = 0
    if settings.enable_graph_expansion:
        try:
            from app.adapter.retrieval.graph_expand import graph_expand
            from app.main import app
            neo4j_client = getattr(app.state, 'neo4j', None)
            if neo4j_client and neo4j_client.connected:
                before_count = len(deduped)
                expanded = await graph_expand(
                    deduped[:settings.retrieval_base_k],
                    neo4j_client,
                    repo or '',
                    max_neighbors=settings.graph_expansion_max_neighbors,
                )
                deduped = expanded
                graph_expanded_count = max(0, len(deduped) - before_count)
                if graph_expanded_count > 0:
                    source_breakdown['graph'] = graph_expanded_count
        except Exception as e:
            logger.debug(f"Graph expansion skipped: {e}")

    diagnostics = _compute_confidence(corrected, deduped, fused_scores, exact_hits)
    diagnostics.source_breakdown = source_breakdown
    diagnostics.query_intent = classified.intent.value

    elapsed = time.perf_counter() - start
    RETRIEVAL_LATENCY.observe(elapsed)

    return deduped[:final_k], diagnostics
