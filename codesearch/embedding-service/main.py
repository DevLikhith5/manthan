import os
import time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from contextlib import asynccontextmanager
from prometheus_client import Histogram, Counter, make_asgi_app
from domain.model import EmbeddingModel
from adapter.hf import HFEmbeddingModel

EMBED_LATENCY = Histogram('embed_seconds', 'Embedding latency', buckets=[.01, .025, .05, .1, .25, .5])
EMBED_COUNT = Counter('embed_texts_total', 'Texts embedded')
EMBED_DIMENSION = os.getenv('VECTOR_DIM', '384')

model: EmbeddingModel = None

class EmbedRequest(BaseModel):
    texts: list[str]

class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    dimension: int
    model: str

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    model_name = os.getenv('MODEL_NAME', 'all-MiniLM-L6-v2')
    model = HFEmbeddingModel(model_name)
    print(f"Loaded model: {model_name} (dim={model.dimension()})")
    yield

app = FastAPI(title='CodeSearch Embedding Service', lifespan=lifespan)

metrics_app = make_asgi_app()
app.mount('/metrics', metrics_app)

@app.get('/health')
async def health():
    return {'status': 'ok', 'model': model.name(), 'dimension': model.dimension()}

@app.post('/embed', response_model=EmbedResponse)
async def embed(req: EmbedRequest):
    if not req.texts:
        raise HTTPException(status_code=400, detail='texts required')
    start = time.perf_counter()
    vecs = model.encode(req.texts)
    EMBED_LATENCY.observe(time.perf_counter() - start)
    EMBED_COUNT.inc(len(req.texts))
    return EmbedResponse(embeddings=vecs, dimension=model.dimension(), model=model.name())

if __name__ == '__main__':
    import uvicorn
    port = int(os.getenv('PORT', '8081'))
    uvicorn.run(app, host='0.0.0.0', port=port)
