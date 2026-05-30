import logging
from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter()

_neo4j_client = None


def set_neo4j_client(client):
    global _neo4j_client
    _neo4j_client = client


@router.get('/api/wiki/tree')
async def get_wiki_tree(repo: str = Query(...)):
    if not _neo4j_client or not _neo4j_client.connected:
        return {'tree': [], 'error': 'Neo4j not connected'}
    tree = await _neo4j_client.get_wiki_tree(repo)
    return {'tree': tree}


@router.get('/api/wiki/page')
async def get_wiki_page(
    entity_type: str = Query(...),
    name: str = Query(...),
    file_path: str = Query(...),
    repo: str = Query(''),
):
    if not _neo4j_client or not _neo4j_client.connected:
        return {'error': 'Neo4j not connected'}
    page = await _neo4j_client.get_wiki_page(entity_type, name, file_path, repo)
    if page is None:
        return {'error': 'Page not found'}
    return page


@router.get('/api/wiki/search')
async def search_wiki(
    q: str = Query(...),
    repo: str = Query(''),
):
    if not _neo4j_client or not _neo4j_client.connected:
        return {'results': [], 'error': 'Neo4j not connected'}

    async with _neo4j_client.driver.session() as session:
        result = await session.run(
            """MATCH (n)
               WHERE (n.name CONTAINS $q OR n.path CONTAINS $q OR n.file_path CONTAINS $q)
                 AND (n.repo = $repo OR $repo = '')
               RETURN labels(n)[0] AS label, n.name AS name, n.file_path AS file_path,
                      n.path AS path, n.start_line AS start_line
               LIMIT 20""",
            q=q, repo=repo
        )
        results = []
        async for record in result:
            results.append({
                'label': record['label'],
                'name': record['name'] or record['path'] or '',
                'file_path': record['file_path'] or '',
                'start_line': record['start_line'] or 0,
            })
        return {'results': results}
