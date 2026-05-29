from dataclasses import dataclass, field

@dataclass
class CodeChunk:
    id: str
    score: float = 0.0
    content: str = ''
    file_path: str = ''
    function_name: str = ''
    start_line: int = 0
    end_line: int = 0
    language: str = ''
    signature: str = ''
    parent_class: str = ''
    repo: str = ''

@dataclass
class Citation:
    file: str
    function: str
    start_line: int
    end_line: int

@dataclass
class SearchResult:
    answer: str
    citations: list[Citation]
