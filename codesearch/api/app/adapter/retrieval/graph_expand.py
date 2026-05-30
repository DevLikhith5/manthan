import logging
import os
from typing import Optional
from app.domain.entities import CodeChunk

logger = logging.getLogger(__name__)

_REPO_BASE = '/tmp/codesearch_repos'


def _read_source(repo: str, file_path: str, start_line: int, end_line: int) -> str:
    """Read source code from disk for graph-expanded neighbors."""
    full = os.path.join(_REPO_BASE, repo, file_path)
    try:
        with open(full, 'r', errors='replace') as f:
            lines = f.readlines()
        s = max(0, start_line - 1)
        e = min(len(lines), end_line)
        return ''.join(lines[s:e])
    except Exception:
        return ''


async def graph_expand(
    chunks: list[CodeChunk],
    neo4j_client,
    repo: str,
    max_neighbors: int = 10,
) -> list[CodeChunk]:
    if not neo4j_client or not neo4j_client.connected:
        return chunks

    existing_ids = set(c.id for c in chunks)

    graph_node_ids = set()
    for c in chunks[:20]:
        fp = c.file_path
        fn = c.function_name
        if fp:
            graph_node_ids.add(repo + "::" + fp)
        if fp and fn:
            graph_node_ids.add(fp + "::" + fn)

    all_neighbors = []
    for nid in list(graph_node_ids)[:50]:
        try:
            nodes, _ = await neo4j_client.get_neighbors(nid, repo)
            for node in nodes:
                nid2 = node['id']
                if nid2 not in existing_ids and node.get('file_path'):
                    all_neighbors.append(node)
                    existing_ids.add(nid2)
        except Exception as e:
            logger.debug(f"Graph expansion failed for {nid}: {e}")

    new_chunks = []
    for neighbor in all_neighbors[:max_neighbors]:
        fp = neighbor.get('file_path', '')
        sl = neighbor.get('start_line', 1)
        el = neighbor.get('end_line', sl)
        source = _read_source(repo, fp, sl, el) if fp else ''

        chunk = CodeChunk(
            id=neighbor['id'],
            content=source,
            file_path=fp,
            function_name=neighbor.get('name', ''),
            start_line=sl,
            end_line=el,
            language=neighbor.get('language', ''),
            signature=neighbor.get('signature', ''),
            parent_class=neighbor.get('parent_class', ''),
            repo=repo,
            score=0.0,
        )
        new_chunks.append(chunk)

    expanded = chunks + new_chunks
    logger.info(f"Graph expansion: {len(chunks)} original + {len(new_chunks)} neighbors = {len(expanded)} total")
    return expanded
