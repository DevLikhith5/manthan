import { useState, useCallback } from 'react'
import type { WikiSearchResult } from '../domain/types'

interface Props {
  results: WikiSearchResult[]
  onSelect: (entityType: string, name: string, filePath: string) => void
  onSearch: (q: string) => void
}

export default function WikiSearch({ results, onSelect, onSearch }: Props) {
  const [query, setQuery] = useState('')

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    onSearch(query)
  }, [query, onSearch])

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); if (!e.target.value) onSearch('') }}
          placeholder="Search wiki..."
          className="flex-1 px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-xs text-stone-600 dark:text-stone-300 placeholder:text-stone-400 dark:placeholder:text-stone-500 border-0 outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600"
        />
      </form>
      {results.length > 0 && (
        <div className="mt-2 space-y-0.5 max-h-60 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => onSelect(r.label === 'Class' ? 'class' : 'function', r.name, r.file_path)}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <span className="text-[10px] text-stone-400 dark:text-stone-500 uppercase w-12">{r.label}</span>
              <span className="text-xs text-stone-700 dark:text-stone-200 font-mono truncate">{r.name}</span>
              <span className="text-[10px] text-stone-300 dark:text-stone-600 truncate ml-auto">{r.file_path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
