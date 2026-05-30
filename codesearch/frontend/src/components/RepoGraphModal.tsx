import { useEffect, useState } from 'react'
import ZoomPan from './ZoomPan'

interface GraphNode {
  id: string
  label: string
  name: string
  file_path: string
  path?: string
  language?: string
  kind?: string
}

interface GraphEdge {
  from: string
  to: string
  type: string
}

interface Props {
  repo: string
  onSelect: (entityType: string, name: string, filePath: string) => void
  onClose: () => void
}

interface PositionedNode extends GraphNode {
  x: number
  y: number
}

const NODE_W = 92
const NODE_H = 22
const GAP_X = 52
const GAP_Y = 36

function layoutNodes(nodes: GraphNode[], edges: GraphEdge[]): PositionedNode[] {
  if (nodes.length === 0) return []

  const children = new Map<string, string[]>()
  const parents = new Map<string, string[]>()
  const nodeIds = new Set(nodes.map(n => n.id))

  for (const e of edges) {
    if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
      if (!children.has(e.from)) children.set(e.from, [])
      children.get(e.from)!.push(e.to)
      if (!parents.has(e.to)) parents.set(e.to, [])
      parents.get(e.to)!.push(e.from)
    }
  }

  const roots = nodes.filter(n => !parents.has(n.id) || parents.get(n.id)!.length === 0)
  if (roots.length === 0) roots.push(nodes[0])

  const layers = new Map<string, number>()
  const queue = roots.map(n => ({ id: n.id, layer: 0 }))
  const visited = new Set<string>()

  while (queue.length > 0) {
    const { id, layer } = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    layers.set(id, layer)
    for (const child of children.get(id) || []) {
      if (!visited.has(child)) {
        queue.push({ id: child, layer: layer + 1 })
      }
    }
  }

  let maxLayer = Math.max(0, ...Array.from(layers.values()))
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      maxLayer++
      layers.set(n.id, maxLayer)
    }
  }

  const layerGroups = new Map<number, GraphNode[]>()
  for (const n of nodes) {
    const layer = layers.get(n.id) || 0
    if (!layerGroups.has(layer)) layerGroups.set(layer, [])
    layerGroups.get(layer)!.push(n)
  }

  const positioned: PositionedNode[] = []
  const startX = 40

  for (const [layer, group] of layerGroups) {
    const offsetX = startX + (layer * (NODE_W + GAP_X))
    group.forEach((n, i) => {
      positioned.push({
        ...n,
        x: offsetX,
        y: 40 + i * (NODE_H + GAP_Y),
      })
    })
  }

  return positioned
}

function truncate(s: string, max: number): string {
  if (!s) return ''
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s
}

const TYPE_ACCENT: Record<string, string> = {
  File: '#6e7681',
  Function: '#58a6ff',
  Class: '#bc8cff',
  Import: '#f778ba',
}

const TYPE_LABEL: Record<string, string> = {
  File: 'FILE',
  Function: 'FUNC',
  Class: 'CLASS',
  Import: 'IMPORT',
}

export default function RepoGraphModal({ repo, onSelect, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nodes, setNodes] = useState<PositionedNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [detail, setDetail] = useState<'file' | 'full'>('file')
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetch(`/api/graph/repo-graph?repo=${encodeURIComponent(repo)}&detail=${detail}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const rawNodes: GraphNode[] = data.nodes || []
        const rawEdges: GraphEdge[] = data.edges || []

        if (rawNodes.length === 0) {
          setError('No graph data')
          setLoading(false)
          return
        }

        setNodes(layoutNodes(rawNodes, rawEdges))
        setEdges(rawEdges)
        setLoading(false)
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message || 'Failed to load')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [repo, detail])

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const maxX = nodes.length > 0 ? Math.max(...nodes.map(n => n.x)) + NODE_W + 120 : 800
  const maxY = nodes.length > 0 ? Math.max(...nodes.map(n => n.y)) + NODE_H + 80 : 600

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="relative flex flex-col overflow-hidden"
        style={{
          width: '94vw',
          height: '90vh',
          background: '#06090f',
          border: '1px solid #1c2333',
          borderRadius: '6px',
        }}
      >
        {/* Header bar */}
        <div
          className="flex items-center justify-between flex-shrink-0"
          style={{
            padding: '0 16px',
            height: '44px',
            borderBottom: '1px solid #1c2333',
            background: '#0a0e17',
          }}
        >
          <div className="flex items-center gap-4">
            <span
              style={{
                fontFamily: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace",
                fontSize: '12px',
                fontWeight: 600,
                color: '#8b949e',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              {repo}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10px',
                color: '#484f58',
              }}
            >
              {nodes.length}n / {edges.length}e
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div
              style={{
                display: 'flex',
                borderRadius: '3px',
                border: '1px solid #21262d',
                overflow: 'hidden',
              }}
            >
              {(['file', 'full'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDetail(d)}
                  style={{
                    padding: '3px 10px',
                    fontSize: '10px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: detail === d ? '#c9d1d9' : '#484f58',
                    background: detail === d ? '#161b22' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              style={{
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '3px',
                border: 'none',
                background: 'transparent',
                color: '#484f58',
                cursor: 'pointer',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#8b949e')}
              onMouseLeave={e => (e.currentTarget.style.color = '#484f58')}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Canvas */}
        <ZoomPan contentWidth={maxX} contentHeight={maxY}>
          {loading && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ zIndex: 10 }}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  border: '1.5px solid #21262d',
                  borderTopColor: '#58a6ff',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '11px',
                  color: '#484f58',
                }}
              >
                {error}
              </span>
            </div>
          )}

          {!loading && !error && (
            <svg
              width={maxX}
              height={maxY}
              viewBox={`0 0 ${maxX} ${maxY}`}
              style={{ display: 'block' }}
            >
              <defs>
                {/* Dot grid pattern */}
                <pattern id="grid-dots" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="0.5" fill="#161b22" />
                </pattern>

                {/* Arrow markers per edge type */}
                {Object.entries({ CALLS: '#3b82f6', DEFINES: '#3fb950', IMPORTS: '#f778ba' }).map(([type, color]) => (
                  <marker
                    key={type}
                    id={`arr-${type.toLowerCase()}`}
                    markerWidth="6"
                    markerHeight="4"
                    refX="5"
                    refY="2"
                    orient="auto"
                  >
                    <path d="M0,0.5 L5,2 L0,3.5" fill={color} fillOpacity="0.7" />
                  </marker>
                ))}
              </defs>

              {/* Background grid */}
              <rect width="100%" height="100%" fill="url(#grid-dots)" />

              {/* Edges */}
              {edges.map((e, i) => {
                const from = nodeMap.get(e.from)
                const to = nodeMap.get(e.to)
                if (!from || !to) return null

                const fx = from.x + NODE_W
                const fy = from.y + NODE_H / 2
                const tx = to.x
                const ty = to.y + NODE_H / 2

                const edgeColor = e.type === 'CALLS' ? '#3b82f6' : e.type === 'DEFINES' ? '#3fb950' : '#f778ba'
                const isHighlighted = hoveredNode === e.from || hoveredNode === e.to

                return (
                  <path
                    key={i}
                    d={`M${fx},${fy} C${(fx + tx) / 2},${fy} ${(fx + tx) / 2},${ty} ${tx},${ty}`}
                    fill="none"
                    stroke={edgeColor}
                    strokeWidth={isHighlighted ? 1.5 : 0.75}
                    strokeOpacity={isHighlighted ? 0.8 : 0.3}
                    strokeDasharray={e.type === 'DEFINES' ? '3,3' : undefined}
                    markerEnd={`url(#arr-${e.type.toLowerCase()})`}
                    style={{ transition: 'stroke-opacity 0.2s, stroke-width 0.2s' }}
                  />
                )
              })}

              {/* Nodes */}
              {nodes.map(n => {
                const accent = TYPE_ACCENT[n.label] || '#6e7681'
                const rawName = n.name || n.path || n.id || ''
                const isHovered = hoveredNode === n.id

                return (
                  <g
                    key={n.id}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredNode(n.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onClick={() => {
                      const fp = n.file_path || n.path
                      if (fp && n.label !== 'File') {
                        onSelect('function', n.name || n.path || n.id, fp)
                        onClose()
                      }
                    }}
                  >
                    {/* Node body */}
                    <rect
                      x={n.x}
                      y={n.y}
                      width={NODE_W}
                      height={NODE_H}
                      rx="2"
                      fill={isHovered ? '#161b22' : '#0d1117'}
                      stroke={isHovered ? accent : '#21262d'}
                      strokeWidth={isHovered ? 1 : 0.5}
                      style={{ transition: 'all 0.15s' }}
                    />

                    {/* Left accent bar */}
                    <rect
                      x={n.x}
                      y={n.y}
                      width="2"
                      height={NODE_H}
                      rx="1"
                      fill={accent}
                      fillOpacity={isHovered ? 1 : 0.6}
                      style={{ transition: 'fill-opacity 0.15s' }}
                    />

                    {/* Label */}
                    <text
                      x={n.x + 8}
                      y={n.y + NODE_H / 2 + 3.5}
                      fill={isHovered ? '#c9d1d9' : '#8b949e'}
                      fontSize="9"
                      fontFamily="'JetBrains Mono', 'SF Mono', monospace"
                      fontWeight="400"
                      style={{ transition: 'fill 0.15s' }}
                    >
                      {truncate(rawName, 12)}
                    </text>

                    {/* Type badge on hover */}
                    {isHovered && (
                      <text
                        x={n.x + NODE_W - 4}
                        y={n.y + NODE_H / 2 + 3}
                        fill={accent}
                        fontSize="7"
                        fontFamily="'JetBrains Mono', monospace"
                        fontWeight="600"
                        textAnchor="end"
                        letterSpacing="0.05em"
                      >
                        {TYPE_LABEL[n.label] || ''}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          )}
        </ZoomPan>

        {/* Bottom bar - legend */}
        <div
          className="flex items-center flex-shrink-0"
          style={{
            padding: '0 16px',
            height: '32px',
            borderTop: '1px solid #1c2333',
            background: '#0a0e17',
            gap: '20px',
          }}
        >
          {Object.entries(TYPE_ACCENT).map(([label, color]) => (
            <div key={label} className="flex items-center" style={{ gap: '5px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '1px',
                  background: color,
                  opacity: 0.7,
                }}
              />
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '9px',
                  color: '#484f58',
                  letterSpacing: '0.03em',
                }}
              >
                {label}
              </span>
            </div>
          ))}

          <div style={{ width: '1px', height: '12px', background: '#21262d', margin: '0 4px' }} />

          {[
            { type: 'CALLS', color: '#3b82f6' },
            { type: 'DEFINES', color: '#3fb950' },
            { type: 'IMPORTS', color: '#f778ba' },
          ].map(({ type, color }) => (
            <div key={type} className="flex items-center" style={{ gap: '5px' }}>
              <svg width="16" height="2">
                <line
                  x1="0" y1="1" x2="16" y2="1"
                  stroke={color}
                  strokeWidth="1"
                  strokeOpacity="0.6"
                  strokeDasharray={type === 'DEFINES' ? '2,2' : undefined}
                />
              </svg>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '9px',
                  color: '#484f58',
                  letterSpacing: '0.03em',
                }}
              >
                {type}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}