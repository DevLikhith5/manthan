import { useState, useRef, useEffect } from 'react'
import { ArrowLeftIcon } from './Icons'

const STEPS = [
  { key: 'start', label: 'Start' },
  { key: 'clone', label: 'Clone' },
  { key: 'index', label: 'Index' },
  { key: 'done', label: 'Done' },
]

export default function AddRepoView({ onBack }: { onBack: () => void }) {
  const [url, setUrl] = useState('')
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || busy) return

    setBusy(true)
    setError(null)
    setLogs([])
    setStep(1)

    try {
      const resp = await fetch('/api/ingest', {
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
      setStep(2)

      const es = new EventSource(`/api/ingest/${task_id}/logs/stream`)
      let done = false
      await new Promise<void>((resolve, reject) => {
        es.onmessage = (ev) => {
          const d = JSON.parse(ev.data)
          if (d.line) {
            setLogs(prev => [...prev, d.line])
            if (d.line.includes('Starting indexer')) setStep(2)
          }
          if (d.done) {
            done = true
            es.close()
            if (d.status === 'ok') { setStep(3); setTimeout(onBack, 1500); resolve() }
            else { reject(new Error(d.status === 'not_found' ? 'Task not found' : 'Indexing failed')) }
          }
        }
        es.onerror = () => {
          if (done) return
          es.close()
          reject(new Error('Connection lost'))
        }
      })
    } catch (err) {
      setError((err as Error).message)
      setStep(0)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto max-w-3xl mx-auto w-full py-10 px-4 animate-slide-up">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors mb-8">
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Back to repos
      </button>

      <div className="mb-8">
        <h2 className="text-base font-medium text-stone-700 dark:text-stone-200">Add repository</h2>
        <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">Paste a GitHub URL to index a codebase</p>
      </div>

      <form onSubmit={handleSubmit} className="mb-10">
        <input
          ref={inputRef}
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://github.com/user/repo"
          disabled={busy}
          className="w-full px-4 py-3 text-sm rounded-xl bg-white dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700/70 text-stone-700 dark:text-stone-200 placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600 transition-all disabled:opacity-40 mb-4"
        />
        <button
          type="submit"
          disabled={!url.trim() || busy}
          className="w-full py-2.5 text-sm rounded-xl bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 font-medium hover:bg-stone-700 dark:hover:bg-stone-200 disabled:opacity-30 transition-all active:scale-[0.99]"
        >
          {busy ? 'Indexing...' : 'Index repository'}
        </button>
      </form>

      {error && (
        <div className="mb-8 px-4 py-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl text-sm border border-red-100 dark:border-red-900/30 animate-slide-up-sm">
          {error}
        </div>
      )}

      {busy && (
        <div className="space-y-6 animate-slide-up-sm">
          <div className="h-1.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-stone-800 dark:bg-stone-300 transition-all duration-700 ease-out"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>

          <div className="flex justify-between">
            {STEPS.map((s, i) => {
              const cs = i < step ? 'done' : i === step ? 'current' : 'pending'
              return (
                <div key={s.key} className="flex flex-col items-center gap-2">
                  <div className={`
                    w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300
                    ${cs === 'done' ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900' : ''}
                    ${cs === 'current' ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 ring-4 ring-stone-300 dark:ring-stone-600 scale-110' : ''}
                    ${cs === 'pending' ? 'bg-stone-100 dark:bg-stone-800 text-stone-300 dark:text-stone-600 border-2 border-dashed border-stone-200 dark:border-stone-700' : ''}
                  `}>
                    {cs === 'done' ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : cs === 'current' ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <p className={`text-xs font-semibold ${cs === 'pending' ? 'text-stone-300 dark:text-stone-600' : 'text-stone-600 dark:text-stone-300'}`}>
                    {s.label}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="rounded-xl bg-stone-900 dark:bg-black border border-stone-700/50 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-stone-800/50 border-b border-stone-700/50">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
              <span className="text-[11px] text-stone-400 font-medium ml-1">logs</span>
            </div>
            <div className="h-64 overflow-y-auto p-4 font-mono text-xs leading-relaxed" style={{ fontFamily: "'SF Mono', SFMono-Regular, ui-monospace, Consolas, monospace" }}>
              {logs.length === 0 ? (
                <span className="text-stone-600">Waiting for output...</span>
              ) : (
                logs.map((line, i) => (
                  <div key={i} className={`${line.startsWith('ERROR') ? 'text-red-400' : line.startsWith('Done') ? 'text-green-400' : 'text-stone-400'}`}>
                    <span className="text-stone-600 mr-3">{String(i + 1).padStart(3, '0')}</span>
                    {line}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

          {step === 3 && (
            <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 animate-scale-in text-center">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Repository indexed successfully</p>
              <p className="text-xs text-emerald-500 dark:text-emerald-500 mt-1">Redirecting to repos...</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
