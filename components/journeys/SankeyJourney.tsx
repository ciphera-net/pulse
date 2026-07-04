'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { PathTransition } from '@/lib/api/journeys'
import {
  chainThroughNode,
  chainThroughLink,
  pathOfNode,
  type Chain,
  type ChainLink,
} from '@/lib/journeys/chain'
import { layoutSankey, NODE_WIDTH, type SankeyLink } from '@/lib/journeys/sankeyLayout'
import { StepHeader } from './StepHeader'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'

// ---------------------------------------------------------------------------
// Flow view — a declarative React SVG render of lib/journeys/sankeyLayout.
// Sharp neutral strips and quiet links; hovering a strip or a link raises its
// BFS chain to orange and dims the rest; clicking (or Enter) pins the shared
// ?lens=, which re-renders the layout as the chain subgraph. The tooltip is a
// React fixed div on the popover surface (sanctioned shadow), and strips are
// keyboard-focusable with arrow navigation.
// ---------------------------------------------------------------------------

interface SankeyJourneyProps {
  transitions: PathTransition[]
  depth: number
  maxPagesPerStep?: number
  lens: string | null
  onLensChange: (path: string | null) => void
  totalSessions: number
  periodLabel: string
}

const ORANGE = '#FD5E0F'
const NEUTRAL_500 = '#737373'
const NEUTRAL_600 = '#525252'
const LINK_OPACITY = 0.2
const LINK_CHAIN_OPACITY = 0.45
const LINK_DIM_OPACITY = 0.08
const NODE_DIM_OPACITY = 0.08
const LABEL_DIM_OPACITY = 0.2

type Hover =
  | { kind: 'node'; id: string; path: string }
  | { kind: 'link'; source: string; target: string }
  | null

interface TooltipState {
  x: number
  y: number
  title: string
  sub: string
}

function smartLabel(path: string): string {
  if (path === '/' || path === '(other)') return path
  const segments = path.replace(/\/$/, '').split('/')
  if (segments.length <= 2) return path
  return `…/${segments[segments.length - 1]}`
}

function linkPath(l: SankeyLink): string {
  const gap = l.targetX - l.sourceX
  const c1 = l.sourceX + gap / 3
  const c2 = l.targetX - gap / 3
  return `M ${l.sourceX},${l.sourceY} C ${c1},${l.sourceY} ${c2},${l.targetY} ${l.targetX},${l.targetY}`
}

export default function SankeyJourney({
  transitions,
  depth,
  maxPagesPerStep = 20,
  lens,
  onLensChange,
  totalSessions,
  periodLabel,
}: SankeyJourneyProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef(new Map<string, SVGGElement>())
  const [containerWidth, setContainerWidth] = useState(900)
  const [hover, setHover] = useState<Hover>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setContainerWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // * Lens renders the chain subgraph; a lens with no flows in the current
  // * data falls back to the full graph (the toolbar chip stays clearable).
  const layout = useMemo(() => {
    const opts = { depth, maxPagesPerStep, width: containerWidth }
    if (lens) {
      const filtered = layoutSankey(transitions, { ...opts, lens })
      if (filtered.nodes.length > 0) return filtered
    }
    return layoutSankey(transitions, opts)
  }, [transitions, depth, maxPagesPerStep, containerWidth, lens])

  const chainLinks: ChainLink[] = layout.links
  // * Hovering a node highlights only the flow through that specific node
  // * (chainThroughNode), not every occurrence of its path.
  const chain: Chain | null = useMemo(() => {
    if (!hover) return null
    return hover.kind === 'link'
      ? chainThroughLink(chainLinks, hover.source, hover.target)
      : chainThroughNode(chainLinks, hover.id)
  }, [hover, chainLinks])

  const stepOrdinals = useMemo(
    () => new Map(layout.steps.map((s, ordinal) => [s.index, ordinal])),
    [layout.steps],
  )
  const nodesByStep = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const n of layout.nodes) {
      if (!m.has(n.step)) m.set(n.step, [])
      m.get(n.step)!.push(n.id)
    }
    return m
  }, [layout.nodes])

  const toggleLens = useCallback(
    (path: string) => {
      if (path === '(other)') return
      onLensChange(lens === path ? null : path)
    },
    [lens, onLensChange],
  )

  const clearHover = useCallback(() => {
    setHover(null)
    setTooltip(null)
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as SVGGElement
      const stepRaw = target.dataset?.step
      const idxRaw = target.dataset?.idx
      if (stepRaw === undefined || idxRaw === undefined) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const id = target.dataset.id
        if (id) toggleLens(pathOfNode(id))
        return
      }
      let ordinal = stepOrdinals.get(parseInt(stepRaw, 10)) ?? 0
      let idx = parseInt(idxRaw, 10)
      switch (e.key) {
        case 'ArrowDown': idx += 1; break
        case 'ArrowUp': idx -= 1; break
        case 'ArrowRight': ordinal += 1; break
        case 'ArrowLeft': ordinal -= 1; break
        default: return
      }
      e.preventDefault()
      ordinal = Math.max(0, Math.min(layout.steps.length - 1, ordinal))
      const ids = nodesByStep.get(layout.steps[ordinal]?.index) ?? []
      if (ids.length === 0) return
      idx = Math.max(0, Math.min(ids.length - 1, idx))
      nodeRefs.current.get(ids[idx])?.focus()
    },
    [stepOrdinals, nodesByStep, layout.steps, toggleLens],
  )

  if (layout.nodes.length === 0) return null

  const lastStepIndex = layout.steps[layout.steps.length - 1]?.index

  return (
    <div>
      {/* Step headers — DOM so typography matches the columns view exactly */}
      <div className="relative mb-2 h-11">
        {layout.steps.map((s) => (
          <div
            key={s.index}
            className="absolute top-0"
            style={
              s.index === lastStepIndex && layout.steps.length > 1
                ? { right: 0 }
                : { left: s.x }
            }
          >
            <StepHeader index={s.index} visitors={s.visitors} dropOffPercent={s.dropOffPercent} />
          </div>
        ))}
      </div>

      <div ref={containerRef} className="w-full overflow-hidden" onMouseLeave={clearHover}>
        <svg
          width={layout.width}
          height={layout.height}
          className="w-full"
          role="group"
          aria-label="Visitor flow between pages"
          onKeyDown={onKeyDown}
        >
          {/* Links */}
          {layout.links.map((l, i) => {
            const onChain = chain?.linkKeys.has(l.key) ?? false
            const opacity = chain
              ? onChain
                ? LINK_CHAIN_OPACITY
                : LINK_DIM_OPACITY
              : LINK_OPACITY
            return (
              <motion.path
                key={l.key}
                fill="none"
                stroke={onChain ? ORANGE : NEUTRAL_600}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: 1,
                  opacity,
                  d: linkPath(l),
                  strokeWidth: l.strokeWidth,
                }}
                transition={{
                  duration: DURATION_BASE,
                  ease: EASE_APPLE,
                  delay: Math.min(i * 0.01, 0.12),
                  opacity: { duration: DURATION_BASE / 2, ease: EASE_APPLE, delay: 0 },
                }}
                style={{ pointerEvents: 'none' }}
              />
            )
          })}

          {/* Link hit areas — wide invisible strokes for hover + tooltip */}
          {layout.links.map((l) => (
            <path
              key={`hit-${l.key}`}
              d={linkPath(l)}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(l.strokeWidth, 14)}
              onMouseEnter={(e) => {
                setHover({ kind: 'link', source: l.source, target: l.target })
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  title: `${pathOfNode(l.source)} → ${pathOfNode(l.target)}`,
                  sub: `${l.value.toLocaleString()} sessions`,
                })
              }}
              onMouseMove={(e) =>
                setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))
              }
              onMouseLeave={clearHover}
            />
          ))}

          {/* Nodes */}
          {layout.nodes.map((n) => {
            const onChain = chain?.nodeIds.has(n.id) ?? false
            const isLast = n.step === lastStepIndex && layout.steps.length > 1
            const ordinalIdx = nodesByStep.get(n.step)?.indexOf(n.id) ?? 0
            const rectOpacity = chain && !onChain ? NODE_DIM_OPACITY : 1
            const labelOpacity = chain && !onChain ? LABEL_DIM_OPACITY : 1
            const clickable = n.path !== '(other)'
            return (
              <motion.g
                key={n.id}
                ref={(el: SVGGElement | null) => {
                  if (el) nodeRefs.current.set(n.id, el)
                  else nodeRefs.current.delete(n.id)
                }}
                initial={{ x: n.x, y: n.y, opacity: 0 }}
                animate={{ x: n.x, y: n.y, opacity: 1 }}
                transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
                tabIndex={0}
                role="button"
                aria-label={`${n.path} — ${n.count.toLocaleString()} sessions`}
                aria-pressed={lens === n.path}
                data-id={n.id}
                data-step={n.step}
                data-idx={ordinalIdx}
                style={{ cursor: clickable ? 'pointer' : 'default', outline: 'none' }}
                onMouseEnter={(e) => {
                  setHover({ kind: 'node', id: n.id, path: n.path })
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    title: n.path,
                    sub: `${n.count.toLocaleString()} sessions`,
                  })
                }}
                onMouseMove={(e) =>
                  setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))
                }
                onMouseLeave={clearHover}
                onFocus={(e) => {
                  setFocusedId(n.id)
                  setHover({ kind: 'node', id: n.id, path: n.path })
                  const rect = (e.currentTarget as SVGGElement).getBoundingClientRect()
                  setTooltip({
                    x: rect.right,
                    y: rect.top + rect.height / 2,
                    title: n.path,
                    sub: `${n.count.toLocaleString()} sessions`,
                  })
                }}
                onBlur={() => {
                  setFocusedId(null)
                  clearHover()
                }}
                onClick={() => toggleLens(n.path)}
              >
                {/* Wider invisible hit area */}
                <rect x={-5} width={NODE_WIDTH + 10} height={n.height} fill="transparent" />
                <motion.rect
                  width={NODE_WIDTH}
                  rx={0}
                  fill={onChain ? ORANGE : NEUTRAL_500}
                  stroke={focusedId === n.id ? ORANGE : 'none'}
                  strokeWidth={focusedId === n.id ? 1.5 : 0}
                  animate={{ height: n.height, opacity: rectOpacity }}
                  transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
                />
                <motion.text
                  x={isLast ? -4 : NODE_WIDTH + 4}
                  textAnchor={isLast ? 'end' : 'start'}
                  fontSize={12}
                  fill="#e5e5e5"
                  animate={{ y: n.height / 2 + 4, opacity: labelOpacity }}
                  transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
                >
                  {smartLabel(n.path)}
                </motion.text>
              </motion.g>
            )
          })}
        </svg>
      </div>

      {/* Tooltip — fixed, popover surface (sanctioned shadow). Anchors to the
          right of the cursor normally, flips to the left in the right portion of
          the viewport so it never runs off the last column. */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs -translate-y-1/2 truncate rounded-none border border-border bg-popover px-3 py-2 shadow-lg"
          style={
            tooltip.x > (typeof window !== 'undefined' ? window.innerWidth : 0) * 0.62
              ? { right: (typeof window !== 'undefined' ? window.innerWidth : 0) - tooltip.x + 14, top: tooltip.y }
              : { left: tooltip.x + 14, top: tooltip.y }
          }
          role="status"
        >
          <div className="truncate text-sm font-medium text-white">{tooltip.title}</div>
          <div className="truncate text-sm text-neutral-400">{tooltip.sub}</div>
        </div>
      )}

      {/* Meta footer — sessions · effective depth · period */}
      <div className="mt-4 border-t border-border pt-3 text-sm text-neutral-400">
        {totalSessions.toLocaleString()} sessions tracked
        {' · '}
        {layout.steps.length < depth
          ? `Showing ${layout.steps.length} of ${depth} steps — no traffic beyond step ${layout.steps.length} in this period`
          : `${layout.steps.length} steps`}
        {' · '}
        {periodLabel}
      </div>
    </div>
  )
}
