from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.adapter.chat.store import (
    init_db, list_sessions, get_session, get_messages,
    create_session, update_session, delete_session,
    save_messages, title_from_messages,
)

router = APIRouter()

init_db()

class CreateSessionRequest(BaseModel):
    id: str
    repo: str | None = None

class UpdateSessionRequest(BaseModel):
    title: str | None = None
    repo: str | None = None

class SaveMessagesRequest(BaseModel):
    messages: list[dict]

@router.get('/sessions')
async def list_():
    sessions = list_sessions()
    return {
        'sessions': [
            {'id': s.id, 'title': s.title, 'repo': s.repo, 'createdAt': s.created_at, 'updatedAt': s.updated_at}
            for s in sessions
        ]
    }

@router.post('/sessions')
async def create(body: CreateSessionRequest):
    session = create_session(body.id, repo=body.repo)
    return {'id': session.id, 'title': session.title, 'repo': session.repo, 'createdAt': session.created_at, 'updatedAt': session.updated_at}

@router.get('/sessions/{session_id}')
async def get(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(404, 'Session not found')
    messages = get_messages(session_id)
    return {
        'id': session.id,
        'title': session.title,
        'repo': session.repo,
        'createdAt': session.created_at,
        'updatedAt': session.updated_at,
        'messages': [
            {
                'id': m.id,
                'role': m.role,
                'content': m.content,
                'citations': m.citations,
                'isStreaming': m.is_streaming,
                'createdAt': m.created_at,
            }
            for m in messages
        ],
    }

@router.put('/sessions/{session_id}')
async def update(session_id: str, body: UpdateSessionRequest):
    if not get_session(session_id):
        raise HTTPException(404, 'Session not found')
    update_session(session_id, title=body.title, repo=body.repo)
    return {'ok': True}

@router.delete('/sessions/{session_id}')
async def delete(session_id: str):
    if not get_session(session_id):
        raise HTTPException(404, 'Session not found')
    delete_session(session_id)
    return {'ok': True}

@router.put('/sessions/{session_id}/messages')
async def save(session_id: str, body: SaveMessagesRequest):
    if not get_session(session_id):
        raise HTTPException(404, 'Session not found')
    save_messages(session_id, body.messages)
    title = title_from_messages(body.messages)
    update_session(session_id, title=title)
    return {'ok': True}
