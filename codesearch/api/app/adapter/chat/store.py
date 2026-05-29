import json
import sqlite3
import os
import threading
from dataclasses import dataclass, field, asdict
from typing import Optional

DB_PATH = os.environ.get('CHAT_DB_PATH', '/tmp/manthan_chat.db')

_local = threading.local()

def _get_conn() -> sqlite3.Connection:
    if not hasattr(_local, 'conn') or _local.conn is None:
        _local.conn = sqlite3.connect(DB_PATH)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute('PRAGMA journal_mode=WAL')
        _local.conn.execute('PRAGMA synchronous=NORMAL')
    return _local.conn

def init_db():
    conn = _get_conn()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT 'New chat',
            repo TEXT DEFAULT NULL,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK(role IN ('user','assistant')),
            content TEXT NOT NULL DEFAULT '',
            citations TEXT DEFAULT NULL,
            is_streaming INTEGER NOT NULL DEFAULT 0,
            created_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
    ''')
    conn.commit()

@dataclass
class Session:
    id: str
    title: str = 'New chat'
    repo: Optional[str] = None
    created_at: float = 0.0
    updated_at: float = 0.0

@dataclass
class Message:
    id: str
    session_id: str
    role: str
    content: str = ''
    citations: Optional[list] = None
    is_streaming: bool = False
    created_at: float = 0.0

def list_sessions() -> list[Session]:
    conn = _get_conn()
    rows = conn.execute(
        'SELECT id, title, repo, created_at, updated_at FROM sessions ORDER BY updated_at DESC'
    ).fetchall()
    return [Session(**dict(r)) for r in rows]

def get_session(session_id: str) -> Optional[Session]:
    conn = _get_conn()
    r = conn.execute(
        'SELECT id, title, repo, created_at, updated_at FROM sessions WHERE id = ?',
        (session_id,)
    ).fetchone()
    return Session(**dict(r)) if r else None

def get_messages(session_id: str) -> list[Message]:
    conn = _get_conn()
    rows = conn.execute(
        'SELECT id, session_id, role, content, citations, is_streaming, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC',
        (session_id,)
    ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d['citations'] = json.loads(d['citations']) if d.get('citations') else None
        d['is_streaming'] = bool(d['is_streaming'])
        result.append(Message(**d))
    return result

def _now_ms() -> float:
    return __import__('time').time() * 1000

def create_session(session_id: str, title: str = 'New chat', repo: Optional[str] = None) -> Session:
    now = _now_ms()
    conn = _get_conn()
    conn.execute(
        'INSERT INTO sessions (id, title, repo, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        (session_id, title, repo, now, now)
    )
    conn.commit()
    return Session(id=session_id, title=title, repo=repo, created_at=now, updated_at=now)

def update_session(session_id: str, title: Optional[str] = None, repo: Optional[str] = None) -> bool:
    conn = _get_conn()
    fields = []
    values = []
    if title is not None:
        fields.append('title = ?')
        values.append(title)
    if repo is not None:
        fields.append('repo = ?')
        values.append(repo)
    if not fields:
        return False
    fields.append('updated_at = ?')
    values.append(_now_ms())
    values.append(session_id)
    conn.execute(f'UPDATE sessions SET {", ".join(fields)} WHERE id = ?', values)
    conn.commit()
    return True

def delete_session(session_id: str) -> bool:
    conn = _get_conn()
    conn.execute('DELETE FROM messages WHERE session_id = ?', (session_id,))
    conn.execute('DELETE FROM sessions WHERE id = ?', (session_id,))
    conn.commit()
    return True

def save_messages(session_id: str, messages: list[dict]) -> bool:
    conn = _get_conn()
    now = _now_ms()
    conn.execute('DELETE FROM messages WHERE session_id = ?', (session_id,))
    for m in messages:
        conn.execute(
            'INSERT INTO messages (id, session_id, role, content, citations, is_streaming, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (
                m['id'],
                session_id,
                m['role'],
                m.get('content', ''),
                json.dumps(m.get('citations')) if m.get('citations') else None,
                1 if m.get('is_streaming') else 0,
                m.get('created_at', now),
            )
        )
    conn.execute('UPDATE sessions SET updated_at = ? WHERE id = ?', (now, session_id))
    conn.commit()
    return True

def title_from_messages(messages: list[dict]) -> str:
    for m in messages:
        if m.get('role') == 'user' and m.get('content'):
            c = m['content']
            return c[:50] + '...' if len(c) > 50 else c
    return 'New chat'
