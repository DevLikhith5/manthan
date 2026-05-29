import { useState } from 'react'
import type { ChatSession } from '../domain/types'
import { XMarkIcon, MonogramM } from './Icons'

interface ChatSidebarProps {
  sessions: ChatSession[]
  currentId: string | null
  onSwitch: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
}

export default function ChatSidebar({ sessions, currentId, onSwitch, onCreate, onDelete }: ChatSidebarProps) {
  const [open, setOpen] = useState(false)
  const [menuSession, setMenuSession] = useState<string | null>(null)

  const sessionList = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-12 border-b border-stone-150 dark:border-stone-800">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-stone-800 dark:bg-white flex items-center justify-center">
            <MonogramM className="w-3 h-3 text-white dark:text-stone-900" />
          </div>
          <span className="text-base font-medium text-stone-700 dark:text-stone-200">Manthan</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="lg:hidden p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="px-2 pt-3 pb-2">
        <button
          onClick={() => { onCreate(); setOpen(false) }}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all active:scale-95"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-2 space-y-0.5">
        {[...sessions].reverse().map(session => (
          <div key={session.id} className="group relative">
            <button
              onClick={() => { onSwitch(session.id); setOpen(false) }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                session.id === currentId
                  ? 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200'
                  : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800/50'
              } hover:scale-[1.01] active:scale-[0.99]`}
            >
              <p className="truncate pr-6">{session.title}</p>
              <p className="text-xs text-stone-300 dark:text-stone-600 mt-0.5">
                {formatRelativeTime(session.updatedAt)}
              </p>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuSession(menuSession === session.id ? null : session.id) }}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 text-stone-300 hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400 transition-all hover:bg-stone-200/50 dark:hover:bg-stone-700/50 hover:scale-110 active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
              </svg>
            </button>
            {menuSession === session.id && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuSession(null)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-32 py-1 rounded-lg bg-white dark:bg-stone-800 border border-stone-150 dark:border-stone-700 shadow-sharp-lg animate-scale-in">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuSession(null); onDelete(session.id) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/20 dark:bg-black/40" />
        </div>
      )}

      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed bottom-4 left-4 z-30 w-10 h-10 rounded-xl bg-white dark:bg-stone-800 border border-stone-150 dark:border-stone-700 shadow-sharp-md flex items-center justify-center text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-all active:scale-90"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-stone-150 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 sticky top-0 h-screen">
        {sessionList}
      </aside>

      {/* Mobile drawer */}
      <aside className={`fixed top-0 left-0 z-50 h-full w-64 bg-white dark:bg-stone-850 border-r border-stone-150 dark:border-stone-750 shadow-sharp-xl transform transition-transform duration-200 lg:hidden ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {sessionList}
      </aside>
    </>
  )
}

function formatRelativeTime(ts: number): string {
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
