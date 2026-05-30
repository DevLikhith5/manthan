from pydantic import BaseModel


class ChatTurn(BaseModel):
    role: str
    content: str

class SearchRequest(BaseModel):
    query: str
    language: str | None = None
    top_k: int = 8
    repo: str | None = None
    history: list[ChatTurn] = []

class CodeChunk(BaseModel):
    id: str
    score: float = 0.0
    content: str
    file_path: str
    function_name: str
    start_line: int
    end_line: int
    language: str

class Citation(BaseModel):
    file: str
    function: str
    start_line: int
    end_line: int

class SearchResponse(BaseModel):
    answer: str
    citations: list[Citation]
