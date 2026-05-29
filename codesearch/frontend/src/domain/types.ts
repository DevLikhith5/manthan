export interface Citation {
  file: string
  path: string
  function: string
  start_line: number
  end_line: number
  repo?: string
}

export interface StreamEvent {
  type: 'citations' | 'token' | 'answer' | 'progress' | 'expanded_queries' | 'error' | '[DONE]'
  data?: string | Citation[] | string[]
  citations?: Citation[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  isStreaming?: boolean
}

export type SearchState = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}
