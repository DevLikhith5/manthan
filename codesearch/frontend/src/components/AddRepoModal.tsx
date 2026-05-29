import { useState, useRef, useEffect } from 'react'

export default function AddRepoModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || busy) return

    setBusy(true)
    setError(null)

    try {
      const resp = await fetch('/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ git_url: url.trim() }),
      })

      if (!resp.ok) {
        let msg = 'Failed'
        try { const err = await resp.json(); msg = err.detail || msg }
        catch { msg = resp.statusText || msg }
        throw new Error(msg)
      }

      const { task_id } = await resp.json()

      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const s = await (await fetch(`/ingest/${task_id}`)).json()
        if (s.status === 'ok') { onClose(); return }
        if (s.status === 'failed') throw new Error(s.error || 'Indexing failed')
      }
      throw new Error('Timed out')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/15 dark:bg-black/40 backdrop-blur-sm animate-scale-in">
      <div className="w-full max-w-sm mx-4 bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-stone-700 dark:text-stone-200">Add repository</h3>
          <button onClick={onClose} disabled={busy} className="p-1 rounded-lg text-stone-300 hover:text-stone-500 dark:hover:text-stone-300 disabled:opacity-30 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
            disabled={busy}
            className="w-full px-3 py-2 text-xs rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700/70 text-stone-700 dark:text-stone-200 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600 transition-all disabled:opacity-40 mb-4"
          />

          {busy && (
            <div className="flex items-center gap-2 mb-4 text-xs text-stone-400 dark:text-stone-500">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" />
              Indexing...
            </div>
          )}

          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl text-xs border border-red-100 dark:border-red-900/30">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} disabled={busy} className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30">
              Cancel
            </button>
            <button type="submit" disabled={!url.trim() || busy} className="text-xs px-4 py-1.5 rounded-xl bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 font-medium hover:bg-stone-700 dark:hover:bg-stone-200 disabled:opacity-30 transition-all active:scale-[0.97]">
              {busy ? 'Indexing...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
