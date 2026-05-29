import json
import asyncio
import random
import time
import hashlib
from groq import AsyncGroq
from app.config import settings

_keys = [k for k in [settings.groq_api_key, settings.groq_api_key_2, settings.groq_api_key_3] if k]
if not _keys:
    _keys = ['']
_clients = [AsyncGroq(api_key=k, timeout=30.0) for k in _keys]
_key_slots = {i: [] for i in range(len(_clients))}
_cache = {}
_next_key = 0

def _pick_key() -> int | None:
    global _next_key
    now = time.time()
    for _ in range(len(_clients)):
        idx = _next_key % len(_clients)
        _next_key += 1
        window = _key_slots[idx]
        _key_slots[idx] = [t for t in window if now - t < 60]
        if len(_key_slots[idx]) < 60:
            return idx
    return None

def _mark_success(key_idx: int):
    _key_slots[key_idx].append(time.time())

async def _call(fn, *args, **kw):
    for _ in range(len(_clients) * 2):
        key_idx = _pick_key()
        if key_idx is None:
            await asyncio.sleep(0.5)
            continue
        try:
            result = await fn(_clients[key_idx], *args, **kw)
            _mark_success(key_idx)
            return result
        except Exception as e:
            if '429' not in str(e) and 'rate_limit' not in str(e).lower():
                raise
            await asyncio.sleep(1.0)
    return None

def _cache_key(query: str, suffix: str) -> str:
    return hashlib.md5(f'{query}:{suffix}'.encode()).hexdigest()

async def _cached_call(fn, query: str, suffix: str, *args, **kw):
    key = _cache_key(query, suffix)
    if key in _cache:
        return _cache[key]
    result = await _call(fn, *args, **kw)
    if result is not None:
        _cache[key] = result
    return result

CORRECT_TYPO_PROMPT = """Fix only obvious spelling errors in this search query. NEVER change project names, function names, or technical terms. If no clear typos exist, return the query unchanged. Return ONLY the corrected query. No explanation.

Query: {query}"""

MULTI_QUERY_PROMPT = """Generate 3 different search queries for finding relevant code. Use real code concepts, function names, and patterns that could exist in any programming language. Do NOT invent specific project names. Return ONLY a JSON array of strings. No explanation.

Original query: {query}"""

HYDE_PROMPT = """Write a short, realistic code snippet that would be the answer to this query. Include a function signature and docstring. Write it as if it were real production code.

Query: {query}"""

async def expand_query(query: str) -> list[str]:
    corrected = query

    async def fix_typos(c: AsyncGroq):
        msg = await c.chat.completions.create(
            model=settings.groq_model,
            messages=[{'role': 'user', 'content': CORRECT_TYPO_PROMPT.format(query=query)}],
            temperature=0.0,
            max_tokens=100,
        )
        return msg.choices[0].message.content.strip()

    async def variations(c: AsyncGroq):
        msg = await c.chat.completions.create(
            model=settings.groq_model,
            messages=[{'role': 'user', 'content': MULTI_QUERY_PROMPT.format(query=corrected)}],
            temperature=0.2,
            max_tokens=300,
        )
        return json.loads(msg.choices[0].message.content)

    async def hyde(c: AsyncGroq):
        msg = await c.chat.completions.create(
            model=settings.groq_model,
            messages=[{'role': 'user', 'content': HYDE_PROMPT.format(query=corrected)}],
            temperature=0.2,
            max_tokens=300,
        )
        return msg.choices[0].message.content

    fix, v, h = await asyncio.gather(
        _cached_call(fix_typos, query, 'typo'),
        _cached_call(variations, query, 'variations'),
        _cached_call(hyde, query, 'hyde'),
    )
    if fix and fix.lower() != query.lower() and len(fix) > 3:
        corrected = fix

    results = [corrected]
    if v:
        results.extend(v)
    if h:
        results.append(h)
    return results


SYSTEM_PROMPT = """You are a code navigation assistant. Answer questions about the codebase using the provided code context. For every claim you make, cite the specific file and function. If the provided context is empty or irrelevant, use your general knowledge to answer helpfully but note that it's not from the codebase.

Format citations as: [file_path:line_start-line_end]"""

def build_prompt(query: str, chunks: list) -> str:
    context_parts = []
    for i, chunk in enumerate(chunks, 1):
        context_parts.append(
            f'### Source {i}: {chunk.file_path} (lines {chunk.start_line}-{chunk.end_line})\n'
            f'Function: {chunk.function_name}\n'
            f'```{chunk.language}\n{chunk.content}\n```'
        )
    context = '\n\n'.join(context_parts)
    return f'## Code Context\n{context}\n\n## Question\n{query}'

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
            stream = await c.chat.completions.create(
                model=settings.groq_model,
                messages=[
                    {'role': 'system', 'content': SYSTEM_PROMPT},
                    {'role': 'user', 'content': prompt},
                ],
                stream=True,
                temperature=0.1,
                max_tokens=2048,
            )
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    t = chunk.choices[0].delta.content
                    tokens.append(t)
                    yield t
            _mark_success(key_idx)
            _cache[gen_key] = tokens
            return
        except Exception as e:
            last_err = f'{type(e).__name__}: {e}'
            if '429' in last_err or 'rate_limit' in last_err.lower():
                await asyncio.sleep(1.0)
    if '429' in last_err or 'rate_limit' in last_err.lower():
        yield 'I\'m temporarily rate-limited by the LLM provider. Please wait 30-60 seconds and try again.'
    elif 'ConnectError' in last_err:
        yield 'Groq API unreachable. Try again.'
    else:
        yield f'LLM error: {last_err[:120]}'
