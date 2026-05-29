import json
import logging
from rank_bm25 import BM25Okapi
from app.domain.entities import CodeChunk

logger = logging.getLogger(__name__)

class BM25Index:
    def __init__(self):
        self.bm25: BM25Okapi | None = None
        self.chunks: list[CodeChunk] = []

    @classmethod
    def load(cls, path: str) -> 'BM25Index':
        idx = cls()
        if not path:
            logger.warning('BM25 index path not configured')
            return idx
        try:
            with open(path) as f:
                data = json.load(f)
            corpus = data.get('corpus', [])
            chunks_data = data.get('chunks', [])
            if not corpus or not chunks_data:
                logger.warning(f'BM25 index empty: {path}')
                return idx
            idx.chunks = [
                CodeChunk(
                    id=c.get('ID', ''),
                    content=c.get('Content', ''),
                    file_path=c.get('FilePath', ''),
                    function_name=c.get('Name', ''),
                    start_line=c.get('StartLine', 0),
                    end_line=c.get('EndLine', 0),
                    language=c.get('Language', ''),
                    signature=c.get('Signature', ''),
                    parent_class=c.get('ParentClass', ''),
                    repo=c.get('Repo', ''),
                )
                for c in chunks_data
            ]
            idx.bm25 = BM25Okapi(corpus)
            logger.info(f'Loaded BM25 index with {len(idx.chunks)} chunks from {path}')
        except FileNotFoundError:
            logger.warning(f'BM25 index file not found: {path}')
        except json.JSONDecodeError as e:
            logger.error(f'Failed to parse BM25 index: {e}')
        return idx

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """Match Go indexer tokenization: split on whitespace, trim punctuation."""
        tokens = []
        for raw in text.split():
            tok = raw.strip('.,;:!?"\'()[]{}\\/<>|=+-_*&^%$#@~`')
            if tok:
                tokens.append(tok.lower())
        return tokens

    def search(self, query: str, k: int = 50) -> list[CodeChunk]:
        if not self.bm25 or not self.chunks:
            return []
        tokens = self._tokenize(query)
        if not tokens:
            return []
        scores = self.bm25.get_scores(tokens)
        ranked = sorted(
            zip(scores, self.chunks),
            key=lambda x: x[0],
            reverse=True,
        )
        return [chunk for score, chunk in ranked[:k] if score > 0]
