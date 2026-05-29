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
    reranker_model: str = 'BAAI/bge-reranker-base'
    bm25_index_path: str = '/Users/cvlikhith/Manthan/codesearch/data/bm25.pkl'
    query_cache_ttl: int = 3600
    vector_dim: int = 384
    host_repo_path: str = ''
    host_repo_path_docker: str = ''
    vscode_path_prefix: str = ''

    rate_limit_per_minute: int = 30
    rate_limit_burst: int = 50

    circuit_breaker_failure_threshold: int = 5
    circuit_breaker_recovery_timeout: float = 30.0

    embedding_retry_max: int = 2
    qdrant_retry_max: int = 2

    log_level: str = 'INFO'

    model_config = SettingsConfigDict(
        env_prefix='',
        env_file=str(Path(__file__).parent.parent.parent / '.env'),
    )

settings = Settings()
