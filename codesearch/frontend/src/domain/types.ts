export interface Citation {
  file: string
  path: string
  function: string
  start_line: number
  end_line: number
  repo?: string
}

export interface StreamEvent {
  type: 'citations' | 'token' | 'answer' | 'progress' | 'expanded_queries' | 'error' | 'meta' | '[DONE]'
  data?: any
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

export type Tab = 'search' | 'repos' | 'wiki'

export interface GraphNode {
  id: string
  label: string
  name: string
  file_path?: string
  start_line?: number
  end_line?: number
  kind?: string
  repo?: string
}

export interface GraphEdge {
  from: string
  to: string
  type: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface WikiTreeNode {
  path: string
  language: string
  symbols: { name: string; kind: string; file_path: string; start_line?: number }[]
}

export interface WikiPage {
  type: 'file' | 'function' | 'class'
  path?: string
  name?: string
  file_path?: string
  language?: string
  signature?: string
  start_line?: number
  end_line?: number
  source?: string
  symbols?: { name: string; kind: string; start_line?: number; end_line?: number }[]
  imports?: string[]
  calls?: { name: string; file_path: string }[]
  called_by?: { name: string; file_path: string }[]
  methods?: { name: string; kind: string; start_line?: number }[]
  extends?: string[]
  implements?: string[]
}

export interface WikiSearchResult {
  label: string
  name: string
  file_path: string
  start_line: number
}
