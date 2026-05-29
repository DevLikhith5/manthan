import json
import logging
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from app.models import SearchRequest
from app.service.search_service import search as search_service
from app.infra.rate_limiter import PerClientRateLimiter
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()
rate_limiter = PerClientRateLimiter(
    rate=settings.rate_limit_per_minute / 60.0,
    burst=settings.rate_limit_burst,
)

@router.post('/search')
async def search(request: Request, body: SearchRequest):
    client_ip = request.client.host if request.client else 'unknown'
    if not await rate_limiter.check(client_ip):
        logger.warning("rate limit hit for %s", client_ip)
        return JSONResponse(
            status_code=429,
            content={'detail': 'Too many requests. Try again later.'},
        )

    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail='query is required')
    if len(query) > 500:
        raise HTTPException(status_code=400, detail='query too long (max 500 chars)')

    bm25 = request.app.state.bm25

    async def event_stream():
        async for event in search_service(
            query=query,
            bm25=bm25,
            language=body.language,
            top_k=body.top_k,
            repo=body.repo,
        ):
            yield f'data: {json.dumps(event)}\n\n'

    return StreamingResponse(event_stream(), media_type='text/event-stream')
