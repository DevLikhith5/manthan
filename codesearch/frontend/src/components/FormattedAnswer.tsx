import type { Citation } from '../domain/types'
import { useState } from 'react'

function openInVsCode(file: string, line: number) {
  window.open(`vscode://file/${file}:${line}`, '_blank')
}

interface FormattedAnswerProps {
  text: string
  citations: Citation[]
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)

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
  return (
    <code className="px-1 py-0.5 rounded text-[13px] bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 font-['SF_Mono',SFMono-Regular,ui-monospace,monospace]">
      {children}
    </code>
  )
}

function CitationLink({ citation, lineStr, children }: { citation: Citation; lineStr: string; children: React.ReactNode }) {
  return (
    <a
      href={`vscode://file/${citation.file}:${lineStr}`}
      onClick={(e) => { e.preventDefault(); openInVsCode(citation.file, parseInt(lineStr)) }}
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

    // Code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trim().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      elements.push(<CodeBlock key={`cb-${i}`} code={codeLines.join('\n')} language={lang || undefined} />)
      continue
    }

    // Empty line = paragraph break
    if (line.trim() === '') {
      i++
      continue
    }

    // Strip markdown list markers: "- ", "* ", "+ ", "1. ", "123. " etc
    const cleaned = line.replace(/^#{1,6}\s+/, '').replace(/^>\s+/, '  ').replace(/^[*-+]\s+/, '• ').replace(/^\d+\.\s+/, '  ')

    // Render a paragraph with inline formatting
    const parts: React.ReactNode[] = []
    const inlineRegex = /(`[^`]+`)|(\*([^*]+)\*)|(\*\*([^*]+)\*\*)|\[([^\]]+?):(\d+)(?:-\d+)?\]/g
    let lastIdx = 0
    let m: RegExpExecArray | null

    while ((m = inlineRegex.exec(cleaned)) !== null) {
      const mm = m
      if (mm.index > lastIdx) {
        parts.push(cleaned.slice(lastIdx, mm.index))
      }

      if (mm[1]) {
        parts.push(<InlineCode key={`c-${i}-${mm.index}`}>{mm[1].slice(1, -1)}</InlineCode>)
      } else if (mm[3]) {
        parts.push(<em key={`i-${i}-${mm.index}`} className="italic text-lime-700 dark:text-lime-400">{mm[3]}</em>)
      } else if (mm[5]) {
        parts.push(<strong key={`b-${i}-${mm.index}`} className="font-semibold text-lime-900 dark:text-lime-200">{mm[5]}</strong>)
      } else if (mm[6]) {
        const citation = citations.find(c => c.path === mm[6])
        if (citation) {
          parts.push(<CitationLink key={`cit-${i}-${mm.index}`} citation={citation} lineStr={mm[7]}>{mm[0]}</CitationLink>)
        } else {
          parts.push(mm[0])
        }
      }

      lastIdx = mm.index + mm[0].length
    }

    if (lastIdx < cleaned.length) {
      parts.push(cleaned.slice(lastIdx))
    }

    elements.push(
      <p key={`p-${i}`} className="mb-4 last:mb-0 text-[15px] leading-[1.75] text-stone-700 dark:text-stone-300 font-[420]">
        {parts}
      </p>,
    )

    i++
  }

  return (
    <div className="space-y-1 text-[13px] font-['SF_Mono',SFMono-Regular,ui-monospace,monospace] leading-relaxed">
      {elements}
    </div>
  )
}
