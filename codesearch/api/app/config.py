from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    qdrant_url: str = 'http://localhost:6333'
    redis_url: str = 'redis://localhost:6379'
    embedding_model: str = 'all-MiniLM-L6-v2'
    embedding_service_url: str = 'http://localhost:8081'
    groq_api_key: str = ''
    groq_api_key_2: str = ''
    groq_api_key_3: str = ''
    groq_model: str = 'llama-3.3-70b-versatile'
    groq_fallback_models: str = 'llama-3.1-8b-instant,llama-3.3-70b-versatile'
    llm_max_tokens: int = 700
    llm_expand_max_tokens: int = 120
    reranker_model: str = 'BAAI/bge-reranker-base'
    bm25_index_path: str = '/Users/cvlikhith/Manthan/codesearch/data/bm25.pkl'
    query_cache_ttl: int = 3600
    vector_dim: int = 384
    qdrant_collection_name: str = 'codebase'
    cache_schema_version: str = 'v2'
    host_repo_path: str = ''
    host_repo_path_docker: str = ''
    vscode_path_prefix: str = ''

    repo_descriptions: str = ''
    rate_limit_per_minute: int = 120
    rate_limit_burst: int = 200

    circuit_breaker_failure_threshold: int = 5
    circuit_breaker_recovery_timeout: float = 30.0

    embedding_retry_max: int = 2
    qdrant_retry_max: int = 2

    retrieval_max_expansions: int = 2
    retrieval_base_k: int = 20
    retrieval_max_k: int = 50
    rerank_input_k: int = 20
    enable_adaptive_retrieval: bool = True
    enable_diversity_packing: bool = True
    retrieval_exact_match_boost: float = 0.35
    retrieval_confidence_threshold: float = 0.58
    rerank_hard_query_k: int = 40
    min_distinct_evidence_points: int = 2
    enable_low_confidence_gating: bool = True

    neo4j_uri: str = 'bolt://localhost:7687'
    neo4j_user: str = 'neo4j'
    neo4j_password: str = 'graphpassword'
    enable_graph_expansion: bool = True
    graph_expansion_hops: int = 1
    graph_expansion_max_neighbors: int = 10

    log_level: str = 'INFO'

    model_config = SettingsConfigDict(
        env_prefix='',
        env_file=str(Path(__file__).parent.parent.parent / '.env'),
    )

settings = Settings()
