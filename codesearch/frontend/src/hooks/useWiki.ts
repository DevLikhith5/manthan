import { useState, useEffect, useCallback } from 'react'
import type { WikiTreeNode, WikiPage, WikiSearchResult } from '../domain/types'

export function useWiki(repo: string) {
  const [tree, setTree] = useState<WikiTreeNode[]>([])
  const [currentPage, setCurrentPage] = useState<WikiPage | null>(null)
  const [searchResults, setSearchResults] = useState<WikiSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!repo) return
    setLoading(true)
    fetch(`/api/wiki/tree?repo=${encodeURIComponent(repo)}`)
      .then(r => r.json())
      .then(d => { setTree(d.tree || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [repo])

  const selectPage = useCallback(async (entityType: string, name: string, filePath: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        entity_type: entityType,
        name,
        file_path: filePath,
        repo,
      })
      const res = await fetch(`/api/wiki/page?${params}`)
      const page = await res.json()
      if (!page.error) {
        setCurrentPage(page)
      }
    } catch {}
    setLoading(false)
  }, [repo])

  const searchWiki = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return }
    try {
      const res = await fetch(`/api/wiki/search?q=${encodeURIComponent(q)}&repo=${encodeURIComponent(repo)}`)
      const data = await res.json()
      setSearchResults(data.results || [])
    } catch {}
  }, [repo])

  return { tree, currentPage, searchResults, loading, selectPage, searchWiki, setCurrentPage }
}
