import logging
from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter()

_neo4j_client = None


def set_neo4j_client(client):
    global _neo4j_client
    _neo4j_client = client


@router.get('/api/graph/call-graph')
async def get_call_graph(
    name: str = Query(...),
    file_path: str = Query(...),
    depth: int = Query(2, ge=1, le=4),
    repo: str = Query(''),
):
    if not _neo4j_client or not _neo4j_client.connected:
        return {'nodes': [], 'edges': [], 'error': 'Neo4j not connected'}
    nodes, edges = await _neo4j_client.get_call_graph(name, file_path, depth)
    return {'nodes': nodes, 'edges': edges}


@router.get('/api/graph/file-dependencies')
async def get_file_dependencies(
    file_path: str = Query(...),
    repo: str = Query(''),
):
    if not _neo4j_client or not _neo4j_client.connected:
        return {'nodes': [], 'edges': [], 'error': 'Neo4j not connected'}
    nodes, edges = await _neo4j_client.get_file_dependencies(file_path, repo)
    return {'nodes': nodes, 'edges': edges}


@router.get('/api/graph/repo-graph')
async def get_repo_graph(
    repo: str = Query(...),
    detail: str = Query('file', regex='^(file|full)$'),
):
    if not _neo4j_client or not _neo4j_client.connected:
        return {'nodes': [], 'edges': [], 'error': 'Neo4j not connected'}
    nodes, edges = await _neo4j_client.get_repo_graph(repo, detail)
    return {'nodes': nodes, 'edges': edges}


@router.get('/api/graph/neighbors')
async def get_neighbors(
    chunk_id: str = Query(...),
    repo: str = Query(''),
):
    if not _neo4j_client or not _neo4j_client.connected:
        return {'nodes': [], 'edges': [], 'error': 'Neo4j not connected'}
    nodes, edges = await _neo4j_client.get_neighbors(chunk_id, repo)
    return {'nodes': nodes, 'edges': edges}
