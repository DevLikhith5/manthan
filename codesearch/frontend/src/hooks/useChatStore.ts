import { useReducer, useCallback, useRef, useEffect, useMemo } from 'react'
import type { ChatMessage, ChatSession, Citation, SearchState } from '../domain/types'
import { searchStream } from '../adapter/api'

export type Tab = 'search' | 'repos' | 'wiki'

type State = {
  sessions: ChatSession[]
  currentId: string | null
  messages: ChatMessage[]
  status: SearchState
  progress: string | null
  retrievalConfidence: number | null
  answerMode: 'high_confidence' | 'low_confidence' | null
  confidenceReason: string[]
  sourceBreakdown: Record<string, number> | null
  queryIntent: string | null
  expandedQueries: string[]
  searchedFiles: string[]
  error: string | null
  selectedRepo: string | null
  tab: Tab
  loaded: boolean
}

type Action =
  | { type: 'SET_LOADED'; sessions: ChatSession[]; currentId: string | null }
  | { type: 'SET_SESSIONS'; sessions: ChatSession[] }
  | { type: 'SET_CURRENT'; id: string | null }
  | { type: 'CREATE_SESSION'; session: ChatSession }
  | { type: 'REMOVE_SESSION'; id: string; fallbackId: string | null }
  | { type: 'UPDATE_SESSION'; id: string; updates: Partial<ChatSession> }
  | { type: 'SELECT_REPO'; repo: string | null }
  | { type: 'SET_TAB'; tab: Tab }
  | { type: 'LINK_REPO'; repo: string }
  | { type: 'START_SEARCH' }
  | { type: 'SET_PROGRESS'; progress: string | null }
  | { type: 'SET_META'; confidence: number | null; answerMode: 'high_confidence' | 'low_confidence' | null; reasons: string[]; sourceBreakdown: Record<string, number> | null; queryIntent: string | null }
  | { type: 'SET_EXPANDED_QUERIES'; queries: string[] }
  | { type: 'ADD_SEARCHED_FILE'; file: string }
  | { type: 'CLEAR_SEARCHED_FILES' }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RECEIVE_TOKEN'; token: string; messageId: string }
  | { type: 'SET_CITATIONS'; citations: Citation[]; messageId: string }
  | { type: 'FINISH_STREAMING'; messageId: string }
  | { type: 'RECEIVE_ANSWER'; messageId: string; content: string; citations: Citation[] }
  | { type: 'MARK_DONE' }
  | { type: 'RESTORE'; messages: ChatMessage[]; status: SearchState }
  | { type: 'CLEAR' }
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'SET_STATE'; state: Partial<State> }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_LOADED': {
      const savedTab = localStorage.getItem('manthan-tab') as Tab | null
      return { ...state, loaded: true, sessions: action.sessions, currentId: action.currentId, tab: savedTab || (action.currentId ? 'search' : state.tab) }
    }

    case 'SET_SESSIONS':
      return { ...state, sessions: action.sessions }

    case 'SET_CURRENT':
      return { ...state, currentId: action.id }

    case 'CREATE_SESSION':
      return { ...state, sessions: [...state.sessions, action.session], currentId: action.session.id }

    case 'REMOVE_SESSION': {
      const sessions = state.sessions.filter(s => s.id !== action.id)
      const currentId = state.currentId === action.id ? action.fallbackId : state.currentId
      return { ...state, sessions, currentId }
    }

    case 'UPDATE_SESSION':
      return {
        ...state,
        sessions: state.sessions.map(s => s.id === action.id ? { ...s, ...action.updates } : s),
      }

    case 'SELECT_REPO':
      return { ...state, selectedRepo: action.repo }

    case 'SET_TAB':
      localStorage.setItem('manthan-tab', action.tab)
      return { ...state, tab: action.tab }

    case 'LINK_REPO':
      return { ...state, selectedRepo: action.repo }

    case 'START_SEARCH':
      return { ...state, status: 'loading', error: null, progress: 'Expanding query...', expandedQueries: [], searchedFiles: [], retrievalConfidence: null, answerMode: null, confidenceReason: [], sourceBreakdown: null }

    case 'SET_PROGRESS':
      return { ...state, progress: action.progress }

    case 'SET_META':
      return { ...state, retrievalConfidence: action.confidence, answerMode: action.answerMode, confidenceReason: action.reasons, sourceBreakdown: action.sourceBreakdown, queryIntent: action.queryIntent }

    case 'SET_EXPANDED_QUERIES':
      return { ...state, expandedQueries: action.queries }

    case 'ADD_SEARCHED_FILE':
      return state.searchedFiles.includes(action.file) ? state : { ...state, searchedFiles: [...state.searchedFiles, action.file] }

    case 'CLEAR_SEARCHED_FILES':
      return { ...state, searchedFiles: [] }

    case 'SET_ERROR':
      return { ...state, error: action.error, status: action.error ? 'error' : state.status, progress: action.error ? null : state.progress }

    case 'RECEIVE_TOKEN':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.messageId ? { ...m, content: m.content + action.token } : m,
        ),
        status: 'streaming',
      }

    case 'SET_CITATIONS':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.messageId ? { ...m, citations: action.citations } : m,
        ),
        searchedFiles: [
          ...new Set([
            ...state.searchedFiles,
            ...action.citations.map(c => (c.path || c.file).split('/').pop() || c.path || c.file),
          ]),
        ],
        status: 'streaming',
        progress: 'Generating answer with LLM...',
      }

    case 'FINISH_STREAMING':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.messageId ? { ...m, isStreaming: false } : m,
        ),
      }

    case 'RECEIVE_ANSWER':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.messageId ? { ...m, content: action.content, citations: action.citations, isStreaming: false } : m,
        ),
        progress: null,
      }

    case 'MARK_DONE':
      return { ...state, status: 'done', progress: null }

    case 'CLEAR':
      return { ...state, messages: [], status: 'idle', progress: null, expandedQueries: [], searchedFiles: [], error: null, currentId: null }

    case 'RESTORE':
      return { ...state, messages: action.messages, status: action.status, progress: null, searchedFiles: [], error: null }

    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] }

    case 'SET_STATE':
      return { ...state, ...action.state }

    default:
      return state
  }
}

const INITIAL: State = {
  sessions: [],
  currentId: null,
  messages: [],
  status: 'idle',
  progress: null,
  retrievalConfidence: null,
  answerMode: null,
  confidenceReason: [],
  expandedQueries: [],
  searchedFiles: [],
  error: null,
  selectedRepo: null,
  tab: 'repos',
  sourceBreakdown: null,
  queryIntent: null,
  loaded: false,
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, options)
  if (!r.ok) {
    let msg = r.statusText
    try { const d = await r.json(); msg = d.detail || msg } catch {}
    throw new Error(msg)
  }
  return r.json()
}

function sessionToMessage(m: any): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content || '',
    citations: m.citations || undefined,
    isStreaming: m.isStreaming || false,
  }
}

export function useChatStore() {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const abortRef = useRef<AbortController | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentIdRef = useRef(state.currentId)
  const messagesRef = useRef(state.messages)

  useEffect(() => { currentIdRef.current = state.currentId }, [state.currentId])
  useEffect(() => { messagesRef.current = state.messages }, [state.messages])

  // Load sessions on mount
  useEffect(() => {
    (async () => {
      const { sessions } = await api<{ sessions: ChatSession[] }>('/api/sessions')
      const saved = localStorage.getItem('manthan-current-session')
      const currentId = saved && sessions.some(s => s.id === saved) ? saved : null
      dispatch({ type: 'SET_LOADED', sessions, currentId })
    })()
  }, [])

  // Load messages when currentId changes
  useEffect(() => {
    if (!state.currentId) return
    let cancelled = false
    ;(async () => {
      try {
        const session = await api<any>(`/api/sessions/${state.currentId}`)
        if (cancelled) return
        const messages = (session.messages || []).map(sessionToMessage)
        dispatch({ type: 'SELECT_REPO', repo: session.repo || null })
        dispatch({ type: 'RESTORE', messages, status: messages.length ? 'done' : 'idle' })
      } catch {}
    })()
    return () => { cancelled = true }
  }, [state.currentId])

  // Auto-save to API when streaming finishes (debounced)
  useEffect(() => {
    if (state.status !== 'done' && state.status !== 'idle') return
    if (!state.currentId || !state.messages.length) return

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const msgs = messagesRef.current.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        citations: m.citations || null,
        isStreaming: false,
        createdAt: Date.now(),
      }))
      api(`/api/sessions/${currentIdRef.current}/messages`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs }),
      }).catch(() => {})
    }, 300)

    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [state.status, state.currentId, state.messages.length])

  const ensureSession = useCallback(async (repo?: string | null) => {
    if (currentIdRef.current) return currentIdRef.current
    const id = crypto.randomUUID()
    const now = Date.now()
    const session: ChatSession = { id, title: 'New chat', messages: [], createdAt: now, updatedAt: now }
    try {
      await api('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, repo: repo || null }),
      })
    } catch {}
    localStorage.setItem('manthan-current-session', id)
    dispatch({ type: 'CREATE_SESSION', session })
    return id
  }, [])

  const search = useCallback(async (query: string, repo?: string | null) => {
    if (!query.trim()) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const effectiveRepo = repo ?? state.selectedRepo ?? null
    const sessionId = await ensureSession(effectiveRepo)

    const isNewSession = !state.sessions.find(s => s.id === sessionId)
    if (isNewSession) {
      const title = query.length > 60 ? query.slice(0, 57) + '...' : query
      dispatch({ type: 'UPDATE_SESSION', id: sessionId, updates: { title } })
      try {
        await api(`/api/sessions/${sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        })
      } catch {}
    }

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: query }
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', citations: [], isStreaming: true }

    dispatch({ type: 'ADD_MESSAGE', message: userMsg })
    dispatch({ type: 'ADD_MESSAGE', message: assistantMsg })
    dispatch({ type: 'START_SEARCH' })

    try {
      const history = messagesRef.current
        .filter(m => (m.role === 'user' || m.role === 'assistant') && !!m.content?.trim())
        .slice(-8)
        .map(m => ({ role: m.role, content: m.content }))

      for await (const event of searchStream(query, effectiveRepo || undefined, history)) {
        if (controller.signal.aborted) break

        if (event.type === 'error') {
          dispatch({ type: 'SET_ERROR', error: event.data as string })
          dispatch({ type: 'RECEIVE_ANSWER', messageId: assistantMsg.id, content: `Error: ${event.data}`, citations: [] })
        }

        if (event.type === 'expanded_queries') {
          dispatch({ type: 'SET_EXPANDED_QUERIES', queries: event.data as string[] })
        }

        if (event.type === 'progress') {
          dispatch({ type: 'SET_PROGRESS', progress: event.data as string })
          const match = (event.data as string).match(/^(?:Searching|Scanning|Reading)\s+(.+)/i)
          if (match) dispatch({ type: 'ADD_SEARCHED_FILE', file: match[1] })
        }

        if (event.type === 'meta') {
          const meta = (event.data || {}) as any
          dispatch({
            type: 'SET_META',
            confidence: typeof meta.retrieval_confidence === 'number' ? meta.retrieval_confidence : null,
            answerMode: (meta.answer_mode as 'high_confidence' | 'low_confidence' | null) || null,
            reasons: Array.isArray(meta.confidence_reason) ? meta.confidence_reason : [],
            sourceBreakdown: typeof meta.source_breakdown === 'object' && meta.source_breakdown !== null ? meta.source_breakdown : null,
            queryIntent: typeof meta.query_intent === 'string' ? meta.query_intent : null,
          })
        }

        if (event.type === 'citations') {
          dispatch({ type: 'SET_CITATIONS', citations: event.data as Citation[], messageId: assistantMsg.id })
        }

        if (event.type === 'token') {
          dispatch({ type: 'RECEIVE_TOKEN', token: event.data as string, messageId: assistantMsg.id })
        }

        if (event.type === 'answer') {
          dispatch({ type: 'RECEIVE_ANSWER', messageId: assistantMsg.id, content: event.data as string, citations: event.citations as Citation[] })
        }

        if (event.type === '[DONE]') {
          dispatch({ type: 'FINISH_STREAMING', messageId: assistantMsg.id })
          dispatch({ type: 'MARK_DONE' })
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        dispatch({ type: 'SET_ERROR', error: (err as Error).message })
      }
    }
  }, [ensureSession, state.selectedRepo])

  const switchSession = useCallback(async (id: string) => {
    if (id === currentIdRef.current) return
    abortRef.current?.abort()
    const sess = state.sessions.find(s => s.id === id)
    dispatch({ type: 'SELECT_REPO', repo: (sess as any)?.repo || null })
    localStorage.setItem('manthan-current-session', id)
    dispatch({ type: 'SET_CURRENT', id })
  }, [state.sessions])

  const newChat = useCallback(async (repo?: string | null) => {
    abortRef.current?.abort()
    dispatch({ type: 'CLEAR' })
    currentIdRef.current = null
    await ensureSession(repo)
  }, [ensureSession])

  const deleteSession = useCallback(async (id: string) => {
    try { await api(`/api/sessions/${id}`, { method: 'DELETE' }) } catch {}
    const sessions = state.sessions.filter(s => s.id !== id)
    const fallbackId = sessions.length ? sessions[sessions.length - 1].id : null
    dispatch({ type: 'REMOVE_SESSION', id, fallbackId })
    if (state.currentId === id && fallbackId) {
      localStorage.setItem('manthan-current-session', fallbackId)
    } else if (state.currentId === id) {
      localStorage.removeItem('manthan-current-session')
    }
  }, [state.sessions, state.currentId])

  const renameSession = useCallback(async (id: string, title: string) => {
    try {
      await api(`/api/sessions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
    } catch {}
    dispatch({ type: 'UPDATE_SESSION', id, updates: { title } })
  }, [])

  const refreshSessions = useCallback(async () => {
    try {
      const { sessions } = await api<{ sessions: ChatSession[] }>('/api/sessions')
      dispatch({ type: 'SET_SESSIONS', sessions })
    } catch {}
  }, [])

  const setTab = useCallback((tab: Tab) => dispatch({ type: 'SET_TAB', tab }), [])

  const store = useMemo(() => ({
    ...state,
    search,
    switchSession,
    newChat,
    deleteSession,
    renameSession,
    refreshSessions,
    setTab,
    dispatch,
  }), [state, search, switchSession, newChat, deleteSession, renameSession, refreshSessions, setTab])

  return store
}
