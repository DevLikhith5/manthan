import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_REPO_BASE = '/tmp/codesearch_repos'

def _read_source(repo: str, file_path: str, start_line: int, end_line: int) -> str:
    full = os.path.join(_REPO_BASE, repo, file_path)
    try:
        with open(full, 'r', errors='replace') as f:
            lines = f.readlines()
        s = max(0, start_line - 1)
        e = min(len(lines), end_line)
        return ''.join(lines[s:e])
    except Exception:
        return ''

def _read_file_full(repo: str, file_path: str) -> str:
    full = os.path.join(_REPO_BASE, repo, file_path)
    try:
        with open(full, 'r', errors='replace') as f:
            return f.read()
    except Exception:
        return ''


class Neo4jClient:
    def __init__(self, uri: str, user: str, password: str):
        self.uri = uri
        self.user = user
        self.password = password
        self.driver = None
        self._connected = False

    async def connect(self):
        try:
            from neo4j import AsyncGraphDatabase
            self.driver = AsyncGraphDatabase.driver(
                self.uri, auth=(self.user, self.password)
            )
            await self.driver.verify_connectivity()
            self._connected = True
            logger.info(f"Connected to Neo4j at {self.uri}")
        except Exception as e:
            logger.warning(f"Neo4j connection failed: {e}")
            self._connected = False

    async def close(self):
        if self.driver:
            await self.driver.close()

    @property
    def connected(self) -> bool:
        return self._connected

    async def get_neighbors(self, node_id: str, repo: str) -> tuple[list[dict], list[dict]]:
        if not self._connected:
            return [], []
        async with self.driver.session() as session:
            result = await session.run(
                """MATCH (n {id: $id})-[r]-(m)
                   WHERE m.repo = $repo OR m.repo IS NULL
                   RETURN m.id AS id, labels(m) AS labels, properties(m) AS props,
                          type(r) AS rel_type, startNode(r).id AS from_id, endNode(r).id AS to_id
                   LIMIT 50""",
                id=node_id, repo=repo
            )
            nodes = []
            edges = []
            seen = set()
            async for record in result:
                mid = record['id']
                if mid not in seen:
                    seen.add(mid)
                    labels = record['labels']
                    label = labels[0] if labels else ''
                    nodes.append({
                        'id': mid,
                        'label': label,
                        'name': record['props'].get('name', ''),
                        'file_path': record['props'].get('file_path', ''),
                        'start_line': record['props'].get('start_line', 0),
                        'end_line': record['props'].get('end_line', 0),
                        'kind': record['props'].get('kind', ''),
                        'repo': record['props'].get('repo', ''),
                    })
                edges.append({
                    'from': record['from_id'],
                    'to': record['to_id'],
                    'type': record['rel_type'],
                })
            return nodes, edges

    async def get_repo_graph(self, repo: str, detail: str = 'file') -> tuple[list[dict], list[dict]]:
        if not self._connected:
            return [], []
        async with self.driver.session() as session:
            if detail == 'file':
                result = await session.run(
                    """MATCH (f:File {repo: $repo})
                       OPTIONAL MATCH (f)-[:IMPORTS]->(imp)
                       OPTIONAL MATCH (f)-[:DEFINES]->(sym)
                       RETURN f.id AS id, labels(f) AS labels,
                              {id: f.id, name: f.name, path: f.path, language: f.language, repo: f.repo} AS props,
                              'DEFINES' AS rel_type, f.id AS from_id, COALESCE(sym.id, '') AS to_id
                       UNION
                       MATCH (f:File {repo: $repo})-[:IMPORTS]->(imp)
                       RETURN imp.id AS id, labels(imp) AS labels,
                              {id: imp.id, name: imp.name, path: imp.path} AS props,
                              'IMPORTS' AS rel_type, f.id AS from_id, imp.id AS to_id
                       LIMIT 500""",
                    repo=repo
                )
            else:
                result = await session.run(
                    """MATCH (n {repo: $repo})
                       OPTIONAL MATCH (n)-[r]-(m)
                       WHERE m.repo = $repo OR m.repo IS NULL
                       RETURN n.id AS id, labels(n) AS labels,
                              properties(n) AS props,
                              COALESCE(type(r), '') AS rel_type,
                              COALESCE(startNode(r).id, '') AS from_id,
                              COALESCE(endNode(r).id, '') AS to_id
                       LIMIT 10000""",
                    repo=repo
                )
            nodes = {}
            edges = {}
            seen_edges = set()
            async for record in result:
                nid = record['id']
                if nid and nid not in nodes:
                    labels = record['labels']
                    props = record['props'] or {}
                    nodes[nid] = {
                        'id': nid,
                        'label': labels[0] if labels else '',
                        'name': props.get('name', ''),
                        'file_path': props.get('file_path', ''),
                        'path': props.get('path', ''),
                        'language': props.get('language', ''),
                        'kind': props.get('kind', ''),
                    }
                from_id = record['from_id']
                to_id = record['to_id']
                rel_type = record['rel_type']
                if from_id and to_id and rel_type:
                    ekey = (from_id, to_id, rel_type)
                    if ekey not in seen_edges:
                        seen_edges.add(ekey)
                        edges[ekey] = {
                            'from': from_id,
                            'to': to_id,
                            'type': rel_type,
                        }
            return list(nodes.values()), list(edges.values())

    async def get_call_graph(self, name: str, file_path: str, depth: int = 2) -> tuple[list[dict], list[dict]]:
        if not self._connected:
            return [], []
        async with self.driver.session() as session:
            result = await session.run(
                f"""MATCH (start:Function {{name: $name, file_path: $fp}})
                    MATCH path = (start)-[:CALLS*1..{depth}]->(target)
                    UNWIND nodes(path) AS n
                    WITH DISTINCT n
                    MATCH (n)-[r:CALLS]-()
                    RETURN DISTINCT n.id AS id, labels(n) AS labels, properties(n) AS props,
                           type(r) AS rel_type, startNode(r).id AS from_id, endNode(r).id AS to_id
                    LIMIT 200""",
                name=name, fp=file_path
            )
            nodes = []
            edges = []
            seen_nodes = set()
            seen_edges = set()
            async for record in result:
                nid = record['id']
                if nid not in seen_nodes:
                    seen_nodes.add(nid)
                    labels = record['labels']
                    label = labels[0] if labels else ''
                    nodes.append({
                        'id': nid,
                        'label': label,
                        'name': record['props'].get('name', ''),
                        'file_path': record['props'].get('file_path', ''),
                        'start_line': record['props'].get('start_line', 0),
                        'end_line': record['props'].get('end_line', 0),
                        'kind': record['props'].get('kind', ''),
                    })
                ekey = (record['from_id'], record['to_id'], record['rel_type'])
                if ekey not in seen_edges:
                    seen_edges.add(ekey)
                    edges.append({
                        'from': record['from_id'],
                        'to': record['to_id'],
                        'type': record['rel_type'],
                    })
            return nodes, edges

    async def get_file_dependencies(self, file_path: str, repo: str) -> tuple[list[dict], list[dict]]:
        if not self._connected:
            return [], []
        async with self.driver.session() as session:
            result = await session.run(
                """MATCH (f:File {path: $path, repo: $repo})-[r]-(m)
                   RETURN m.id AS id, labels(m) AS labels, properties(m) AS props,
                          type(r) AS rel_type, startNode(r).id AS from_id, endNode(r).id AS to_id
                   LIMIT 100""",
                path=file_path, repo=repo
            )
            nodes = []
            edges = []
            seen = set()
            async for record in result:
                mid = record['id']
                if mid not in seen:
                    seen.add(mid)
                    labels = record['labels']
                    label = labels[0] if labels else ''
                    nodes.append({
                        'id': mid,
                        'label': label,
                        'name': record['props'].get('name', ''),
                        'file_path': record['props'].get('file_path', ''),
                        'path': record['props'].get('path', ''),
                    })
                edges.append({
                    'from': record['from_id'],
                    'to': record['to_id'],
                    'type': record['rel_type'],
                })
            return nodes, edges

    async def get_wiki_tree(self, repo: str) -> list[dict]:
        if not self._connected:
            return []
        async with self.driver.session() as session:
            result = await session.run(
                """MATCH (f:File {repo: $repo})
                   OPTIONAL MATCH (f)-[:DEFINES]->(n)
                   RETURN f.path AS path, f.language AS language,
                          collect(DISTINCT {name: n.name, kind: labels(n)[0], file_path: n.file_path}) AS symbols
                   ORDER BY f.path""",
                repo=repo
            )
            tree = []
            async for record in result:
                tree.append({
                    'path': record['path'],
                    'language': record['language'],
                    'symbols': record['symbols'],
                })
            return tree

    async def get_wiki_page(self, entity_type: str, name: str, file_path: str, repo: str) -> Optional[dict]:
        if not self._connected:
            return None
        async with self.driver.session() as session:
            if entity_type == 'file':
                result = await session.run(
                    """MATCH (f:File {path: $path, repo: $repo})
                       OPTIONAL MATCH (f)-[:DEFINES]->(n)
                       OPTIONAL MATCH (f)-[:IMPORTS]->(i)
                       RETURN f.path AS path, f.language AS language,
                              collect(DISTINCT {name: n.name, kind: labels(n)[0], start_line: n.start_line, end_line: n.end_line}) AS symbols,
                              collect(DISTINCT i.path) AS imports""",
                    path=file_path, repo=repo
                )
                record = await result.single()
                if record:
                    source = _read_file_full(repo, record['path'])
                    return {
                        'type': 'file',
                        'path': record['path'],
                        'language': record['language'],
                        'symbols': [s for s in record['symbols'] if s.get('name')],
                        'imports': record['imports'],
                        'source': source,
                    }
            elif entity_type == 'function':
                result = await session.run(
                    """MATCH (f:Function {name: $name, file_path: $fp})
                       OPTIONAL MATCH (f)-[:CALLS]->(callee)
                       OPTIONAL MATCH (caller)-[:CALLS]->(f)
                       RETURN f.name AS name, f.file_path AS file_path, f.signature AS signature,
                              f.start_line AS start_line, f.end_line AS end_line, f.kind AS kind,
                              collect(DISTINCT {name: callee.name, file_path: callee.file_path}) AS calls,
                              collect(DISTINCT {name: caller.name, file_path: caller.file_path}) AS called_by""",
                    name=name, fp=file_path
                )
                record = await result.single()
                if record:
                    sl = record['start_line'] or 1
                    el = record['end_line'] or sl
                    source = _read_source(repo, record['file_path'], sl, el)
                    return {
                        'type': 'function',
                        'name': record['name'],
                        'file_path': record['file_path'],
                        'signature': record['signature'],
                        'start_line': record['start_line'],
                        'end_line': record['end_line'],
                        'kind': record['kind'],
                        'calls': record['calls'],
                        'called_by': [c for c in record['called_by'] if c.get('name')],
                        'source': source,
                    }
            elif entity_type == 'class':
                result = await session.run(
                    """MATCH (c:Class {name: $name, file_path: $fp})
                       OPTIONAL MATCH (c)-[:CONTAINS]->(m)
                       OPTIONAL MATCH (c)-[:EXTENDS]->(parent)
                       OPTIONAL MATCH (c)-[:IMPLEMENTS]->(iface)
                       RETURN c.name AS name, c.file_path AS file_path, c.kind AS kind,
                              collect(DISTINCT {name: m.name, kind: m.kind, start_line: m.start_line}) AS methods,
                              collect(DISTINCT parent.name) AS extends,
                              collect(DISTINCT iface.name) AS implements""",
                    name=name, fp=file_path
                )
                record = await result.single()
                if record:
                    return {
                        'type': 'class',
                        'name': record['name'],
                        'file_path': record['file_path'],
                        'kind': record['kind'],
                        'methods': record['methods'],
                        'extends': record['extends'],
                        'implements': record['implements'],
                    }
        return None
