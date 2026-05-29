import { useState, useEffect, useCallback, useRef } from 'react'
import { useChatStore } from './hooks/useChatStore'
import SearchBar from './components/SearchBar'
import ChatMessage from './components/ChatMessage'
import CitationsPanel from './components/CitationsPanel'
import ChatSidebar from './components/ChatSidebar'
import RepositoriesPage from './components/RepositoriesPage'
import AddRepoView from './components/AddRepoView'
import ThemeToggle from './components/ThemeToggle'

function App() {
  const {
    messages, status, progress, expandedQueries, searchedFiles, error,
    sessions, currentId, selectedRepo, tab,
    search, switchSession, newChat, deleteSession, setTab, dispatch,
  } = useChatStore()
  const [scrolled, setScrolled] = useState(false)
  const [repos, setRepos] = useState<string[]>([])
  const [showAddRepo, setShowAddRepo] = useState(false)
  const [showSources, setShowSources] = useState(() => localStorage.getItem('manthan-sources') !== 'false')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const isStreaming = status === 'loading' || status === 'streaming'

  useEffect(() => { localStorage.setItem('manthan-sources', String(showSources)) }, [showSources])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    fetch('/api/repos')
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() })
      .then(d => { if (d.repos) setRepos(d.repos) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'n') { e.preventDefault(); newChat() }
      else if (mod && e.key === '1') { e.preventDefault(); setShowAddRepo(false); setTab('search') }
      else if (mod && e.key === '2') { e.preventDefault(); setShowAddRepo(false); setTab('repos') }
      else if (e.key === 'Escape' && showSources) { setShowSources(false) }
      else if (e.key === '?' && !mod) { e.preventDefault(); setShowShortcuts(s => !s) }
      else if (mod && e.key === 'b') { e.preventDefault(); setSidebarOpen(s => !s) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [newChat, setTab, showSources, setSidebarOpen])

  const handleSearch = useCallback((q: string) => {
    search(q, selectedRepo)
    setTab('search')
  }, [search, selectedRepo, setTab])

  const handleSelectRepo = useCallback(async (repo: string) => {
    await newChat(repo)
    dispatch({ type: 'SELECT_REPO', repo })
    setTab('search')
  }, [newChat, dispatch, setTab])

  const handleCloseAddRepo = useCallback(() => {
    setShowAddRepo(false)
    fetch('/api/repos')
      .then(r => r.json())
      .then(d => { if (d.repos) setRepos(d.repos) })
      .catch(() => {})
  }, [])

  const chatHasContent = messages.length > 0

  const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant')

  return (
    <div className="h-screen flex overflow-hidden bg-[#f6f5f2] dark:bg-[#08080c]">
      {sidebarOpen && (
        <ChatSidebar
          sessions={sessions}
          currentId={currentId}
          onSwitch={(id) => { switchSession(id); setTab('search') }}
          onCreate={newChat}
          onDelete={deleteSession}
        />
      )}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${showSources && tab === 'search' && lastAssistantMessage?.citations?.length ? 'mr-80' : ''}`}>
        <header className={`sticky top-0 z-10 bg-[#f6f5f2] dark:bg-[#08080c] border-b transition-all duration-200 ${
          scrolled ? 'border-stone-200/70 dark:border-stone-800/70' : 'border-transparent'
        }`}>
          <div className="flex items-center justify-between px-5 h-14">
            <div className="flex items-center gap-1">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-1.5 mr-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-all active:scale-90"
                  title="Open sidebar (Cmd+B)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                </button>
              )}
              {(['search', 'repos'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { if (t !== tab) { setShowAddRepo(false); setTab(t) } }}
                  className={`text-sm font-medium px-3.5 py-1.5 rounded-lg transition-all capitalize ${
                    tab === t
                      ? 'text-stone-700 dark:text-stone-200 bg-stone-100 dark:bg-stone-800'
                      : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300'
                  }`}
                >
                  {t === 'search' ? (messages.length > 0 ? 'Chat' : 'Search') : 'Repos'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {tab === 'search' && selectedRepo && (
                <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800/50">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 0 1-1.125-1.125v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z" />
                  </svg>
                  {selectedRepo}
                </span>
              )}
              <ThemeToggle />
            </div>
          </div>
        </header>

        <div className="flex-1 flex min-h-0 relative">
          <main className={`flex-1 flex flex-col w-full min-h-0 ${!chatHasContent && tab === 'search' ? 'items-center' : ''} px-5`}>
            {showAddRepo && (
              <AddRepoView onBack={handleCloseAddRepo} />
            )}

            {tab === 'repos' && !showAddRepo && (
              <RepositoriesPage
                repos={repos}
                onAddRepo={() => setShowAddRepo(true)}
                onSelectRepo={handleSelectRepo}
              />
            )}

            {tab === 'search' && !chatHasContent && !showAddRepo && (
              <div className="flex-1 flex items-center justify-center w-full max-w-2xl">
                <div className="w-full text-center">
                  <p className="text-sm text-stone-400 dark:text-stone-500 mb-1">
                    {selectedRepo
                      ? `Ask anything about ${selectedRepo}`
                      : 'Ask anything about your codebase'}
                  </p>
                  <p className="text-xs text-stone-300 dark:text-stone-600 mb-6">Type a question below to get started</p>
                  <SearchBar onSearch={handleSearch} isStreaming={isStreaming} />
                </div>
              </div>
            )}

            {tab === 'search' && chatHasContent && !showAddRepo && (
              <div className="flex-1 flex flex-col w-full max-w-3xl xl:max-w-4xl 2xl:max-w-5xl mx-auto min-h-0">
                <div className="flex-1 overflow-y-auto space-y-3 py-4 min-h-0">
                  {messages.map((msg, i) => (
                    <div key={msg.id} className="animate-slide-up" style={{ animationDelay: `${i * 0.05}s` }}>
                      <ChatMessage message={msg} />
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {(isStreaming || progress) && (
                  <div className="mb-2 flex-shrink-0 animate-scale-in">
                    <div className="flex items-center gap-2.5 mb-2 px-1">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-stone-400 dark:bg-stone-500 animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-stone-400 dark:bg-stone-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-stone-400 dark:bg-stone-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs text-stone-400 dark:text-stone-500">{progress}</span>
                    </div>
                    {expandedQueries.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2 px-1">
                        <span className="text-[10px] text-stone-300 dark:text-stone-600 font-medium uppercase tracking-wider self-center">Queries:</span>
                        {expandedQueries.map((q, i) => (
                          <span key={i} className="animate-slide-up-sm px-2 py-0.5 rounded-md bg-stone-100/80 dark:bg-stone-800/30 text-[11px] text-stone-400 dark:text-stone-500 border border-stone-150 dark:border-stone-700/50 truncate max-w-[300px]" style={{ animationDelay: `${i * 0.05}s` }}>
                            {q}
                          </span>
                        ))}
                      </div>
                    )}
                    {searchedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1 px-1">
                        {searchedFiles.map((file, i) => (
                          <span key={file} className="animate-slide-up-sm px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800/50 text-[11px] text-stone-400 dark:text-stone-500 font-mono truncate max-w-[240px]" style={{ animationDelay: `${i * 0.05}s` }}>
                            {file}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="pb-4 flex-shrink-0">
                  <SearchBar onSearch={handleSearch} isStreaming={isStreaming} />
                </div>
              </div>
            )}

            {error && (
              <div className="w-full max-w-3xl xl:max-w-4xl 2xl:max-w-5xl mx-auto px-4 py-2.5 mb-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl text-sm border border-red-100 dark:border-red-900/30 animate-slide-up-sm">
                {error}
              </div>
            )}
          </main>
        </div>

        {tab === 'repos' && !showAddRepo && (
          <footer className="pb-6 text-center">
            <p className="text-[11px] text-stone-300 dark:text-stone-700">Powered by LLMs &middot; Your code stays local</p>
          </footer>
        )}
      </div>

      {tab === 'search' && lastAssistantMessage?.citations && lastAssistantMessage.citations.length > 0 && !lastAssistantMessage.isStreaming && (
        <aside className={`hidden lg:flex flex-col fixed top-14 right-0 bg-stone-50/80 dark:bg-stone-900/50 border-l border-stone-150 dark:border-stone-800 rounded-l-xl overflow-hidden transition-all duration-300 ease-in-out z-20 ${showSources ? 'w-80' : 'w-0 border-l-0'}`} style={{ height: 'calc(100vh - 56px)' }}>
          <div className="flex-1 w-full flex flex-col min-h-0">
            <div className="px-4 h-12 border-b border-stone-150 dark:border-stone-800 flex items-center gap-2 bg-stone-100/50 dark:bg-stone-800/30 flex-shrink-0">
              <span className="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-widest">Sources</span>
              <span className="text-[11px] text-stone-300 dark:text-stone-600 font-mono bg-stone-200/60 dark:bg-stone-700/60 px-1.5 py-0.5 rounded">{lastAssistantMessage.citations.length}</span>
              <button
                onClick={() => setShowSources(false)}
                className="ml-auto p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                title="Close sources"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <CitationsPanel citations={lastAssistantMessage.citations} />
            </div>
          </div>
        </aside>
      )}
      {!showSources && tab === 'search' && lastAssistantMessage?.citations && lastAssistantMessage.citations.length > 0 && !lastAssistantMessage.isStreaming && (
        <button
          onClick={() => setShowSources(true)}
          className="hidden lg:flex fixed top-14 right-0 z-20 items-center gap-1 px-2 py-3 text-xs font-medium text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 bg-stone-50/80 dark:bg-stone-900/50 border border-l-0 border-stone-150 dark:border-stone-800 rounded-r-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-all hover:pr-3 active:scale-95 animate-fade-in"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="[writing-mode:vertical-lr] tracking-widest uppercase text-[10px]">Sources</span>
        </button>
      )}

      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowShortcuts(false)}>
          <div className="absolute inset-0 bg-black/20 dark:bg-black/40" />
          <div className="relative bg-white dark:bg-stone-800 rounded-xl border border-stone-150 dark:border-stone-700 shadow-sharp-xl p-6 w-80 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="p-0.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              {[
                { keys: '⌘K', label: 'Focus search' },
                { keys: '⌘B', label: 'Toggle sidebar' },
                { keys: '⌘N', label: 'New chat' },
                { keys: '⌘1', label: 'Search tab' },
                { keys: '⌘2', label: 'Repos tab' },
                { keys: 'Esc', label: 'Close sources' },
                { keys: '?', label: 'Toggle shortcuts' },
              ].map(sc => (
                <div key={sc.keys} className="flex items-center justify-between text-xs">
                  <span className="text-stone-500 dark:text-stone-400">{sc.label}</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-700 text-stone-400 dark:text-stone-500 font-mono text-[10px] border border-stone-200 dark:border-stone-600">{sc.keys}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
