from abc import ABC, abstractmethod
from app.domain.entities import CodeChunk

class RetrieverPort(ABC):
    @abstractmethod
    async def search(self, query: str, k: int = 50) -> list[CodeChunk]:
        ...

class RerankerPort(ABC):
    @abstractmethod
    def rerank(self, query: str, chunks: list[CodeChunk], top_k: int = 10) -> list[CodeChunk]:
        ...

class LLMPort(ABC):
    @abstractmethod
    async def expand_query(self, query: str) -> list[str]:
        ...

    @abstractmethod
    async def stream_generate(self, prompt: str):
        ...

class CachePort(ABC):
    @abstractmethod
    async def get(self, key: str) -> dict | None:
        ...

    @abstractmethod
    async def set(self, key: str, value: dict, ttl: int = 3600):
        ...
