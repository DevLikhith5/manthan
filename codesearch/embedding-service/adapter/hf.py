from sentence_transformers import SentenceTransformer
from domain.model import EmbeddingModel

class HFEmbeddingModel(EmbeddingModel):
    def __init__(self, model_name: str = 'all-MiniLM-L6-v2'):
        self._model = SentenceTransformer(model_name)
        self._name = model_name

    def encode(self, texts: list[str]) -> list[list[float]]:
        vecs = self._model.encode(texts, show_progress_bar=False, normalize_embeddings=True)
        return vecs.tolist()

    def dimension(self) -> int:
        return self._model.get_sentence_embedding_dimension()

    def name(self) -> str:
        return self._name
