import { useState, useEffect, useCallback } from 'react'

export interface HistoryItem {
  id: string
  query: string
  timestamp: number
}

const STORAGE_KEY = 'manthan-history'
const MAX_ITEMS = 20

function load(): HistoryItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

export function useSearchHistory() {
  const [items, setItems] = useState<HistoryItem[]>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {}
  }, [items])

  const add = useCallback((query: string) => {
    setItems(prev => {
      const filtered = prev.filter(i => i.query !== query)
      return [{ id: crypto.randomUUID(), query, timestamp: Date.now() }, ...filtered].slice(0, MAX_ITEMS)
    })
  }, [])

  const remove = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }, [])

  const clear = useCallback(() => {
    setItems([])
  }, [])

  return { items, add, remove, clear, formatTime }
}
