import { useState, useRef, useEffect } from 'react'
import { DocumentTextIcon } from './Icons'

interface RepoSelectorProps {
  repos: string[]
  selected: string | null
  onSelect: (repo: string | null) => void
  onAddRepo: () => void
  isStreaming: boolean
}

export default function RepoSelector({ repos, selected, onSelect, onAddRepo, isStreaming }: RepoSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !isStreaming && setOpen(!open)}
        disabled={isStreaming}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all duration-150 ${
          isStreaming
            ? 'text-stone-300 dark:text-stone-600 cursor-not-allowed'
            : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-95'
        }`}
      >
        <DocumentTextIcon className="w-3.5 h-3.5" />
        <span>{selected || 'All repos'}</span>
        {!isStreaming && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 opacity-60">
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-stone-900 rounded-xl shadow-lg border border-stone-200 dark:border-stone-800 py-1 z-20 animate-scale-in origin-top-left">
          <div className="px-3 py-1.5 text-[10px] font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">
            Repository
          </div>
          <button
            onClick={() => { onSelect(null); setOpen(false) }}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
              selected === null
                ? 'text-stone-900 dark:text-stone-100 bg-stone-100 dark:bg-stone-800'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800/50'
            }`}
          >
            All repos
          </button>
          {repos.map(repo => (
            <button
              key={repo}
              onClick={() => { onSelect(repo); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors truncate ${
                selected === repo
                  ? 'text-stone-900 dark:text-stone-100 bg-stone-100 dark:bg-stone-800'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800/50'
              }`}
            >
              {repo}
            </button>
          ))}
          <div className="border-t border-stone-100 dark:border-stone-800 mt-1 pt-1 px-2">
            <button
              onClick={() => { setOpen(false); onAddRepo() }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add repository
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
