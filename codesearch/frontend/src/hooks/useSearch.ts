import { useState, useCallback, useRef } from 'react'
import type { ChatMessage, Citation, SearchState } from '../domain/types'
import { SEARCH_STATES } from '../domain/search'
import { searchStream } from '../adapter/api'

export function useSearch() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [state, setState] = useState<SearchState>(SEARCH_STATES.IDLE)
  const [progress, setProgress] = useState<string | null>(null)
  const [expandedQueries, setExpandedQueries] = useState<string[]>([])
  const [searchedFiles, setSearchedFiles] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const search = useCallback(async (query: string, repo?: string | null) => {
    if (!query.trim()) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: query,
    }

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      citations: [],
      isStreaming: true,
    }

    setMessages(prev => [...prev, userMessage, assistantMessage])
    setState(SEARCH_STATES.LOADING)
    setProgress('Expanding query...')
    setExpandedQueries([])
    setError(null)

    try {
      for await (const event of searchStream(query, repo || undefined)) {
        if (controller.signal.aborted) break

        if (event.type === 'error') {
          setError(event.data as string)
          setState(SEARCH_STATES.ERROR)
          setProgress(null)
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessage.id
                ? { ...m, content: `Error: ${event.data}`, isStreaming: false }
                : m,
            ),
          )
        }

        if (event.type === 'expanded_queries') {
          setExpandedQueries(event.data as string[])
        }

        if (event.type === 'progress') {
          const msg = event.data as string
          setProgress(msg)
          const fileMatch = msg.match(/^(?:Searching|Scanning|Reading)\s+(.+)/i)
          if (fileMatch) {
            setSearchedFiles(prev => prev.includes(fileMatch[1]) ? prev : [...prev, fileMatch[1]])
          }
        }

        if (event.type === 'citations') {
          const citations = event.data as Citation[]
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessage.id
                ? { ...m, citations }
                : m,
            ),
          )
          setSearchedFiles(prev => {
            const newFiles = citations
              .map(c => (c.path || c.file).split('/').pop() || c.path || c.file)
              .filter(f => !prev.includes(f))
            return [...prev, ...newFiles]
          })
          setState(SEARCH_STATES.STREAMING)
          setProgress('Generating answer with LLM...')
        }

        if (event.type === 'token') {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessage.id
                ? { ...m, content: m.content + (event.data as string) }
                : m,
            ),
          )
        }

        if (event.type === 'answer') {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessage.id
                ? {
                    ...m,
                    content: event.data as string,
                    citations: event.citations as Citation[],
                    isStreaming: false,
                  }
                : m,
            ),
          )
          setProgress(null)
        }

        if (event.type === '[DONE]') {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessage.id ? { ...m, isStreaming: false } : m,
            ),
          )
          setState(SEARCH_STATES.DONE)
          setProgress(null)
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError((err as Error).message)
        setState(SEARCH_STATES.ERROR)
        setProgress(null)
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessage.id
              ? { ...m, content: `Error: ${(err as Error).message}`, isStreaming: false }
              : m,
          ),
        )
      }
    }
  }, [])

  const restore = useCallback((newMessages: ChatMessage[]) => {
    abortRef.current?.abort()
    setMessages(newMessages)
    setState(newMessages.length > 0 ? SEARCH_STATES.DONE : SEARCH_STATES.IDLE)
    setProgress(null)
    setSearchedFiles([])
    setError(null)
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setState(SEARCH_STATES.IDLE)
    setProgress(null)
    setExpandedQueries([])
    setSearchedFiles([])
    setError(null)
  }, [])

  return { messages, state, progress, expandedQueries, searchedFiles, error, search, restore, clear }
}
