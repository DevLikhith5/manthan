import asyncio
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import logging
from collections import deque
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

tasks = {}
repos_dir = '/tmp/codesearch_repos'
GIT_URL_PATTERN = re.compile(r'^[a-zA-Z0-9._~:/%-]+@[a-zA-Z0-9.-]+:[a-zA-Z0-9._/-]+\.git$|^https?://[^\s/$.?#].[^\s]*$|^git@[^\s:]+:[^\s]+$')
REPO_NAME_PATTERN = re.compile(r'^[a-zA-Z0-9._-]+$')

os.makedirs(repos_dir, exist_ok=True)

class IngestRequest(BaseModel):
    git_url: str
    repo_name: str | None = None

    @field_validator('git_url')
    @classmethod
    def validate_git_url(cls, v):
        v = v.strip()
        if not v:
            raise ValueError('git_url is required')
        if len(v) > 500:
            raise ValueError('git_url too long (max 500 chars)')
        parsed = urlparse(v)
        if parsed.scheme and parsed.scheme not in ('http', 'https', 'git', 'ssh'):
            raise ValueError('unsupported git protocol')
        return v

    @field_validator('repo_name')
    @classmethod
    def validate_repo_name(cls, v):
        if v is None:
            return v
        if not REPO_NAME_PATTERN.match(v):
            raise ValueError('repo_name must match [a-zA-Z0-9._-]+')
        if len(v) > 100:
            raise ValueError('repo_name too long (max 100 chars)')
        return v

class IngestResponse(BaseModel):
    task_id: str
    repo: str
    status: str

def _sanitize_path_component(name: str) -> str:
    return re.sub(r'[^a-zA-Z0-9._-]', '_', name)

@router.post('/ingest')
async def ingest(body: IngestRequest):
    repo_name = body.repo_name or body.git_url.rstrip('/').split('/')[-1].replace('.git', '')
    safe_repo = _sanitize_path_component(repo_name)
    task_id = f'ingest_{safe_repo}'

    def run_indexing():
        clone_dir = tempfile.mkdtemp(prefix=f'{safe_repo}_')
        target_dir = os.path.join(repos_dir, safe_repo)
        logs = []
        lock = threading.Lock()
        done_event = threading.Event()

        def log_line(line: str):
            with lock:
                logs.append(line)

        def read_stream(stream, log_fn):
            for line in stream:
                log_fn(line.rstrip())

        # --- git clone ---
        log_line('Cloning repository...')
        try:
            proc = subprocess.Popen(
                ['git', 'clone', '--depth=1', body.git_url, clone_dir],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            )
            reader = threading.Thread(target=read_stream, args=(proc.stdout, log_line))
            reader.start()
            proc.wait(timeout=300)
            reader.join()
            if proc.returncode != 0:
                tasks[task_id] = {
                    'status': 'failed', 'error': f'Clone failed (exit {proc.returncode})',
                    'repo': repo_name, 'logs': logs, 'done': True,
                }
                return
        except subprocess.TimeoutExpired:
            proc.kill()
            reader.join()
            tasks[task_id] = {'status': 'failed', 'error': 'Clone timed out', 'repo': repo_name, 'logs': logs, 'done': True}
            return
        except Exception as e:
            proc.kill()
            reader.join()
            tasks[task_id] = {'status': 'failed', 'error': str(e), 'repo': repo_name, 'logs': logs, 'done': True}
            return

        log_line('Clone complete')
        shutil.rmtree(target_dir, ignore_errors=True)
        shutil.move(clone_dir, target_dir)
        clone_dir = target_dir

        # --- indexer ---
        indexer_path = os.environ.get('INDEXER_PATH', '/tmp/indexer')
        env = os.environ.copy()
        env['REPO_PATH'] = clone_dir
        env['REPO_NAME'] = safe_repo
        env['QDRANT_URL'] = settings.qdrant_url.replace('http://', '').replace(':6333', ':6334')
        env['REDIS_URL'] = settings.redis_url
        env['EMBEDDING_SERVICE_URL'] = settings.embedding_service_url
        env['EMBEDDING_MODEL'] = settings.embedding_model
        env['QUEUE_NAME'] = f'ingestion_{safe_repo}'
        env['CONSUMER_GROUP'] = f'ingestion_workers_{safe_repo}'
        env['WORKER_COUNT'] = '8'
        env['ONESHOT'] = 'true'
        env['ONESHOT_TIMEOUT_SEC'] = '300'
        env['BM25_INDEX_PATH'] = '/tmp/bm25.pkl'
        env['VECTOR_DIM'] = str(settings.vector_dim)

        tasks[task_id] = {'status': 'indexing', 'repo': repo_name, 'logs': logs, 'lock': lock, 'done': False}

        log_line('Starting indexer')
        try:
            proc = subprocess.Popen(
                [indexer_path], env=env,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            )
            reader = threading.Thread(target=read_stream, args=(proc.stdout, log_line))
            reader.start()
            proc.wait(timeout=600)
            reader.join()
            if proc.returncode != 0:
                tasks[task_id] = {
                    'status': 'failed', 'error': f'Indexer failed (exit {proc.returncode})',
                    'repo': repo_name, 'logs': logs, 'done': True,
                }
                return

            completed = 0
            for line in logs:
                if '"indexed file"' in line:
                    completed += 1

            tasks[task_id] = {
                'status': 'ok', 'repo': repo_name,
                'files_indexed': completed, 'repo_path': target_dir,
                'logs': logs, 'done': True,
            }
        except subprocess.TimeoutExpired:
            proc.kill()
            reader.join()
            tasks[task_id] = {'status': 'failed', 'error': 'Indexing timed out', 'repo': repo_name, 'logs': logs, 'done': True}
        except Exception as e:
            proc.kill()
            reader.join()
            tasks[task_id] = {'status': 'failed', 'error': str(e), 'repo': repo_name, 'logs': logs, 'done': True}

    thread = threading.Thread(target=run_indexing)
    thread.start()

    return {'task_id': task_id, 'repo': repo_name, 'status': 'started'}

@router.get('/ingest/{task_id}')
async def get_ingest_status(task_id: str):
    if task_id not in tasks:
        return {'status': 'not_found'}
    return tasks[task_id]

@router.get('/ingest/{task_id}/logs/stream')
async def ingest_log_stream(task_id: str):
    async def event_generator():
        if task_id not in tasks:
            yield f"data: {json.dumps({'done': True, 'status': 'not_found'})}\n\n"
            return

        last_len = 0
        while True:
            task = tasks[task_id]
            logs = task.get('logs', [])
            lock = task.get('lock')
            if lock:
                with lock:
                    new_lines = logs[last_len:]
                    last_len = len(logs)
            else:
                new_lines = logs[last_len:]
                last_len = len(logs)

            for line in new_lines:
                yield f"data: {json.dumps({'line': line})}\n\n"

            if task.get('done'):
                yield f"data: {json.dumps({'done': True, 'status': task.get('status', 'ok')})}\n\n"
                return

            await asyncio.sleep(0.1)

    return StreamingResponse(event_generator(), media_type='text/event-stream')

@router.get('/repos/{repo_name}/path')
async def get_repo_path(repo_name: str):
    safe = _sanitize_path_component(repo_name)
    path = os.path.join(repos_dir, safe)
    if os.path.exists(path):
        return {'path': path}
    return {'path': None}
