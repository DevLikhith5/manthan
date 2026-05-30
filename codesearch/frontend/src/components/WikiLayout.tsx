import { useState } from 'react'
import WikiTree from './WikiTree'
import WikiPage from './WikiPage'
import WikiSearch from './WikiSearch'
import RepoGraphModal from './RepoGraphModal'
import { useWiki } from '../hooks/useWiki'

interface Props {
  repo: string
}

export default function WikiLayout({ repo }: Props) {
  const { tree, currentPage, searchResults, loading, selectPage, searchWiki, setCurrentPage } = useWiki(repo)
  const [showTree, setShowTree] = useState(true)
  const [showRepoGraph, setShowRepoGraph] = useState(false)

  return (
    <div className="flex h-full">
      {showTree && (
        <div className="w-64 border-r border-stone-150 dark:border-stone-800 flex-shrink-0 overflow-hidden">
          <WikiTree tree={tree} onSelect={selectPage} />
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-150 dark:border-stone-800 flex items-center gap-3">
          <button
            onClick={() => setShowTree(s => !s)}
            className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
            title="Toggle file tree"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <button
            onClick={() => setShowRepoGraph(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-700 transition-colors"
            title="View full repo graph"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h8v8H3V3zM13 3h8v8h-8V3zM3 13h8v8H3v-8zM13 13h8v8h-8v-8z" />
            </svg>
            Repo Graph
          </button>
          <div className="flex-1">
            <WikiSearch results={searchResults} onSelect={selectPage} onSearch={searchWiki} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-stone-400 dark:bg-stone-500 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-stone-400 dark:bg-stone-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-stone-400 dark:bg-stone-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          ) : currentPage ? (
            <WikiPage page={currentPage} onSelect={selectPage} onBack={() => setCurrentPage(null)} repo={repo} />
          ) : (
            <div className="flex items-center justify-center h-64 text-stone-400 dark:text-stone-500 text-sm">
              Select a file or symbol from the tree
            </div>
          )}
        </div>
      </div>
      {showRepoGraph && (
        <RepoGraphModal
          repo={repo}
          onSelect={selectPage}
          onClose={() => setShowRepoGraph(false)}
        />
      )}
    </div>
  )
}
