import type { Citation } from '../domain/types'
import { useState, useEffect, useRef } from 'react'
import mermaid from 'mermaid'

type FormattedAnswerProps = {
  text: string
  citations: Citation[]
}

mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  fontSize: 14,
  securityLevel: 'loose',
  flowchart: { curve: 'basis', padding: 20 },
  sequence: { actorMargin: 50, showSequenceNumbers: false },
  gantt: { topPadding: 50, leftPadding: 120 },
})

let mermaidIdCounter = 0

function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)
  const idRef = useRef(`mermaid-${++mermaidIdCounter}`)

  useEffect(() => {
    if (!code.trim() || !containerRef.current) return
    setError(false)

    const timer = setTimeout(async () => {
      try {
        const id = idRef.current
        if (!containerRef.current) return
        await mermaid.parse(code)
        containerRef.current.innerHTML = `<pre id="${id}" class="mermaid">${code}</pre>`
        await mermaid.run({ nodes: containerRef.current.querySelectorAll('.mermaid') })
      } catch (e) {
        console.error('Mermaid render error:', e)
        if (containerRef.current) containerRef.current.innerHTML = ''
        setError(true)
      }
    }, 50)

    return () => clearTimeout(timer)
  }, [code])

  if (error) {
    return (
      <div className="my-3 rounded-xl overflow-hidden border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <div className="px-4 py-2 bg-red-100 dark:bg-red-900/50 border-b border-red-200 dark:border-red-800">
          <span className="text-[11px] text-red-600 dark:text-red-400 font-medium">Diagram rendering failed</span>
        </div>
        <pre className="p-4 overflow-x-auto text-[13px] text-red-700 dark:text-red-300 font-mono">{code}</pre>
      </div>
    )
  }

  return (
    <div className="my-4 rounded-xl overflow-hidden bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
      <div className="flex items-center justify-between px-4 py-1.5 bg-stone-100 dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800">
        <span className="text-[11px] text-stone-400 dark:text-stone-500 font-medium">Diagram</span>
        <span className="text-[11px] text-stone-400 dark:text-stone-500">mermaid</span>
      </div>
      <div ref={containerRef} className="p-4 overflow-x-auto" />
    </div>
  )
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  if (language === 'mermaid') return <MermaidBlock code={code} />

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
      <div className="flex items-center justify-between px-4 py-1.5 bg-stone-100 dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800">
        <span className="text-[11px] text-stone-400 dark:text-stone-500 font-medium">{language || 'code'}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
          className="text-[11px] text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed text-stone-700 dark:text-stone-300 font-['SF_Mono',SFMono-Regular,ui-monospace,monospace]">{code}</pre>
    </div>
  )
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return <code className="px-1 py-0.5 rounded text-[13px] bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 font-['SF_Mono',SFMono-Regular,ui-monospace,monospace]">{children}</code>
}

function getVsCodeCitationUrl(citation: Citation, line: number) {
  const file = citation.path || citation.file
  if (!file) return '#'
  return file.startsWith('vscode://') ? file : `vscode://file/${encodeURI(file)}:${line}`
}

function CitationLink({ citation, lineStr, children }: { citation: Citation; lineStr: string; children: React.ReactNode }) {
  const file = citation.path || citation.file
  const line = parseInt(lineStr, 10)
  const href = file ? getVsCodeCitationUrl(citation, line) : '#'

  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-lime-700 dark:text-lime-400 border-b border-lime-300/40 dark:border-lime-700/40 hover:border-lime-500 dark:hover:border-lime-400 transition-colors cursor-pointer font-medium no-underline"
    >
      {children}
    </a>
  )
}

export default function FormattedAnswer({ text, citations }: FormattedAnswerProps) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trimStart().startsWith('```')) {
      const lang = line.trim().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++
      elements.push(<CodeBlock key={`cb-${i}`} code={codeLines.join('\n')} language={lang || undefined} />)
      continue
    }

    if (line.trim() === '') { i++; continue }

    const cleaned = line.replace(/^#{1,6}\s+/, '').replace(/^>\s+/, '  ').replace(/^[*-+]\s+/, '• ').replace(/^\d+\.\s+/, '  ')

    const srcMatch = cleaned.match(/^Source\s+(\d+):\s+(.+?)\s+\(lines\s+(\d+)-(\d+)\):(.*)$/i)
    if (srcMatch) {
      const idx = parseInt(srcMatch[1], 10) - 1
      const byIndex = citations[idx]
      const byPath = citations.find(c => c.path === srcMatch[2] || c.file.endsWith(srcMatch[2]))
      const citation = byIndex || byPath
      const lineNum = srcMatch[3]
      const tail = srcMatch[5]
      const label = `Source ${srcMatch[1]}: ${srcMatch[2]} (lines ${srcMatch[3]}-${srcMatch[4]})`
      elements.push(
        <p key={`p-${i}`} className="mb-4 last:mb-0 text-[15px] leading-[1.75] text-stone-700 dark:text-stone-300 font-[420]">
          {citation ? <CitationLink citation={citation} lineStr={lineNum}>{label}</CitationLink> : label}
          {tail}
        </p>,
      )
      i++
      continue
    }

    const parts: React.ReactNode[] = []
    const inlineRegex = /(`[^`]+`)|(\*([^*]+)\*)|(\*\*([^*]+)\*\*)|\[([^\]]+?):(\d+)(?:-\d+)?\]/g
    let lastIdx = 0
    let m: RegExpExecArray | null

    while ((m = inlineRegex.exec(cleaned)) !== null) {
      const mm = m
      if (mm.index > lastIdx) parts.push(cleaned.slice(lastIdx, mm.index))

      if (mm[1]) parts.push(<InlineCode key={`c-${i}-${mm.index}`}>{mm[1].slice(1, -1)}</InlineCode>)
      else if (mm[3]) parts.push(<em key={`i-${i}-${mm.index}`} className="italic text-lime-700 dark:text-lime-400">{mm[3]}</em>)
      else if (mm[5]) parts.push(<strong key={`b-${i}-${mm.index}`} className="font-semibold text-lime-900 dark:text-lime-200">{mm[5]}</strong>)
      else if (mm[6]) {
        const citation = citations.find(c => c.path === mm[6] || c.file.endsWith(mm[6]))
        if (citation) parts.push(<CitationLink key={`cit-${i}-${mm.index}`} citation={citation} lineStr={mm[7]}>{mm[0]}</CitationLink>)
        else parts.push(mm[0])
      }

      lastIdx = mm.index + mm[0].length
    }

    if (lastIdx < cleaned.length) parts.push(cleaned.slice(lastIdx))

    elements.push(
      <p key={`p-${i}`} className="mb-4 last:mb-0 text-[15px] leading-[1.75] text-stone-700 dark:text-stone-300 font-[420]">{parts}</p>,
    )

    i++
  }

  return <div className="space-y-1 text-[13px] font-['SF_Mono',SFMono-Regular,ui-monospace,monospace] leading-relaxed">{elements}</div>
}
