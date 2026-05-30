from prometheus_client import Histogram, Counter, Gauge

RETRIEVAL_LATENCY = Histogram(
    'rag_retrieval_seconds',
    'Dense+sparse retrieval latency',
    buckets=[.01, .025, .05, .1, .25, .5, 1.0],
)

RERANK_LATENCY = Histogram(
    'rag_rerank_seconds',
    'Cross-encoder reranking latency',
    buckets=[.05, .1, .25, .5, 1.0, 2.5],
)

QUERY_LATENCY = Histogram(
    'rag_query_e2e_seconds',
    'End-to-end query latency',
    buckets=[.5, 1, 2, 3, 5, 10],
)

LLM_TTFT = Histogram(
    'rag_llm_ttft_seconds',
    'Time to first LLM token',
    buckets=[.1, .25, .5, 1.0, 2.0],
)

CACHE_HITS = Counter('rag_cache_hits_total', 'Cache hits', ['cache_type'])
CACHE_MISSES = Counter('rag_cache_misses_total', 'Cache misses', ['cache_type'])
INDEX_SIZE = Gauge('rag_index_size_total', 'Vectors in Qdrant index')
QUERY_COUNT = Counter('rag_queries_total', 'Total queries', ['status'])

RETRIEVAL_CANDIDATE_COUNT = Histogram(
    'rag_retrieval_candidates',
    'Candidates produced before rerank',
    buckets=[1, 5, 10, 20, 40, 80, 160],
)

RETRIEVAL_EXPANSION_COUNT = Histogram(
    'rag_retrieval_expansion_count',
    'Number of expansion queries used',
    buckets=[0, 1, 2, 3, 5, 8],
)

RETRIEVAL_DEDUPE_RATIO = Histogram(
    'rag_retrieval_dedupe_ratio',
    'Deduped/ordered candidate ratio',
    buckets=[0.1, 0.25, 0.5, 0.75, 0.9, 1.0],
)
