import { useState, useRef, useEffect } from 'react'
import { XMarkIcon, ArrowRightIcon } from './Icons'

interface SearchBarProps {
  onSearch: (query: string) => void
  isStreaming: boolean
}

export default function SearchBar({ onSearch, isStreaming }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim() || isStreaming) return
    onSearch(query.trim())
    setQuery('')
  }

  return (
    <form onSubmit={handleSubmit} className="w-full mx-auto">
      <div className={`relative transition-all duration-150 ${focused ? 'scale-[1.01]' : 'scale-100'}`}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Ask a question about your codebase..."
          className="search-input pl-16 pr-20"
          disabled={isStreaming}
        />
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
          <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-[10px] font-medium text-stone-400 dark:text-stone-500 leading-none border border-stone-150 dark:border-stone-700 select-none">
            <span className="text-[11px]">⌘</span>
            <span>K</span>
          </kbd>
        </div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
          {query.trim() && !isStreaming && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 mr-0.5 text-stone-300 hover:text-stone-400 dark:hover:text-stone-300 transition-all duration-150 hover:scale-110 active:scale-90"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
          <button
            type="submit"
            disabled={!query.trim() || isStreaming}
            className="w-7 h-7 flex items-center justify-center rounded-md bg-stone-200 dark:bg-stone-700 text-stone-500 dark:text-stone-300 hover:bg-stone-300 dark:hover:bg-stone-600 disabled:opacity-25 disabled:cursor-not-allowed transition-all duration-150 active:scale-85"
          >
            {isStreaming ? (
              <span className="loading-dots">
                <span /><span /><span />
              </span>
            ) : (
              <ArrowRightIcon className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </form>
  )
}
