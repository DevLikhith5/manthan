import { useState } from 'react'
import type { Citation } from '../domain/types'

interface CitationsPanelProps {
  citations: Citation[]
}

function openInVsCode(citation: Citation) {
  const url = `vscode://file/${citation.file}:${citation.start_line}`
  window.open(url, '_blank')
}

function repoColor(name: string): string {
  const colors = [
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  ]
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export default function CitationsPanel({ citations }: CitationsPanelProps) {
  const [selected, setSelected] = useState<number | null>(null)

  if (!citations.length) return null

  return (
    <div className="flex flex-col gap-2 w-full">
      {citations.map((c, i) => {
        const isSelected = selected === i
        return (
          <div key={i} className="animate-slide-up-sm" style={{ animationDelay: `${i * 0.05}s` }}>
            <button
              onClick={() => {
                setSelected(isSelected ? null : i)
                openInVsCode(c)
              }}
              className="w-full text-left p-2.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800/40 hover:bg-stone-50 dark:hover:bg-stone-700/60 hover:border-stone-300 dark:hover:border-stone-600 transition-all duration-150 group hover:scale-[1.015] active:scale-[0.99] animate-fade-in"
              title={`${c.file}:${c.start_line}-${c.end_line}`}
            >
              <div className="flex items-start gap-2.5">
                <svg className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-stone-600 dark:text-stone-300 truncate font-medium">
                    {c.file.split('/').pop()}
                  </div>
                  <div className="text-[11px] text-stone-400 dark:text-stone-500 font-mono mt-0.5">
                    L{c.start_line}{c.end_line && c.start_line !== c.end_line ? `-${c.end_line}` : ''}
                  </div>
                  {c.function && (
                    <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate mt-1">
                      {c.function}
                    </div>
                  )}
                  {c.repo && (
                    <div className={`text-[10px] font-medium px-1.5 py-0.5 rounded mt-1.5 w-fit ${repoColor(c.repo)}`}>
                      {c.repo}
                    </div>
                  )}
                </div>
              </div>
            </button>
            {isSelected && (
              <div className="mt-2 p-2.5 rounded-lg bg-stone-100 dark:bg-stone-700/40 border border-stone-200 dark:border-stone-600/40 animate-scale-in text-[11px] space-y-1.5">
                <div className="font-mono text-stone-600 dark:text-stone-300 break-all">{c.file}</div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    openInVsCode(c)
                  }}
                  className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  Open
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
