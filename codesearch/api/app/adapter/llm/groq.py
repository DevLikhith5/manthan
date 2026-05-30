import json
import asyncio
import time
import hashlib
import contextvars
import re
from groq import AsyncGroq
from app.config import settings

_keys = [k for k in [settings.groq_api_key, settings.groq_api_key_2, settings.groq_api_key_3] if k]
if not _keys:
    _keys = ['']
_clients = [AsyncGroq(api_key=k, timeout=30.0) for k in _keys]
_key_slots = {i: [] for i in range(len(_clients))}
_cache = {}
_key_state = {
    i: {
        'cooldown_until': 0.0,
        'consecutive_failures': 0,
        'last_used': 0.0,
    }
    for i in range(len(_clients))
}
_max_per_minute_per_key = 60
_key_debug = {i: {'picked': 0, 'success': 0, 'rate_limited': 0, 'transient': 0, 'non_retry': 0} for i in range(len(_clients))}
_req_stats_var = contextvars.ContextVar('groq_req_stats', default=None)


def _model_chain() -> list[str]:
    raw = settings.groq_fallback_models or ''
    models = [m.strip() for m in raw.split(',') if m.strip()]
    if settings.groq_model and settings.groq_model not in models:
        models.insert(0, settings.groq_model)
    if not models:
        models = [settings.groq_model]
    return list(dict.fromkeys(models))


def reset_request_stats():
    _req_stats_var.set({
        'llm_attempts': 0,
        'llm_successes': 0,
        'llm_rate_limits': 0,
        'llm_transient_errors': 0,
        'llm_non_retry_errors': 0,
        'last_error': '',
    })


def get_request_stats() -> dict:
    stats = _req_stats_var.get()
    return dict(stats or {})


def get_key_debug_stats() -> dict:
    return {str(k): dict(v) for k, v in _key_debug.items()}


def _bump_stat(key: str, inc: int = 1):
    stats = _req_stats_var.get() or {}
    stats[key] = int(stats.get(key, 0)) + inc
    _req_stats_var.set(stats)


def _set_last_error(msg: str):
    stats = _req_stats_var.get() or {}
    stats['last_error'] = msg[:240]
    _req_stats_var.set(stats)


def _is_rate_limited_error(err: Exception) -> bool:
    msg = str(err).lower()
    return '429' in msg or 'rate_limit' in msg or 'too many requests' in msg


def _is_transient_error(err: Exception) -> bool:
    msg = str(err).lower()
    markers = ['connect', 'timeout', 'temporarily', 'unavailable', '503', '502', '504']
    return any(m in msg for m in markers)


def _prune_key_windows(now: float):
    for i in _key_slots:
        _key_slots[i] = [t for t in _key_slots[i] if now - t < 60]

def _pick_key() -> int | None:
    now = time.time()
    _prune_key_windows(now)

    candidates = []
    for idx in range(len(_clients)):
        st = _key_state[idx]
        if st['cooldown_until'] > now:
            continue
        used = len(_key_slots[idx])
        if used >= _max_per_minute_per_key:
            continue
        # Lower score is better: prefer less used and healthier keys.
        score = (used * 10) + (st['consecutive_failures'] * 5) + st['last_used']
        candidates.append((score, idx))

    if candidates:
        candidates.sort(key=lambda x: x[0])
        return candidates[0][1]
    return None

def _mark_success(key_idx: int):
    now = time.time()
    _key_slots[key_idx].append(now)
    st = _key_state[key_idx]
    st['consecutive_failures'] = 0
    st['cooldown_until'] = 0.0
    st['last_used'] = now


def _mark_failure(key_idx: int, err: Exception):
    now = time.time()
    st = _key_state[key_idx]
    st['consecutive_failures'] += 1
    st['last_used'] = now

    if _is_rate_limited_error(err):
        # Exponential cooldown: 2s, 4s, 8s... capped.
        backoff = min(60.0, 2.0 ** min(st['consecutive_failures'], 6))
        st['cooldown_until'] = now + backoff
    elif _is_transient_error(err):
        st['cooldown_until'] = now + min(15.0, float(st['consecutive_failures']))
    else:
        st['cooldown_until'] = now + 3.0

async def _call(fn, *args, **kw):
    last_rate_limit_error = None
    for _ in range(len(_clients) * 2):
        key_idx = _pick_key()
        if key_idx is None:
            await asyncio.sleep(0.5)
            continue
        try:
            _bump_stat('llm_attempts', 1)
            _key_debug[key_idx]['picked'] += 1
            result = await fn(_clients[key_idx], *args, **kw)
            _mark_success(key_idx)
            _key_debug[key_idx]['success'] += 1
            _bump_stat('llm_successes', 1)
            return result
        except Exception as e:
            _mark_failure(key_idx, e)
            _set_last_error(f'{type(e).__name__}: {e}')
            if _is_rate_limited_error(e):
                _bump_stat('llm_rate_limits', 1)
                _key_debug[key_idx]['rate_limited'] += 1
                last_rate_limit_error = e
                await asyncio.sleep(0.25)
                continue
            if _is_transient_error(e):
                _bump_stat('llm_transient_errors', 1)
                _key_debug[key_idx]['transient'] += 1
                await asyncio.sleep(0.25)
                continue
            # Non-retryable
            _bump_stat('llm_non_retry_errors', 1)
            _key_debug[key_idx]['non_retry'] += 1
            raise
    if last_rate_limit_error is not None:
        return None
    return None

def _cache_key(query: str, suffix: str, repo: str | None = None) -> str:
    return hashlib.md5(f'{query}:{suffix}:{repo or ""}'.encode()).hexdigest()

async def _cached_call(fn, query: str, suffix: str, repo: str | None = None, *args, **kw):
    key = _cache_key(query, suffix, repo)
    if key in _cache:
        return _cache[key]
    result = await _call(fn, *args, **kw)
    if result is not None:
        _cache[key] = result
    return result

CORRECT_TYPO_PROMPT = """Fix only obvious spelling errors in this search query. NEVER change project names, function names, or technical terms. If no clear typos exist, return the query unchanged. Return ONLY the corrected query. No explanation.

Query: {query}"""

MULTI_QUERY_PROMPT = """Generate 3 different search queries for finding relevant code in this project. Use real function names, file paths, class names, and technical patterns from this specific codebase. Return ONLY a JSON array of strings. No explanation.

Project: {repo_context}
Original query: {query}"""

MULTI_QUERY_PROMPT_V2 = """You are generating code-search retrieval queries for a specific repository.

Hard constraints:
1) Return ONLY valid JSON: an array of 3 strings.
2) Each query must be concrete and code-grounded, not generic.
3) Include at least one of: function/method name, class/struct name, file path hint, or subsystem keyword.
4) Keep each query under 16 words.
5) Do not use vague rewrites like: 'how it works', 'architecture overview', 'general explanation'.
6) Preserve important technical tokens from the original query (APIs, types, acronyms).

Project context:
{repo_context}

User query:
{query}
"""

HYDE_PROMPT = """You are a code search assistant. Given a user question, generate a PLAUSIBLE HYPOTHETICAL CODE ANSWER that would address the question.

The hypothetical answer should:
1) Be realistic code/technical explanation that could exist in the repository
2) Include relevant function/method names, class names, file paths, imports
3) Include technical patterns and architectural concepts
4) Be 3-5 sentences max; structure like actual code documentation/comments
5) Preserve domain-specific terminology from the original query
6) NOT claim to be the actual answer - it's a hypothetical for search purposes

Return ONLY the hypothetical answer text. No preamble, no JSON, no markers.

User question: {query}
Project context: {repo_context}
"""

HYDE_MULTI_PROMPT = """Generate 2 different PLAUSIBLE HYPOTHETICAL CODE ANSWERS for this question.
Each answer should be realistic and code-grounded, using different technical approaches or explanations.

Return ONLY valid JSON array of 2 strings. No explanation.

Example format: ["Hypothetical answer 1 with function names and types", "Hypothetical answer 2 with different approach"]

User question: {query}
Project context: {repo_context}
"""

DECOMPOSE_PROMPT = """Break this architectural question into 2-3 specific sub-questions that each target a different component, layer, or boundary in the codebase. Each sub-question should be concrete and code-grounded.

Return ONLY valid JSON array of 2-3 strings. No explanation.

Question: {query}
Project: {repo_context}
"""


def _is_vague_query(q: str) -> bool:
    bad_phrases = [
        'how it works',
        'general explanation',
        'architecture overview',
        'explain the code',
        'overview of system',
    ]
    low = q.lower().strip()
    if len(low.split()) < 3:
        return True
    return any(p in low for p in bad_phrases)


def _fallback_queries(corrected: str, repo: str | None = None) -> list[str]:
    base = corrected.strip()
    if not base:
        return []
    repo_hint = f" repo:{repo}" if repo else ""
    variants = [
        base,
        f"{base} implementation file path function{repo_hint}".strip(),
        f"{base} call flow error handling signature{repo_hint}".strip(),
    ]
    out = []
    seen = set()
    for v in variants:
        key = v.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(v)
    return out[:3]


def _extract_tech_terms(query: str) -> list[str]:
    terms = re.findall(r"[A-Za-z_][A-Za-z0-9_./-]*", query.lower())
    keep = []
    anchors = {
        'grpc', 'proto', 'protobuf', 'api', 'service', 'client', 'server',
        'handler', 'router', 'endpoint', 'redis', 'kafka', 'db', 'sql', 'queue',
    }
    for t in terms:
        if t in anchors or '_' in t or '/' in t or '.' in t or len(t) >= 8:
            keep.append(t)
    return list(dict.fromkeys(keep))[:6]


def _clean_query_variants(base: str, variants: list[str]) -> list[str]:
    base_norm = ' '.join(base.split())
    tech = _extract_tech_terms(base_norm)
    out = [base_norm]
    seen = {base_norm.lower()}

    for q in variants:
        qn = ' '.join(q.strip().split())
        if not qn:
            continue
        low = qn.lower()
        if low in seen:
            continue
        # Require technical overlap for accuracy.
        if tech and not any(t in low for t in tech):
            continue
        if len(qn) < 8:
            continue
        seen.add(low)
        out.append(qn)

    # Ensure at most 3 concise queries shown in UI.
    return out[:3]

def _get_repo_description(repo: str | None) -> str:
    if not repo:
        return "General programming"
    if not settings.repo_descriptions:
        return f"Project: {repo}"
    try:
        import json
        descs = json.loads(settings.repo_descriptions)
        return descs.get(repo, f"Project: {repo}")
    except Exception:
        return f"Project: {repo}"

def _light_typo_fix(query: str) -> str:
    # Cheap local normalization to avoid an extra LLM call per request.
    return ' '.join(query.strip().split())


async def generate_hypothetical_documents(query: str, repo: str | None = None) -> list[str]:
    """Generate hypothetical code documents for HyDE retrieval.
    
    HyDE: Hypothetical Document Embeddings - generates plausible documents
    that would answer the query, then uses these to search for real documents.
    """
    corrected = _light_typo_fix(query)
    repo_context = _get_repo_description(repo)
    
    # Early exit for very specific technical queries - they don't need HyDE
    technical_keywords = ['implementation', 'source code', 'line', 'function', 'class', 'file:']
    if any(kw in corrected.lower() for kw in technical_keywords):
        return []
    
    async def generate_docs(c: AsyncGroq):
        last = None
        for model in _model_chain():
            try:
                msg = await c.chat.completions.create(
                    model=model,
                    messages=[{'role': 'user', 'content': HYDE_MULTI_PROMPT.format(query=corrected, repo_context=repo_context)}],
                    temperature=0.3,  # Slightly higher temp for diverse hypotheticals
                    max_tokens=settings.llm_expand_max_tokens,
                )
                content = msg.choices[0].message.content or ''
                try:
                    return json.loads(content) if isinstance(content, str) else content
                except json.JSONDecodeError:
                    import re
                    match = re.search(r'\[.*?\]', content, re.DOTALL)
                    if match:
                        return json.loads(match.group(0))
                    return []
            except Exception as e:
                last = e
                if not _is_rate_limited_error(e):
                    raise
        raise last if last else RuntimeError('no_model_available')
    
    try:
        # HyDE generation is nice-to-have, so timeout aggressively
        docs = await asyncio.wait_for(
            _cached_call(generate_docs, corrected, 'hyde', repo),
            timeout=2.0,
        )
    except Exception:
        return []
    
    if not isinstance(docs, list):
        return []
    
    # Filter and clean hypothetical documents
    cleaned = []
    for doc in docs:
        if isinstance(doc, str) and len(doc.strip()) > 20:
            cleaned.append(doc.strip())
    
    return cleaned[:2]  # Return at most 2 hypothetical documents


async def expand_query(query: str, repo: str | None = None) -> list[str]:
    corrected = _light_typo_fix(query)
    repo_context = _get_repo_description(repo)

    async def variations(c: AsyncGroq):
        last = None
        for model in _model_chain():
            try:
                msg = await c.chat.completions.create(
                    model=model,
                    messages=[{'role': 'user', 'content': MULTI_QUERY_PROMPT_V2.format(query=corrected, repo_context=repo_context)}],
                    temperature=0.2,
                    max_tokens=settings.llm_expand_max_tokens,
                )
                content = msg.choices[0].message.content or ''
                try:
                    return json.loads(content)
                except json.JSONDecodeError:
                    import re
                    match = re.search(r'\[.*?\]', content, re.DOTALL)
                    if match:
                        return json.loads(match.group(0))
                    lines = [l.strip().strip('"').strip("'") for l in content.split('\n') if l.strip() and not l.strip().startswith('```')]
                    return [l for l in lines if l][:3]
            except Exception as e:
                last = e
                if not _is_rate_limited_error(e):
                    raise
        raise last if last else RuntimeError('no_model_available')

    try:
        # Never block user flow on expansion; fail fast to local fallback.
        v = await asyncio.wait_for(
            _cached_call(variations, corrected, 'variations', repo),
            timeout=3.0,
        )
    except Exception:
        v = None

    results = [corrected]
    if isinstance(v, list):
        for item in v:
            if isinstance(item, str):
                q = item.strip()
                if q and not _is_vague_query(q):
                    results.append(q)

    if len(results) < 2:
        results = _fallback_queries(corrected, repo=repo)

    return _clean_query_variants(corrected, results[1:])


SYSTEM_PROMPT = """You are a code navigation assistant. Answer questions about the codebase using ONLY the provided code context.

CRITICAL RULES - VIOLATION IS FAILURE:
1) NEVER fabricate file paths, function names, or code details not in the provided sources.
2) NEVER guess or assume how code works. If the context doesn't show it, say "I don't have enough evidence from the retrieved code."
3) EVERY claim MUST have a citation: [file_path:line_start-line_end]. If you cannot cite it, do not say it.
4) NEVER invent Mermaid diagrams about code you haven't seen. Only diagram what's explicitly in the sources.
5) If evidence is partial, say exactly what's missing. Do not fill gaps with plausible-sounding details.
6) For architectural questions ("How are we using X?"), explain the flow across components, citing each step with its source.
7) Trace execution paths: show how data/control flows from entry points through the system.

Format citations as: [file_path:line_start-line_end]
"""

ARCHITECTURAL_PROMPT_SUFFIX = """

Additional guidance for architectural/usage questions:
- Identify all components involved in the flow
- Explain how components connect and interact
- Cite each step in the flow with its source location
- If the flow spans multiple files, show the complete path
- Use bullet points or numbered steps to clarify the sequence
"""

def _format_history(history: list[dict] | None) -> str:
    if not history:
        return ''
    turns = []
    for h in history[-8:]:
        role = str(h.get('role', 'user')).strip().lower()
        content = str(h.get('content', '')).strip()
        if not content:
            continue
        if role not in ('user', 'assistant'):
            role = 'user'
        turns.append(f"{role.title()}: {content}")
    return '\n'.join(turns)


MAX_CHUNK_CHARS = 2000
MAX_TOTAL_CHARS = 30000

def build_prompt(query: str, chunks: list, history: list[dict] | None = None, is_architectural: bool = False) -> str:
    context_parts = []
    total_chars = 0
    for i, chunk in enumerate(chunks, 1):
        content = chunk.content or ''
        if len(content) > MAX_CHUNK_CHARS:
            content = content[:MAX_CHUNK_CHARS] + '\n... (truncated)'
        part = (
            f'### Source {i}: {chunk.file_path} (lines {chunk.start_line}-{chunk.end_line})\n'
            f'Function: {chunk.function_name}\n'
            f'```{chunk.language}\n{content}\n```'
        )
        if total_chars + len(part) > MAX_TOTAL_CHARS:
            break
        context_parts.append(part)
        total_chars += len(part)
    context = '\n\n'.join(context_parts)
    history_text = _format_history(history)
    
    # Add architectural guidance for architectural queries
    arch_suffix = ARCHITECTURAL_PROMPT_SUFFIX if is_architectural else ''
    
    if history_text:
        return f'## Chat History\n{history_text}\n\n## Code Context\n{context}\n\n## Question\n{query}{arch_suffix}'
    return f'## Code Context\n{context}\n\n## Question\n{query}{arch_suffix}'

async def decompose_query(query: str, repo: str | None = None) -> list[str]:
    """Decompose an architectural query into sub-questions targeting different components."""
    corrected = _light_typo_fix(query)
    repo_context = _get_repo_description(repo)

    async def decompose(c: AsyncGroq):
        last = None
        for model in _model_chain():
            try:
                msg = await c.chat.completions.create(
                    model=model,
                    messages=[{'role': 'user', 'content': DECOMPOSE_PROMPT.format(query=corrected, repo_context=repo_context)}],
                    temperature=0.2,
                    max_tokens=settings.llm_expand_max_tokens,
                )
                content = msg.choices[0].message.content or ''
                try:
                    return json.loads(content)
                except json.JSONDecodeError:
                    match = re.search(r'\[.*?\]', content, re.DOTALL)
                    if match:
                        return json.loads(match.group(0))
                    lines = [l.strip().strip('"').strip("'") for l in content.split('\n') if l.strip() and not l.strip().startswith('```')]
                    return [l for l in lines if l][:3]
            except Exception as e:
                last = e
                if not _is_rate_limited_error(e):
                    raise
        raise last if last else RuntimeError('no_model_available')

    try:
        v = await asyncio.wait_for(
            _cached_call(decompose, corrected, 'decompose', repo),
            timeout=3.0,
        )
    except Exception:
        v = None

    results = []
    if isinstance(v, list):
        for item in v:
            if isinstance(item, str):
                q = item.strip()
                if q and not _is_vague_query(q):
                    results.append(q)

    return results[:3]


async def stream_generate(prompt: str):
    gen_key = _cache_key(prompt, 'gen')
    if gen_key in _cache:
        for token in _cache[gen_key]:
            yield token
        return

    last_err = ''
    for _ in range(len(_clients) * 2):
        key_idx = _pick_key()
        if key_idx is None:
            last_err = 'rate_limit (local)'
            await asyncio.sleep(0.5)
            continue
        c = _clients[key_idx]
        try:
            tokens = []
            last_model_err = None
            for model in _model_chain():
                try:
                    stream = await c.chat.completions.create(
                        model=model,
                        messages=[
                            {'role': 'system', 'content': SYSTEM_PROMPT},
                            {'role': 'user', 'content': prompt},
                        ],
                        stream=True,
                        temperature=0.1,
                        max_tokens=settings.llm_max_tokens,
                    )
                    async for chunk in stream:
                        if chunk.choices[0].delta.content:
                            t = chunk.choices[0].delta.content
                            tokens.append(t)
                            yield t
                    _mark_success(key_idx)
                    _cache[gen_key] = tokens
                    return
                except Exception as me:
                    last_model_err = me
                    if not _is_rate_limited_error(me):
                        raise
                    continue
            raise last_model_err if last_model_err else RuntimeError('model_chain_failed')
        except Exception as e:
            last_err = f'{type(e).__name__}: {e}'
            if '429' in last_err or 'rate_limit' in last_err.lower():
                await asyncio.sleep(1.0)
    if '429' in last_err or 'rate_limit' in last_err.lower():
        raise RuntimeError(f'LLM_RATE_LIMIT: {last_err[:120]}')
    elif 'ConnectError' in last_err:
        raise RuntimeError('LLM_CONNECT_ERROR: Groq API unreachable')
    else:
        raise RuntimeError(f'LLM_ERROR: {last_err[:120]}')
