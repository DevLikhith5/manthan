from fastapi import APIRouter
from qdrant_client import AsyncQdrantClient
from app.config import settings

router = APIRouter()
qdrant = AsyncQdrantClient(settings.qdrant_url)

@router.get('/repos')
async def list_repos():
    try:
        points, _ = await qdrant.scroll(
            collection_name='codebase',
            limit=100,
            with_payload=True,
            with_vectors=False,
        )
        repos = set()
        for point in points:
            repo = point.payload.get('repo', '')
            if repo:
                repos.add(repo)
        return {'repos': sorted(repos)}
    except Exception as e:
        return {'repos': [], 'error': str(e)}
