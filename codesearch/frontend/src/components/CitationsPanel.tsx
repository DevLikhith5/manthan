import { useState } from 'react'
import type { Citation } from '../domain/types'

interface CitationsPanelProps {
  citations: Citation[]
}

function getVsCodeUrl(citation: Citation, line: number) {
  const file = citation.path || citation.file
  if (!file) return '#'
  return file.startsWith('vscode://')
    ? file
    : `vscode://file/${encodeURI(file)}:${line}`
}

interface GraphData {
  nodes: { id: string; label: string; name: string; file_path?: string }[]
  edges: { from: string; to: string; type: string }[]
}

function MiniGraph({ data }: { data: GraphData }) {
  if (!data.nodes.length) return <div className="text-[10px] text-gray-500">No graph data</div>

  const W = 280
  const H = Math.max(120, data.nodes.length * 28 + 24)
  const nodeW = 96
  const nodeH = 22

  const layout = data.nodes.map((n, i) => ({
    ...n,
    x: 8 + (i % 2) * (nodeW + 16),
    y: 12 + Math.floor(i / 2) * (nodeH + 24),
  }))

  const posMap = new Map(layout.map(n => [n.id, n]))

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
      <div className="px-2 py-1 border-b border-gray-100 dark:border-gray-800 flex items-center gap-1.5">
        <span className="text-[10px] text-gray-400 dark:text-gray-500">Call Graph</span>
        <span className="text-[9px] text-gray-300 dark:text-gray-600 ml-auto font-mono">{data.nodes.length}n · {data.edges.length}e</span>
      </div>
      <svg width={W} height={H} className="block">
        <defs>
          <marker id="arr" markerWidth="4" markerHeight="3" refX="3.5" refY="1.5" orient="auto">
            <path d="M0,0 L4,1.5 L0,3" fill="#d1d5db" stroke="none"/>
          </marker>
        </defs>
        {data.edges.map((edge, i) => {
          const from = posMap.get(edge.from)
          const to = posMap.get(edge.to)
          if (!from || !to) return null
          const fx = from.x + nodeW / 2
          const fy = from.y + nodeH
          const tx = to.x + nodeW / 2
          const ty = to.y
          const midY = (fy + ty) / 2
          return (
            <path
              key={i}
              d={`M${fx},${fy} C${fx},${midY} ${tx},${midY} ${tx},${ty}`}
              fill="none" stroke="#d1d5db" strokeWidth="1" markerEnd="url(#arr)"
            />
          )
        })}
        {layout.map(n => (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={nodeW} height={nodeH} rx="4" fill="#f9fafb" stroke="#e5e7eb" strokeWidth="0.5"/>
            <text x={n.x + 6} y={n.y + 14.5} fill="#6b7280" fontSize="8" fontWeight="500" fontFamily="ui-monospace, monospace">
              {(() => {
                const nm = n.name || n.id.split('::').pop() || '?'
                return nm.length > 11 ? nm.slice(0, 9) + '..' : nm
              })()}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function SourceItem({ citation, index, isSelected, onSelect }: {
  citation: Citation
  index: number
  isSelected: boolean
  onSelect: () => void
}) {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loadingGraph, setLoadingGraph] = useState(false)

  const loadGraph = async () => {
    if (!citation.function || !citation.path) return
    setLoadingGraph(true)
    try {
      const params = new URLSearchParams({
        name: citation.function,
        file_path: citation.path,
        depth: '2',
        repo: citation.repo || '',
      })
      const res = await fetch(`/api/graph/call-graph?${params}`)
      const data = await res.json()
      setGraphData(data)
    } catch {
      setGraphData(null)
    }
    setLoadingGraph(false)
  }

  const fileName = (citation.path || citation.file).split('/').pop() || ''
  const lineInfo = citation.end_line && citation.start_line !== citation.end_line
    ? `${citation.start_line}-${citation.end_line}`
    : `${citation.start_line}`

  return (
    <div className="animate-fade-in" style={{ animationDelay: `${index * 30}ms` }}>
      <button
        onClick={onSelect}
        className={`w-full text-left rounded-lg transition-all duration-150 ${
          isSelected
            ? 'bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800'
            : 'bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-900 hover:border-gray-200 dark:hover:border-gray-800'
        }`}
      >
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            {/* Index */}
            <span className="text-[10px] text-gray-300 dark:text-gray-600 font-mono w-4 text-right flex-shrink-0">
              {index + 1}
            </span>

            {/* Chevron */}
            <svg className={`w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0 transition-transform duration-150 ${isSelected ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>

            {/* Filename + line */}
            <div className="flex-1 min-w-0 flex items-baseline gap-2">
              <span className="font-mono text-[13px] text-gray-800 dark:text-gray-200 font-medium truncate">
                {fileName}
              </span>
              <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
                L{lineInfo}
              </span>
            </div>
          </div>

          {/* Function - minimal, no badge */}
          {citation.function && (
            <div className="mt-1.5 ml-[28px]">
              <span className="font-mono text-[11px] text-blue-500 dark:text-blue-400">
                {citation.function}()
              </span>
            </div>
          )}
        </div>
      </button>

      {/* Expanded panel */}
      {isSelected && (
        <div className="mt-1 ml-[28px] mb-2 animate-fade-in">
          <div className="flex items-center gap-1.5 mb-2">
            <a
              href={getVsCodeUrl(citation, citation.start_line)}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Open in VS Code
            </a>
            {citation.function && (
              <button
                onClick={(e) => { e.stopPropagation(); loadGraph() }}
                disabled={loadingGraph}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors disabled:opacity-40"
              >
                {loadingGraph ? (
                  <div className="w-2.5 h-2.5 border border-gray-300 dark:border-gray-700 border-t-gray-500 dark:border-t-gray-400 rounded-full animate-spin" />
                ) : (
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="5" cy="6" r="1.5"/><circle cx="19" cy="6" r="1.5"/><circle cx="12" cy="18" r="1.5"/>
                    <path d="M7 6h10M5 8l7 4M19 8l-7 4"/>
                  </svg>
                )}
                Call Graph
              </button>
            )}
          </div>

          <div className="font-mono text-[10px] text-gray-400 dark:text-gray-500 break-all bg-gray-50 dark:bg-gray-900 px-2 py-1.5 rounded border border-gray-100 dark:border-gray-800">
            {citation.path || citation.file}
          </div>

          {loadingGraph && (
            <div className="flex items-center gap-1.5 px-1 py-2">
              <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse"/>
              <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" style={{ animationDelay: '150ms' }}/>
              <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" style={{ animationDelay: '300ms' }}/>
            </div>
          )}
          {graphData && <div className="mt-1.5"><MiniGraph data={graphData} /></div>}
        </div>
      )}
    </div>
  )
}

export default function CitationsPanel({ citations }: CitationsPanelProps) {
  const [selected, setSelected] = useState<number | null>(null)

  if (!citations.length) return null

  return (
    <div className="flex flex-col gap-1 w-full">
      {citations.map((citation, i) => (
        <SourceItem
          key={i}
          citation={citation}
          index={i}
          isSelected={selected === i}
          onSelect={() => setSelected(selected === i ? null : i)}
        />
      ))}
    </div>
  )
}
