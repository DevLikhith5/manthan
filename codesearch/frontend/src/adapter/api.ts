import type { StreamEvent } from '../domain/types'

type ChatTurn = { role: 'user' | 'assistant'; content: string }

export async function* searchStream(query: string, repo?: string, history: ChatTurn[] = []): AsyncGenerator<StreamEvent> {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: 8, repo, history }),
  })

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') {
        yield { type: '[DONE]' }
        return
      }
      try {
        const parsed = JSON.parse(data)
        yield {
          type: parsed.type,
          data: parsed.data,
          citations: parsed.citations,
        } as StreamEvent
      } catch {
        // skip malformed JSON
      }
    }
  }
}
