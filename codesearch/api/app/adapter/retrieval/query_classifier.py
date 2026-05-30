import re
from dataclasses import dataclass
from enum import Enum


class QueryIntent(Enum):
    IMPLEMENTATION = "implementation"  # "Where is X implemented?"
    ARCHITECTURAL = "architectural"    # "How are we using X?"
    USAGE = "usage"                    # "How does X work?"
    FLOW = "flow"                      # "What is the flow of X?"
    UNKNOWN = "unknown"


@dataclass
class ClassifiedQuery:
    original: str
    intent: QueryIntent
    symbols: list[str]  # Extracted technical symbols (WAL, Append, etc.)
    is_architectural: bool
    needs_call_graph: bool  # Whether we need to find callers/dependencies


# Patterns that indicate architectural/usage queries
ARCHITECTURAL_PATTERNS = [
    r'how\s+(are\s+we\s+)?using\s+',
    r'how\s+does\s+.*\s+work',
    r'what\s+is\s+the\s+(role|flow|process|lifecycle|pipeline)\s+of',
    r'explain\s+the\s+.*\s+(architecture|design|structure)',
    r'where\s+is\s+.*\s+(used|called|invoked)',
    r'which\s+components?\s+(use|call|depend)',
    r'describe\s+the\s+.*\s+(system|architecture|design)',
    r'what\s+components?\s+(are\s+involved|participate)',
    r'how\s+(do|does)\s+.*\s+(integrate|connect|communicate)',
    r'trace\s+the\s+.*\s+(path|flow|execution)',
]

# Patterns that indicate implementation queries
IMPLEMENTATION_PATTERNS = [
    r'where\s+is\s+.*\s+implemented',
    r'find\s+the\s+(implementation|source\s+code|definition)',
    r'show\s+me\s+the\s+(code|implementation|function|method)',
    r'what\s+(file|function|method|class)\s+',
    r'locate\s+',
    r'define\s+',
    r'signature\s+of',
]

# Common technical symbols to extract
TECH_SYMBOL_PATTERNS = [
    r'\b([A-Z][A-Za-z0-9_]+(?:\.[A-Z][A-Za-z0-9_]+)*)\b',  # CamelCase or PascalCase
    r'\b([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*)\b',       # snake_case or dot-separated
    r'\b([A-Z_]{2,})\b',                                       # CONSTANTS
]


def _extract_symbols(query: str) -> list[str]:
    """Extract technical symbols from the query."""
    symbols = []
    for pattern in TECH_SYMBOL_PATTERNS:
        matches = re.findall(pattern, query)
        symbols.extend(matches)
    
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for s in symbols:
        if s.lower() not in seen and len(s) >= 2:
            seen.add(s.lower())
            unique.append(s)
    
    return unique[:10]  # Limit to 10 symbols


def classify_query(query: str) -> ClassifiedQuery:
    """Classify a query to determine retrieval strategy."""
    query_lower = query.lower().strip()
    
    # Check for architectural patterns
    is_architectural = any(re.search(p, query_lower) for p in ARCHITECTURAL_PATTERNS)
    
    # Check for implementation patterns
    is_implementation = any(re.search(p, query_lower) for p in IMPLEMENTATION_PATTERNS)
    
    # Determine intent
    if is_architectural:
        intent = QueryIntent.ARCHITECTURAL
    elif is_implementation:
        intent = QueryIntent.IMPLEMENTATION
    elif any(w in query_lower for w in ['flow', 'process', 'pipeline', 'sequence']):
        intent = QueryIntent.FLOW
    elif any(w in query_lower for w in ['using', 'work', 'integrate', 'connect']):
        intent = QueryIntent.USAGE
    else:
        intent = QueryIntent.UNKNOWN
    
    # Extract symbols
    symbols = _extract_symbols(query)
    
    # Determine if we need call graph traversal
    needs_call_graph = intent in [
        QueryIntent.ARCHITECTURAL,
        QueryIntent.USAGE,
        QueryIntent.FLOW,
    ]
    
    return ClassifiedQuery(
        original=query,
        intent=intent,
        symbols=symbols,
        is_architectural=is_architectural or intent == QueryIntent.USAGE,
        needs_call_graph=needs_call_graph,
    )


def get_architectural_expansions(query: str, symbols: list[str]) -> list[str]:
    """Generate query expansions for architectural queries.
    
    Uses generic traversal/dependency terms that work for any codebase.
    The LLM decomposition handles component-specific terms.
    """
    expansions = []

    # Generic architectural expansions - work for any project structure
    expansions.append("request processing flow entry point handler")
    expansions.append("integration dependencies call chain")
    expansions.append("component interaction data flow")

    # Symbol-based expansions
    for symbol in symbols[:2]:
        expansions.append(f"{symbol} callers callees dependencies")
        expansions.append(f"{symbol} integration usage pattern")

    return expansions[:5]


def get_file_type_penalty(file_path: str) -> float:
    """Return a penalty score for file types that are less relevant for architectural queries."""
    path_lower = file_path.lower()
    
    # Penalize test files
    if '_test.' in path_lower or 'test_' in path_lower or '/test/' in path_lower:
        return -0.15
    if '.test.' in path_lower or 'spec.' in path_lower:
        return -0.15
    
    # Penalize mock/stub files
    if 'mock' in path_lower or 'stub' in path_lower or 'fake' in path_lower:
        return -0.20
    
    # Penalize fixture files
    if 'fixture' in path_lower:
        return -0.15
    
    return 0.0


def get_usage_boost(file_path: str, function_name: str) -> float:
    """Return a boost score for files that show usage patterns."""
    path_lower = file_path.lower()
    boost = 0.0
    
    # Boost files that are likely to show usage (not just implementation)
    if 'service' in path_lower or 'handler' in path_lower or 'controller' in path_lower:
        boost += 0.05
    if 'middleware' in path_lower or 'pipeline' in path_lower:
        boost += 0.05
    if 'adapter' in path_lower or 'connector' in path_lower:
        boost += 0.05
    
    # Boost functions that are entry points or orchestration
    if function_name:
        name_lower = function_name.lower()
        if any(w in name_lower for w in ['handle', 'process', 'execute', 'run', 'start', 'init']):
            boost += 0.03
    
    return min(0.15, boost)
