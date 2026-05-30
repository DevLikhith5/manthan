import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from prometheus_fastapi_instrumentator import Instrumentator
from app.routers import search, health, ingest, repos, sessions, graph, wiki
from app.adapter.retrieval.sparse import BM25Index
from app.adapter.graph import Neo4jClient
from app.config import settings

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format='%(levelname)s\t%(name)s\t%(message)s',
)

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("starting up")
    bm25 = BM25Index.load(settings.bm25_index_path)
    app.state.bm25 = bm25
    if bm25.bm25:
        logger.info("bm25 index loaded: %d chunks", len(bm25.chunks))
    else:
        logger.warning("bm25 index not loaded; searches will be dense-only")

    neo4j_client = None
    if settings.enable_graph_expansion:
        neo4j_client = Neo4jClient(
            settings.neo4j_uri,
            settings.neo4j_user,
            settings.neo4j_password,
        )
        await neo4j_client.connect()
        app.state.neo4j = neo4j_client
        graph.set_neo4j_client(neo4j_client)
        wiki.set_neo4j_client(neo4j_client)
    else:
        app.state.neo4j = None

    yield

    logger.info("shutting down")
    if neo4j_client:
        await neo4j_client.close()

app = FastAPI(title='CodeSearch API', lifespan=lifespan)

Instrumentator().instrument(app).expose(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(search.router, prefix='/api')
app.include_router(health.router, prefix='/api')
app.include_router(ingest.router, prefix='/api')
app.include_router(repos.router, prefix='/api')
app.include_router(sessions.router, prefix='/api')
app.include_router(graph.router)
app.include_router(wiki.router)

try:
    app.mount('/', StaticFiles(directory='static', html=True), name='static')
except RuntimeError:
    pass
