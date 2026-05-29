import { useState, useCallback } from 'react'
import type { ChatSession, ChatMessage } from '../domain/types'

const STORAGE_KEY = 'manthan-chat-sessions'

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveSessions(sessions: ChatSession[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>(loadSessions)
  const [currentId, setCurrentId] = useState<string | null>(() => {
    const id = localStorage.getItem('manthan-current-session')
    if (id && loadSessions().some(s => s.id === id)) return id
    return null
  })

  const persist = useCallback((s: ChatSession[]) => {
    setSessions(s)
    saveSessions(s)
  }, [])

  const createSession = useCallback(() => {
    const id = crypto.randomUUID()
    const now = Date.now()
    const session: ChatSession = {
      id,
      title: 'New chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
    }
    const next = [...sessions, session]
    persist(next)
    setCurrentId(id)
    localStorage.setItem('manthan-current-session', id)
    return session
  }, [sessions, persist])

  const deleteSession = useCallback((id: string) => {
    const next = sessions.filter(s => s.id !== id)
    persist(next)
    if (currentId === id) {
      const fallback = next.length > 0 ? next[next.length - 1] : null
      setCurrentId(fallback?.id ?? null)
      localStorage.setItem('manthan-current-session', fallback?.id ?? '')
    }
  }, [sessions, currentId, persist])

  const saveCurrentMessages = useCallback((messages: ChatMessage[]) => {
    if (!currentId) return
    setSessions(prev => {
      const next = prev.map(s =>
        s.id === currentId
          ? { ...s, messages, updatedAt: Date.now(), title: deriveTitle(s.title, messages) }
          : s,
      )
      saveSessions(next)
      return next
    })
  }, [currentId])

  const switchSession = useCallback((id: string) => {
    if (id === currentId) return
    setCurrentId(id)
    localStorage.setItem('manthan-current-session', id)
  }, [currentId])

  const currentSession = sessions.find(s => s.id === currentId) ?? null

  const renameSession = useCallback((id: string, title: string) => {
    setSessions(prev => {
      const next = prev.map(s => s.id === id ? { ...s, title } : s)
      saveSessions(next)
      return next
    })
  }, [])

  return {
    sessions,
    currentId,
    currentSession,
    createSession,
    deleteSession,
    switchSession,
    saveCurrentMessages,
    renameSession,
  }
}

function deriveTitle(current: string, messages: ChatMessage[]): string {
  if (current !== 'New chat') return current
  const firstUser = messages.find(m => m.role === 'user')
  if (!firstUser) return 'New chat'
  return firstUser.content.length > 50
    ? firstUser.content.slice(0, 47) + '...'
    : firstUser.content
}
