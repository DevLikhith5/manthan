import json
import hashlib
import redis.asyncio as redis
from app.config import settings
from app.domain.interfaces import CachePort
from app.metrics.prometheus import CACHE_HITS, CACHE_MISSES

class QueryCache(CachePort):
    def __init__(self):
        self.client = None

    async def _get_client(self):
        if self.client is None:
            self.client = await redis.from_url(settings.redis_url, decode_responses=True)
        return self.client

    def _key(self, query: str) -> str:
        h = hashlib.md5(query.encode()).hexdigest()
        return f'query:{h}'

    async def get(self, key: str) -> dict | None:
        r = await self._get_client()
        val = await r.get(self._key(key))
        if val:
            CACHE_HITS.labels(cache_type='query').inc()
            return json.loads(val)
        CACHE_MISSES.labels(cache_type='query').inc()
        return None

    async def set(self, key: str, value: dict, ttl: int = 3600):
        r = await self._get_client()
        await r.setex(self._key(key), ttl, json.dumps(value))
