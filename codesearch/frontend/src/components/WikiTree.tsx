import { useState, useMemo } from 'react'
import type { WikiTreeNode } from '../domain/types'

interface Props {
  tree: WikiTreeNode[]
  onSelect: (entityType: string, name: string, filePath: string) => void
}

function fileIcon(lang: string, name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const cls = 'w-3.5 h-3.5 flex-shrink-0'

  if (ext === 'go' || lang === 'go') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#00ADD8" fillOpacity="0.15" stroke="#00ADD8" strokeWidth="1.2"/>
        <text x="12" y="16" textAnchor="middle" fill="#00ADD8" fontSize="10" fontWeight="700" fontFamily="monospace">go</text>
      </svg>
    )
  }
  if (ext === 'py' || lang === 'python') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#3776AB" fillOpacity="0.15" stroke="#3776AB" strokeWidth="1.2"/>
        <text x="12" y="16" textAnchor="middle" fill="#3776AB" fontSize="10" fontWeight="700" fontFamily="monospace">py</text>
      </svg>
    )
  }
  if (ext === 'ts' || ext === 'tsx' || lang === 'typescript') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#3178C6" fillOpacity="0.15" stroke="#3178C6" strokeWidth="1.2"/>
        <text x="12" y="16" textAnchor="middle" fill="#3178C6" fontSize="10" fontWeight="700" fontFamily="monospace">ts</text>
      </svg>
    )
  }
  if (ext === 'js' || ext === 'jsx' || lang === 'javascript') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#F7DF1E" fillOpacity="0.2" stroke="#C8A500" strokeWidth="1.2"/>
        <text x="12" y="16" textAnchor="middle" fill="#9E7A00" fontSize="10" fontWeight="700" fontFamily="monospace">js</text>
      </svg>
    )
  }
  if (ext === 'md' || ext === 'mdx') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#6B7280" fillOpacity="0.12" stroke="#6B7280" strokeWidth="1.2"/>
        <path d="M6 16V8h2.5l1.5 2.5L11.5 8H14v8h-2v-5l-1.5 2.5L9 11v5H6z" fill="#6B7280" fillOpacity="0.6"/>
      </svg>
    )
  }
  if (ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'toml') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#F59E0B" fillOpacity="0.12" stroke="#F59E0B" strokeWidth="1.2"/>
        <text x="12" y="16" textAnchor="middle" fill="#D97706" fontSize="8" fontWeight="700" fontFamily="monospace">{ext}</text>
      </svg>
    )
  }
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#4ADE80" fillOpacity="0.12" stroke="#16A34A" strokeWidth="1.2"/>
        <text x="12" y="16" textAnchor="middle" fill="#16A34A" fontSize="9" fontWeight="700" fontFamily="monospace">$</text>
      </svg>
    )
  }
  if (ext === 'sql' || ext === 'proto') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#8B5CF6" fillOpacity="0.12" stroke="#8B5CF6" strokeWidth="1.2"/>
        <text x="12" y="16" textAnchor="middle" fill="#7C3AED" fontSize="9" fontWeight="700" fontFamily="monospace">{ext}</text>
      </svg>
    )
  }
  if (ext === 'test' || ext === 'spec' || name.includes('_test')) {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#EC4899" fillOpacity="0.12" stroke="#EC4899" strokeWidth="1.2"/>
        <path d="M8 8l2 4-2 4M12 16h4" stroke="#EC4899" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  if (ext === 'docker' || ext === 'dockerfile' || name === 'Dockerfile') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#2496ED" fillOpacity="0.12" stroke="#2496ED" strokeWidth="1.2"/>
        <rect x="7" y="10" width="3" height="3" rx="0.5" fill="#2496ED" fillOpacity="0.5" stroke="#2496ED" strokeWidth="0.7"/>
        <rect x="11" y="10" width="3" height="3" rx="0.5" fill="#2496ED" fillOpacity="0.5" stroke="#2496ED" strokeWidth="0.7"/>
        <rect x="15" y="10" width="2.5" height="3" rx="0.5" fill="#2496ED" fillOpacity="0.5" stroke="#2496ED" strokeWidth="0.7"/>
        <rect x="5" y="14" width="14" height="2.5" rx="0.5" fill="#2496ED" fillOpacity="0.3" stroke="#2496ED" strokeWidth="0.7"/>
      </svg>
    )
  }
  if (ext === 'txt' || ext === 'log' || ext === 'csv') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#94A3B8" fillOpacity="0.12" stroke="#94A3B8" strokeWidth="1.2"/>
        <line x1="7" y1="8" x2="17" y2="8" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round"/>
        <line x1="7" y1="12" x2="14" y2="12" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round"/>
        <line x1="7" y1="16" x2="16" y2="16" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round"/>
      </svg>
    )
  }
  // Default file icon
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="2" width="16" height="20" rx="2.5" stroke="#94A3B8" strokeWidth="1.2" fill="#94A3B8" fillOpacity="0.06"/>
      <path d="M14 2v6h6" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="#94A3B8" fillOpacity="0.08"/>
    </svg>
  )
}

function dirIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
      <path d="M3 7V17a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" fill="#F59E0B" fillOpacity="0.2" stroke="#F59E0B" strokeWidth="1.2"/>
    </svg>
  )
}

function dirOpenIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
      <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" fill="#F59E0B" fillOpacity="0.3" stroke="#F59E0B" strokeWidth="1.2"/>
      <path d="M2 13h20" stroke="#F59E0B" strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
    </svg>
  )
}

export default function WikiTree({ tree, onSelect }: Props) {
  const [filter, setFilter] = useState('')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  const dirTree = useMemo(() => {
    const root: Record<string, any> = {}
    for (const item of tree) {
      const parts = item.path.split('/')
      let current = root
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = { _files: [], _dirs: {} }
        current = current[parts[i]]._dirs
      }
      if (!current._files) current._files = []
      current._files.push(item)
    }
    return root
  }, [tree])

  const filterLower = filter.toLowerCase()

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const renderNode = (node: Record<string, any>, path: string, depth: number) => {
    const dirs = Object.keys(node).filter(k => k !== '_files' && k !== '_dirs')
    const files = node._files || []

    const filteredFiles = files.filter((f: WikiTreeNode) =>
      !filter || f.path.toLowerCase().includes(filterLower)
    )

    if (dirs.length === 0 && filteredFiles.length === 0) return null

    return (
      <div key={path || 'root'}>
        {dirs.map(dir => {
          const dirPath = path ? `${path}/${dir}` : dir
          const isExpanded = expandedDirs.has(dirPath) || !!filter
          return (
            <div key={dirPath}>
              <button
                onClick={() => toggleDir(dirPath)}
                className="flex items-center gap-1.5 w-full text-left px-2 py-[3px] text-xs text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded transition-colors"
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
              >
                <svg className={`w-2.5 h-2.5 flex-shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                {isExpanded ? dirOpenIcon() : dirIcon()}
                <span className="truncate">{dir}</span>
              </button>
              {isExpanded && renderNode(node[dir]._dirs, dirPath, depth + 1)}
            </div>
          )
        })}
        {filteredFiles.map((file: WikiTreeNode) => {
          const fPath = file.path
          const fileName = fPath.split('/').pop() || fPath
          return (
            <div key={fPath}>
              <button
                onClick={() => onSelect('file', fileName, fPath)}
                className="flex items-center gap-1.5 w-full text-left px-2 py-[3px] text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded font-mono truncate transition-colors"
                style={{ paddingLeft: `${depth * 12 + 28}px` }}
              >
                {fileIcon(file.language, fileName)}
                <span className="truncate">{fileName}</span>
              </button>
              {file.symbols?.filter(s => s.kind === 'function' || s.kind === 'class' || s.kind === 'method').map(sym => (
                <button
                  key={`${file.path}:${sym.name}`}
                  onClick={() => onSelect(sym.kind === 'class' ? 'class' : 'function', sym.name, file.path)}
                  className="flex items-center gap-1.5 w-full text-left px-2 py-[2px] text-[11px] text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded truncate transition-colors"
                  style={{ paddingLeft: `${depth * 12 + 40}px` }}
                >
                  {sym.kind === 'class' ? (
                    <svg className="w-3 h-3 flex-shrink-0 text-violet-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l5.5 9.5L12 21 6.5 11.5z"/></svg>
                  ) : sym.kind === 'method' ? (
                    <svg className="w-3 h-3 flex-shrink-0 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
                  ) : (
                    <svg className="w-3 h-3 flex-shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  )}
                  <span className="truncate">{sym.name}</span>
                </button>
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-stone-150 dark:border-stone-800">
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter files..."
          className="w-full px-2.5 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-xs text-stone-600 dark:text-stone-300 placeholder:text-stone-400 dark:placeholder:text-stone-500 border-0 outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600"
        />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-stone-400 dark:text-stone-500">
            No files indexed
          </div>
        ) : (
          renderNode(dirTree, '', 0)
        )}
      </div>
    </div>
  )
}
