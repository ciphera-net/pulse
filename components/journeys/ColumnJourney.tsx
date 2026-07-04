'use client'

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { DotsThree, FileText, House, SignOut } from '@phosphor-icons/react'
import type { PathTransition } from '@/lib/api/journeys'
import { aggregateJourney } from '@/lib/journeys/aggregate'
import {
  buildLinks,
  chainThrough,
  chainThroughNode,
  exitCount,
  linkKey,
  nodeId,
  pathOfNode,
  stepOfNode,
  type Chain,
  type ChainLink,
} from '@/lib/journeys/chain'
import { StepHeader } from './StepHeader'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'

// ---------------------------------------------------------------------------
// Columns view. Rows carry kind glyphs and proportional orange bars; ambient
// ribbons draw the top transitions in every gutter, and hovering or pinning
// the shared ?lens= raises the BFS chain through that path to orange while
// the rest dims. Rows are keyboard-navigable (arrows move, Enter pins).
// ---------------------------------------------------------------------------

interface ColumnJourneyProps {
  transitions: PathTransition[]
  depth: number
  maxPagesPerStep?: number
  lens: string | null
  onLensChange: (path: string | null) => void
  totalSessions: number
  periodLabel: string
}

const AMBIENT_RIBBONS_PER_GUTTER = 5
const RIBBON_MIN_WIDTH = 2
const RIBBON_MAX_WIDTH = 12
const ORANGE = '#FD5E0F'
const NEUTRAL_600 = '#525252'

function smartLabel(path: string): string {
  if (path === '/' || path === '(other)') return path
  const segments = path.replace(/\/$/, '').split('/')
  if (segments.length <= 2) return path
  return `…/${segments[segments.length - 1]}`
}

function rowGlyph(path: string) {
  const cls = 'h-4 w-4 shrink-0 text-neutral-500'
  if (path === '/') return <House className={cls} />
  if (path === '(other)') return <DotsThree className={cls} />
  return <FileText className={cls} />
}

// ─── Ribbons ────────────────────────────────────────────────────────

interface RibbonGeometry {
  key: string
  d: string
  width: number
}

/** Links to draw: the top N ambient ribbons per gutter, plus the active chain. */
function ribbonLinks(links: ChainLink[], chain: Chain | null): ChainLink[] {
  const byGutter = new Map<number, ChainLink[]>()
  for (const l of links) {
    const step = stepOfNode(l.source)
    if (!byGutter.has(step)) byGutter.set(step, [])
    byGutter.get(step)!.push(l)
  }
  const picked = new Map<string, ChainLink>()
  for (const gutter of byGutter.values()) {
    gutter.sort((a, b) => b.value - a.value)
    for (const l of gutter.slice(0, AMBIENT_RIBBONS_PER_GUTTER)) {
      picked.set(linkKey(l.source, l.target), l)
    }
  }
  if (chain) {
    for (const l of links) {
      const key = linkKey(l.source, l.target)
      if (chain.linkKeys.has(key)) picked.set(key, l)
    }
  }
  return Array.from(picked.values())
}

function RibbonOverlay({
  containerRef,
  links,
  chain,
  measureTick,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  links: ChainLink[]
  chain: Chain | null
  measureTick: number
}) {
  const [geometry, setGeometry] = useState<RibbonGeometry[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })

  const drawn = useMemo(() => ribbonLinks(links, chain), [links, chain])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || drawn.length === 0) {
      setGeometry([])
      return
    }
    const containerRect = container.getBoundingClientRect()
    setSize({ width: container.scrollWidth, height: container.scrollHeight })

    const maxValue = Math.max(...drawn.map((l) => l.value), 1)
    const next: RibbonGeometry[] = []
    for (const l of drawn) {
      const sourceEl = container.querySelector(
        `[data-col="${stepOfNode(l.source)}"][data-path="${CSS.escape(pathOfNode(l.source))}"]`,
      )
      const targetEl = container.querySelector(
        `[data-col="${stepOfNode(l.target)}"][data-path="${CSS.escape(pathOfNode(l.target))}"]`,
      )
      if (!sourceEl || !targetEl) continue
      const s = sourceEl.getBoundingClientRect()
      const t = targetEl.getBoundingClientRect()
      const x1 = s.right - containerRect.left + container.scrollLeft
      const y1 = s.top + s.height / 2 - containerRect.top + container.scrollTop
      const x2 = t.left - containerRect.left + container.scrollLeft
      const y2 = t.top + t.height / 2 - containerRect.top + container.scrollTop
      const midX = (x1 + x2) / 2
      const width =
        RIBBON_MIN_WIDTH + (l.value / maxValue) * (RIBBON_MAX_WIDTH - RIBBON_MIN_WIDTH)
      next.push({
        key: linkKey(l.source, l.target),
        d: `M ${x1},${y1} C ${midX},${y1} ${midX},${y2} ${x2},${y2}`,
        width,
      })
    }
    setGeometry(next)
  }, [containerRef, drawn, measureTick])

  if (geometry.length === 0) return null

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={size.width}
      height={size.height}
      aria-hidden="true"
    >
      {geometry.map((r, i) => {
        const onChain = chain?.linkKeys.has(r.key) ?? false
        const stroke = onChain ? ORANGE : NEUTRAL_600
        const opacity = chain ? (onChain ? 0.45 : 0.08) : 0.25
        return (
          <motion.path
            key={r.key}
            d={r.d}
            fill="none"
            stroke={stroke}
            strokeWidth={r.width}
            strokeLinecap="butt"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity }}
            transition={{
              duration: DURATION_BASE,
              ease: EASE_APPLE,
              delay: Math.min(i * 0.015, 0.12),
              opacity: { duration: DURATION_BASE / 2, ease: EASE_APPLE, delay: 0 },
            }}
          />
        )
      })}
    </svg>
  )
}

// ─── Rows ───────────────────────────────────────────────────────────

function PageRow({
  path,
  sessionCount,
  isOther,
  colIndex,
  rowIndex,
  columnTotal,
  maxCount,
  onChain,
  isLensRow,
  hasChain,
  onHover,
  onToggleLens,
}: {
  path: string
  sessionCount: number
  isOther: boolean
  colIndex: number
  rowIndex: number
  columnTotal: number
  maxCount: number
  onChain: boolean
  isLensRow: boolean
  hasChain: boolean
  /** Receives the specific `step:path` node id — hover is node-specific. */
  onHover: (nodeId: string | null) => void
  onToggleLens: (path: string) => void
}) {
  const pct = columnTotal > 0 ? Math.round((sessionCount / columnTotal) * 100) : 0
  const barWidth = maxCount > 0 ? (sessionCount / maxCount) * 100 : 0
  const id = nodeId(colIndex, path)

  return (
    <button
      type="button"
      disabled={isOther}
      title={path}
      data-col={colIndex}
      data-idx={rowIndex}
      data-path={path}
      onClick={() => onToggleLens(path)}
      onMouseEnter={() => { if (!isOther) onHover(id) }}
      onFocus={() => { if (!isOther) onHover(id) }}
      className={`group relative flex h-9 w-full items-center gap-2 rounded-none px-3 text-left transition-colors duration-fast ease-apple
        ${isOther ? 'cursor-default' : 'cursor-pointer hover:bg-neutral-800/60'}
        ${hasChain && !onChain ? 'opacity-40' : ''}
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange`}
    >
      {!isOther && barWidth > 0 && (
        <motion.div
          className={`absolute bottom-0.5 left-0 top-0.5 rounded-none ${onChain ? 'bg-brand-orange/20' : 'bg-brand-orange/10'}`}
          initial={{ width: '0%' }}
          animate={{ width: `${barWidth}%` }}
          transition={{
            duration: DURATION_BASE,
            ease: EASE_APPLE,
            delay: Math.min(rowIndex * 0.02, 0.12),
          }}
        />
      )}
      <span className="relative shrink-0">{rowGlyph(path)}</span>
      <span
        className={`relative flex-1 truncate text-sm ${
          isOther ? 'italic text-neutral-500' : isLensRow ? 'font-medium text-white' : 'text-white'
        }`}
      >
        {smartLabel(path)}
      </span>
      <span className="relative ml-2 flex shrink-0 items-center gap-2">
        {!isOther && (
          <span
            className={`text-xs font-medium tabular-nums text-brand-orange transition-opacity duration-fast ease-apple ${
              onChain ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            {pct}%
          </span>
        )}
        <span className={`text-sm font-semibold tabular-nums ${isOther ? 'text-neutral-500' : 'text-neutral-400'}`}>
          {sessionCount.toLocaleString()}
        </span>
      </span>
    </button>
  )
}

// ─── Main component ─────────────────────────────────────────────────

export default function ColumnJourney({
  transitions,
  depth,
  maxPagesPerStep = 20,
  lens,
  onLensChange,
  totalSessions,
  periodLabel,
}: ColumnJourneyProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [measureTick, setMeasureTick] = useState(0)

  const columns = useMemo(
    () => aggregateJourney(transitions, { depth, maxPagesPerStep }),
    [transitions, depth, maxPagesPerStep],
  )
  const links = useMemo(() => buildLinks(transitions, columns), [transitions, columns])

  // * Hover is node-specific (only the flow through that row); a pinned lens is
  // * path-based (traces the page across every step — design §4.2).
  const chain = useMemo(() => {
    if (hoverId) return chainThroughNode(links, hoverId)
    if (lens) return chainThrough(links, lens)
    return null
  }, [links, hoverId, lens])
  // * A lens whose path vanished from the current data must not dim everything.
  const hasChain = (chain?.nodeIds.size ?? 0) > 0

  // * Re-measure ribbon endpoints on container resize or inner column scroll.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => setMeasureTick((t) => t + 1))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const toggleLens = useCallback(
    (path: string) => onLensChange(lens === path ? null : path),
    [lens, onLensChange],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement
      const colRaw = target.dataset?.col
      const idxRaw = target.dataset?.idx
      if (colRaw === undefined || idxRaw === undefined) return
      let col = parseInt(colRaw, 10)
      let idx = parseInt(idxRaw, 10)
      switch (e.key) {
        case 'ArrowDown': idx += 1; break
        case 'ArrowUp': idx -= 1; break
        case 'ArrowRight': col += 1; break
        case 'ArrowLeft': col -= 1; break
        default: return
      }
      e.preventDefault()
      col = Math.max(0, Math.min(columns.length - 1, col))
      const rows = containerRef.current?.querySelectorAll<HTMLButtonElement>(
        `button[data-col="${col}"]:not(:disabled)`,
      )
      if (!rows || rows.length === 0) return
      // * data-idx counts all rows incl. disabled (other) — focus the enabled
      // * row whose index is nearest the requested one.
      let best: HTMLButtonElement = rows[0]
      let bestDist = Infinity
      for (const el of rows) {
        const dist = Math.abs(parseInt(el.dataset.idx ?? '0', 10) - idx)
        if (dist < bestDist) {
          best = el
          bestDist = dist
        }
      }
      best.focus()
    },
    [columns.length],
  )

  if (columns.length === 0) return null

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="relative -mx-6 overflow-x-auto px-6 pb-2"
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHoverId(null)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setHoverId(null)
        }}
        onScrollCapture={() => setMeasureTick((t) => t + 1)}
      >
        <div className="flex min-w-fit gap-12 py-2">
          {columns.map((col) => {
            const maxCount = Math.max(...col.pages.map((p) => p.sessionCount), 0)
            // * The exit card sits on the column after the lens hop: sessions
            // * that were on the lens path here and never moved on.
            const exits =
              lens && col.index > 0 && columns[col.index - 1].pages.some((p) => p.path === lens)
                ? exitCount(transitions, col.index - 1, lens, columns)
                : 0

            return (
              <motion.div
                key={col.index}
                className="w-56 shrink-0"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: DURATION_BASE,
                  ease: EASE_APPLE,
                  delay: Math.min(col.index * 0.03, 0.12),
                }}
              >
                <div className="mb-4">
                  <StepHeader
                    index={col.index}
                    visitors={col.visitors}
                    dropOffPercent={col.dropOffPercent}
                  />
                </div>
                {col.pages.length === 0 && exits === 0 ? (
                  <div className="flex h-16 items-center px-3">
                    <span className="text-xs text-neutral-500">No onward traffic</span>
                  </div>
                ) : (
                  <div className="max-h-[500px] space-y-0.5 overflow-y-auto">
                    {col.pages.map((page, rowIndex) => {
                      const id = nodeId(col.index, page.path)
                      return (
                        <PageRow
                          key={page.path}
                          path={page.path}
                          sessionCount={page.sessionCount}
                          isOther={page.isOther}
                          colIndex={col.index}
                          rowIndex={rowIndex}
                          columnTotal={col.visitors}
                          maxCount={maxCount}
                          onChain={hasChain && (chain?.nodeIds.has(id) ?? false)}
                          isLensRow={lens === page.path}
                          hasChain={hasChain}
                          onHover={setHoverId}
                          onToggleLens={toggleLens}
                        />
                      )
                    })}
                    {exits > 0 && (
                      <motion.div
                        data-col={col.index}
                        data-path="(exit)"
                        className="relative flex h-9 w-full items-center gap-2 rounded-none bg-red-500/10 px-3"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
                      >
                        <SignOut className="h-4 w-4 shrink-0 text-red-400" />
                        <span className="flex-1 truncate text-sm font-medium text-red-400">
                          (exit)
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-red-400">
                          {exits.toLocaleString()}
                        </span>
                      </motion.div>
                    )}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
        <RibbonOverlay
          containerRef={containerRef}
          links={links}
          chain={hasChain ? chain : null}
          measureTick={measureTick}
        />
      </div>

      {/* Meta footer — sessions · effective depth · period */}
      <div className="mt-4 border-t border-border pt-3 text-sm text-neutral-400">
        {totalSessions.toLocaleString()} sessions tracked
        {' · '}
        {columns.length < depth
          ? `Showing ${columns.length} of ${depth} steps — no traffic beyond step ${columns.length} in this period`
          : `${columns.length} steps`}
        {' · '}
        {periodLabel}
      </div>
    </div>
  )
}
