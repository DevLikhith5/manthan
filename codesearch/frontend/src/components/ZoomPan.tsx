import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  contentWidth: number
  contentHeight: number
}

export default function ZoomPan({ children, contentWidth, contentHeight }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const translateStart = useRef({ x: 0, y: 0 })
  const didFit = useRef(false)

  // Auto-fit on first render and when content changes
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const fit = () => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (cw === 0 || ch === 0 || contentWidth === 0 || contentHeight === 0) return

      const padX = 60
      const padY = 60
      const scaleX = (cw - padX * 2) / contentWidth
      const scaleY = (ch - padY * 2) / contentHeight
      const s = Math.min(scaleX, scaleY, 1.5)

      const tx = (cw - contentWidth * s) / 2
      const ty = (ch - contentHeight * s) / 2

      setScale(s)
      setTranslate({ x: tx, y: ty })
      didFit.current = true
    }

    fit()

    const obs = new ResizeObserver(() => {
      if (didFit.current) fit()
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [contentWidth, contentHeight])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale(prev => {
      const next = Math.max(0.1, Math.min(5, prev * delta))
      const ratio = next / prev
      setTranslate(t => ({
        x: mouseX - ratio * (mouseX - t.x),
        y: mouseY - ratio * (mouseY - t.y),
      }))
      return next
    })
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY }
    translateStart.current = { ...translate }
  }, [translate])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setTranslate({
      x: translateStart.current.x + dx,
      y: translateStart.current.y + dy,
    })
  }, [isDragging])

  const handleMouseUp = useCallback(() => setIsDragging(false), [])

  const fitContent = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const cw = el.clientWidth
    const ch = el.clientHeight
    if (cw === 0 || ch === 0 || contentWidth === 0 || contentHeight === 0) return

    const padX = 60
    const padY = 60
    const scaleX = (cw - padX * 2) / contentWidth
    const scaleY = (ch - padY * 2) / contentHeight
    const s = Math.min(scaleX, scaleY, 1.5)

    const tx = (cw - contentWidth * s) / 2
    const ty = (ch - contentHeight * s) / 2

    setScale(s)
    setTranslate({ x: tx, y: ty })
  }, [contentWidth, contentHeight])

  return (
    <div className="flex-1 relative" ref={containerRef} style={{ overflow: 'hidden' }}>
      {/* Zoom controls */}
      <div
        className="absolute flex items-center gap-1"
        style={{ top: '8px', right: '8px', zIndex: 20 }}
      >
        <button
          onClick={() => setScale(s => Math.min(5, s * 1.3))}
          style={btnStyle}
          title="Zoom in"
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
        <button
          onClick={() => setScale(s => Math.max(0.1, s * 0.75))}
          style={btnStyle}
          title="Zoom out"
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
        <button onClick={fitContent} style={btnStyle} title="Fit to view">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            color: '#484f58',
            padding: '0 4px',
            minWidth: '32px',
            textAlign: 'center',
          }}
        >
          {Math.round(scale * 100)}%
        </span>
      </div>

      {/* Pannable/zoomable container */}
      <div
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          width: '100%',
          height: '100%',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            width: contentWidth,
            height: contentHeight,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  width: '24px',
  height: '24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '3px',
  border: '1px solid #21262d',
  background: '#0d1117',
  color: '#8b949e',
  cursor: 'pointer',
  transition: 'color 0.15s, border-color 0.15s',
}