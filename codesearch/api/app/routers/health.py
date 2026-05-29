import httpx
from fastapi import APIRouter
from app.config import settings

router = APIRouter()

@router.get('/health')
async def health():
    return {'status': 'ok', 'service': 'codesearch-api'}

@router.get('/ready')
async def ready():
    deps = {}
    all_ok = True

    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(f'{settings.qdrant_url}/collections', timeout=3)
            deps['qdrant'] = 'ok' if r.status_code == 200 else f'http {r.status_code}'
            if r.status_code != 200:
                all_ok = False
    except Exception as e:
        deps['qdrant'] = str(e)
        all_ok = False

    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(f'{settings.embedding_service_url}/health', timeout=3)
            deps['embedding'] = 'ok' if r.status_code == 200 else f'http {r.status_code}'
            if r.status_code != 200:
                all_ok = False
    except Exception as e:
        deps['embedding'] = str(e)
        all_ok = False

    try:
        import redis.asyncio as aioredis
        r = await aioredis.from_url(settings.redis_url)
        pong = await r.ping()
        await r.aclose()
        deps['redis'] = 'ok' if pong else 'ping failed'
        if not pong:
            all_ok = False
    except Exception as e:
        deps['redis'] = str(e)
        all_ok = False

    if not all_ok:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={'status': 'not ready', 'dependencies': deps},
        )
    return {'status': 'ready', 'dependencies': deps}
