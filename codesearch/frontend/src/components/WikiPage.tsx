import { useState } from 'react'
import type { WikiPage as WikiPageType } from '../domain/types'
import CallGraphModal from './CallGraphModal'
import FileGraphModal from './FileGraphModal'

interface Props {
  page: WikiPageType
  onSelect: (entityType: string, name: string, filePath: string) => void
  onBack: () => void
  repo?: string
}

function CodeBlock({ code, language, startLine }: { code: string; language?: string; startLine?: number }) {
  if (!code) return null
  const lines = code.split('\n')
  const sl = startLine || 1
  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-700/60 overflow-hidden bg-stone-50 dark:bg-stone-900/80">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-stone-200 dark:border-stone-700/50 bg-stone-100 dark:bg-stone-800/60">
        <svg className="w-3 h-3 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"/>
        </svg>
        <span className="text-[10px] text-stone-400 dark:text-stone-500 font-mono">{language || 'code'}</span>
        <span className="text-[10px] text-stone-300 dark:text-stone-600 ml-auto">{lines.length} lines</span>
      </div>
      <div className="overflow-x-auto">
        <pre className="text-[11px] leading-[1.6] font-mono p-0">
          {lines.map((line, i) => (
            <div key={i} className="flex hover:bg-stone-100 dark:hover:bg-stone-800/40 px-0">
              <span className="select-none text-stone-300 dark:text-stone-600 text-right w-10 pr-3 flex-shrink-0 border-r border-stone-200 dark:border-stone-700/40">
                {sl + i}
              </span>
              <code className="pl-3 pr-4 text-stone-700 dark:text-stone-300 whitespace-pre">{line}</code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}

function CallBadge({ call, onSelect, type }: { call: { name: string; file_path: string }; onSelect: Props['onSelect']; type: 'calls' | 'called_by' }) {
  const color = type === 'calls'
    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'
    : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
  return (
    <button
      onClick={() => onSelect('function', call.name, call.file_path)}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-mono transition-colors ${color}`}
    >
      {type === 'calls' ? (
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
      ) : (
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>
      )}
      {call.name}
    </button>
  )
}

export default function WikiPage({ page, onSelect, onBack, repo }: Props) {
  const [showGraph, setShowGraph] = useState(false)
  const [showFileGraph, setShowFileGraph] = useState(false)
  if (!page) return null

  const langColors: Record<string, string> = {
    go: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    python: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    typescript: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    javascript: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    rust: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    java: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }
  const langBadge = langColors[page.language || ''] || 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'

  return (
    <div className="p-6 max-w-4xl space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={onBack} className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${langBadge}`}>
            {page.type}
          </span>
          {page.language && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${langBadge}`}>
              {page.language}
            </span>
          )}
          {page.type === 'function' && (
            <button
              onClick={() => setShowGraph(true)}
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-700 transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h8v8H3V3zM13 3h8v8h-8V3zM3 13h8v8H3v-8zM13 13h8v8h-8v-8z" />
              </svg>
              Call Graph
            </button>
          )}
          {page.type === 'file' && (
            <button
              onClick={() => setShowFileGraph(true)}
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-700 transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h8v8H3V3zM13 3h8v8h-8V3zM3 13h8v8H3v-8zM13 13h8v8h-8v-8z" />
              </svg>
              File Graph
            </button>
          )}
        </div>
        <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100 font-mono">
          {page.name || page.path}
        </h1>
        {page.file_path && (
          <p className="text-xs text-stone-400 dark:text-stone-500 font-mono mt-1">
            {page.file_path}
            {page.start_line ? `:${page.start_line}` : ''}
            {page.end_line && page.start_line !== page.end_line ? `-${page.end_line}` : ''}
          </p>
        )}
      </div>

      {/* Signature */}
      {page.signature && (
        <div className="p-3 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
          <div className="text-[10px] text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1 font-medium">Signature</div>
          <code className="text-sm text-stone-700 dark:text-stone-200 font-mono break-all">{page.signature}</code>
        </div>
      )}

      {/* Source Code */}
      {page.source && page.source.trim() && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-3.5 h-3.5 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"/>
            </svg>
            <h2 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">Source Code</h2>
          </div>
          <CodeBlock code={page.source} language={page.language} startLine={page.start_line || 1} />
        </div>
      )}

      {/* Calls */}
      {page.type === 'function' && page.calls && page.calls.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/>
            </svg>
            <h2 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
              Calls ({page.calls.length})
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {page.calls.filter(c => c.name).map((call, i) => (
              <CallBadge key={i} call={call} onSelect={onSelect} type="calls" />
            ))}
          </div>
        </div>
      )}

      {/* Called By */}
      {page.type === 'function' && page.called_by && page.called_by.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>
            </svg>
            <h2 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
              Called By ({page.called_by.length})
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {page.called_by.filter(c => c.name).map((caller, i) => (
              <CallBadge key={i} call={caller} onSelect={onSelect} type="called_by" />
            ))}
          </div>
        </div>
      )}

      {/* File symbols */}
      {page.type === 'file' && page.symbols && page.symbols.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-3.5 h-3.5 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/>
            </svg>
            <h2 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
              Symbols ({page.symbols.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {page.symbols.map((sym, i) => (
              <button
                key={i}
                onClick={() => onSelect(sym.kind === 'class' ? 'class' : 'function', sym.name, page.path || '')}
                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors border border-transparent hover:border-stone-200 dark:hover:border-stone-700"
              >
                {sym.kind === 'class' ? (
                  <svg className="w-3 h-3 text-violet-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l5.5 9.5L12 21 6.5 11.5z"/></svg>
                ) : sym.kind === 'method' ? (
                  <svg className="w-3 h-3 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
                ) : (
                  <svg className="w-3 h-3 text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                )}
                <span className="text-[10px] text-stone-400 dark:text-stone-500 uppercase w-14 flex-shrink-0">{sym.kind}</span>
                <span className="text-sm text-stone-700 dark:text-stone-200 font-mono truncate">{sym.name}</span>
                {sym.start_line && (
                  <span className="text-[10px] text-stone-300 dark:text-stone-600 ml-auto flex-shrink-0">L{sym.start_line}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Imports */}
      {page.type === 'file' && page.imports && page.imports.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-3.5 h-3.5 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
            </svg>
            <h2 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
              Imports ({page.imports.length})
            </h2>
          </div>
          <div className="space-y-0.5">
            {page.imports.map((imp, i) => (
              <div key={i} className="text-xs text-stone-500 dark:text-stone-400 font-mono px-3 py-1 rounded hover:bg-stone-50 dark:hover:bg-stone-800/50">
                {imp}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Class methods */}
      {page.type === 'class' && page.methods && page.methods.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">
            Methods ({page.methods.length})
          </h2>
          <div className="grid grid-cols-1 gap-1">
            {page.methods.map((method, i) => (
              <button
                key={i}
                onClick={() => onSelect('function', method.name, page.file_path || '')}
                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors border border-transparent hover:border-stone-200 dark:hover:border-stone-700"
              >
                <svg className="w-3 h-3 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
                <span className="text-sm text-stone-700 dark:text-stone-200 font-mono">{method.name}</span>
                {method.start_line && (
                  <span className="text-[10px] text-stone-300 dark:text-stone-600 ml-auto">L{method.start_line}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Call Graph Modal */}
      {showGraph && page.file_path && (
        <CallGraphModal
          name={page.name || ''}
          filePath={page.file_path}
          repo={repo || ''}
          onSelect={onSelect}
          onClose={() => setShowGraph(false)}
        />
      )}

      {/* File Graph Modal */}
      {showFileGraph && page.path && (
        <FileGraphModal
          filePath={page.path}
          repo={repo || ''}
          onSelect={onSelect}
          onClose={() => setShowFileGraph(false)}
        />
      )}

      {/* Class extends/implements */}
      {page.type === 'class' && (
        <div className="flex flex-wrap gap-3">
          {page.extends && page.extends.length > 0 && (
            <div>
              <h2 className="text-[10px] text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Extends</h2>
              <div className="flex flex-wrap gap-1.5">
                {page.extends.map((ext, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-mono">
                    {ext}
                  </span>
                ))}
              </div>
            </div>
          )}
          {page.implements && page.implements.length > 0 && (
            <div>
              <h2 className="text-[10px] text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Implements</h2>
              <div className="flex flex-wrap gap-1.5">
                {page.implements.map((iface, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-mono">
                    {iface}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
