'use client'

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PathTransition } from '@/lib/api/journeys'
import { aggregateJourney, type AggregatedStep, type AggregatedPage } from '@/lib/journeys/aggregate'

// ─── Types ──────────────────────────────────────────────────────────

interface ColumnJourneyProps {
  transitions: PathTransition[]
  depth: number
  maxPagesPerStep?: number
}

interface LineDef {
  sourceY: number
  destY: number
  sourceX: number
  destX: number
  weight: number
}

// ─── Constants ──────────────────────────────────────────────────────

const COLUMN_COLORS = [
  '#FD5E0F', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#EF4444', '#84CC16', '#F97316', '#6366F1',
]

function colorForColumn(col: number): string {
  return COLUMN_COLORS[col % COLUMN_COLORS.length]
}

// ─── Helpers ────────────────────────────────────────────────────────

function smartLabel(path: string): string {
  if (path === '/' || path === '(other)') return path
  const segments = path.replace(/\/$/, '').split('/')
  if (segments.length <= 2) return path
  return `…/${segments[segments.length - 1]}`
}

// ─── Animated count hook ────────────────────────────────────────────

function useAnimatedCount(target: number, duration = 400): number {
  const [display, setDisplay] = useState(0)
  const prevTarget = useRef(target)

  useEffect(() => {
    const from = prevTarget.current
    prevTarget.current = target
    if (from === target) {
      setDisplay(target)
      return
    }
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setDisplay(Math.round(from + (target - from) * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return display
}

// ─── Sub-components ─────────────────────────────────────────────────

function AnimatedDropOff({ percent }: { percent: number }) {
  const displayed = useAnimatedCount(percent)
  if (displayed === 0 && percent === 0) return null
  return (
    <span
      className={`text-xs font-medium ${
        percent < 0 ? 'text-red-500' : 'text-emerald-500'
      }`}
    >
      {percent > 0 ? '+' : displayed < 0 ? '' : ''}
      {displayed}%
    </span>
  )
}

function ColumnHeader({
  column,
}: {
  column: AggregatedStep
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 mb-4">
      <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
        Step {column.index + 1}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold text-white tabular-nums">
          {column.visitors.toLocaleString()} visitors
        </span>
        {column.dropOffPercent !== 0 && (
          <AnimatedDropOff percent={column.dropOffPercent} />
        )}
      </div>
    </div>
  )
}

function PageRow({
  page,
  colIndex,
  rowIndex,
  columnTotal,
  maxCount,
  isSelected,
  isOther,
  isMounted,
  onClick,
}: {
  page: AggregatedPage
  colIndex: number
  rowIndex: number
  columnTotal: number
  maxCount: number
  isSelected: boolean
  isOther: boolean
  isMounted: boolean
  onClick: () => void
}) {
  const pct = columnTotal > 0 ? Math.round((page.sessionCount / columnTotal) * 100) : 0
  const barWidth = maxCount > 0 ? (page.sessionCount / maxCount) * 100 : 0

  return (
    <button
      type="button"
      disabled={isOther}
      onClick={onClick}
      title={page.path}
      data-col={colIndex}
      data-path={page.path}
      className={`
        group flex items-center justify-between w-full relative
        h-9 px-3 rounded-lg text-left transition-all duration-base
        ${isOther ? 'cursor-default' : 'cursor-pointer'}
        ${isSelected
          ? 'bg-brand-orange/10'
          : isOther
            ? ''
            : 'hover:bg-neutral-800/50 hover:-translate-y-px hover:shadow-sm'
        }
       ease-apple`}
    >
      {/* Background bar — animates width on mount */}
      {!isOther && barWidth > 0 && (
        <div
          className="absolute top-0.5 bottom-0.5 left-0.5 rounded-md transition-[width] duration-gentle ease-apple"
          style={{
            width: isMounted ? `calc(${barWidth}% - 4px)` : '0%',
            transitionDelay: `${rowIndex * 30}ms`,
            backgroundColor: isSelected ? 'rgba(253, 94, 15, 0.15)' : 'rgba(253, 94, 15, 0.08)',
          }}
        />
      )}
      <span
        className={`relative flex-1 truncate text-sm ${
          isSelected
            ? 'text-white font-medium'
            : isOther
              ? 'italic text-neutral-500'
              : 'text-white'
        }`}
      >
        {isOther ? page.path : smartLabel(page.path)}
      </span>
      <div className="relative flex items-center gap-2 ml-2 shrink-0">
        {!isOther && (
          <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
            {pct}%
          </span>
        )}
        <span
          className={`text-sm tabular-nums font-semibold ${
            isOther
              ? 'text-neutral-500'
              : 'text-neutral-400'
          }`}
        >
          {page.sessionCount.toLocaleString()}
        </span>
      </div>
    </button>
  )
}

function JourneyColumn({
  column,
  selectedPath,
  exitCount,
  onSelect,
}: {
  column: AggregatedStep
  selectedPath: string | undefined
  exitCount: number
  onSelect: (path: string) => void
}) {
  // Animation #2 & #3: trigger bar grow after mount
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsMounted(true))
    return () => {
      cancelAnimationFrame(raf)
      setIsMounted(false)
    }
  }, [column.pages])

  if (column.pages.length === 0 && exitCount === 0) {
    return (
      <div
        className="w-56 shrink-0"
        style={{
          animation: `col-enter 300ms var(--ease-apple) ${column.index * 50}ms backwards`,
        }}
      >
        <ColumnHeader column={column} />
        <div className="flex items-center justify-center h-16 px-2">
          <span className="text-xs text-neutral-500">
            No onward traffic
          </span>
        </div>
      </div>
    )
  }

  const maxCount = Math.max(...column.pages.map((p) => p.sessionCount), 0)

  return (
    <div
      className="w-56 shrink-0 px-3"
      style={{
        animation: `col-enter 300ms var(--ease-apple) ${column.index * 50}ms backwards`,
      }}
    >
      <ColumnHeader column={column} />
      <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
        {column.pages.map((page, rowIndex) => {
          const isOther = page.isOther
          return (
            <PageRow
              key={page.path}
              page={page}
              colIndex={column.index}
              rowIndex={rowIndex}
              columnTotal={column.visitors}
              maxCount={maxCount}
              isSelected={selectedPath === page.path}
              isOther={isOther}
              isMounted={isMounted}
              onClick={() => {
                if (!isOther) onSelect(page.path)
              }}
            />
          )
        })}
        {/* Animation #5: exit card slides in */}
        {exitCount > 0 && (
          <div
            data-col={column.index}
            data-path="(exit)"
            className="flex items-center justify-between w-full relative h-9 px-3 rounded-lg bg-red-500/15"
            style={{ animation: 'exit-reveal 300ms var(--ease-apple) backwards' }}
          >
            <div
              className="absolute top-0.5 bottom-0.5 left-0.5 rounded-md"
              style={{
                width: `calc(100% - 4px)`,
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
              }}
            />
            <span className="relative text-sm text-red-400 font-medium">
              (exit)
            </span>
            <span className="relative text-sm tabular-nums font-semibold text-red-400">
              {exitCount.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Connection Lines ───────────────────────────────────────────────

function ConnectionLines({
  containerRef,
  selections,
  columns,
  transitions,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  selections: Map<number, string>
  columns: AggregatedStep[]
  transitions: PathTransition[]
}) {
  const [lines, setLines] = useState<(LineDef & { color: string; length: number })[]>([])
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || selections.size === 0) {
      setLines([])
      return
    }

    const containerRect = container.getBoundingClientRect()
    setDimensions({
      width: container.scrollWidth,
      height: container.scrollHeight,
    })

    const newLines: (LineDef & { color: string; length: number })[] = []

    for (const [colIdx, selectedPath] of selections) {
      const nextCol = columns[colIdx + 1]
      if (!nextCol) continue

      const sourceEl = container.querySelector(
        `[data-col="${colIdx}"][data-path="${CSS.escape(selectedPath)}"]`
      ) as HTMLElement | null
      if (!sourceEl) continue

      const sourceRect = sourceEl.getBoundingClientRect()
      const sourceY =
        sourceRect.top + sourceRect.height / 2 - containerRect.top + container.scrollTop
      const sourceX = sourceRect.right - containerRect.left + container.scrollLeft + 4

      const relevantTransitions = transitions.filter(
        (t) => t.step_index === colIdx && t.from_path === selectedPath
      )

      const color = colorForColumn(colIdx)
      const maxCount = relevantTransitions.length > 0
        ? Math.max(...relevantTransitions.map((rt) => rt.session_count))
        : 1

      for (const t of relevantTransitions) {
        const destEl = container.querySelector(
          `[data-col="${colIdx + 1}"][data-path="${CSS.escape(t.to_path)}"]`
        ) as HTMLElement | null
        if (!destEl) continue

        const destRect = destEl.getBoundingClientRect()
        const destY =
          destRect.top + destRect.height / 2 - containerRect.top + container.scrollTop
        const destX = destRect.left - containerRect.left + container.scrollLeft - 4

        const weight = Math.max(1, Math.min(4, (t.session_count / maxCount) * 4))

        // Approximate bezier curve length for animation
        const dx = destX - sourceX
        const dy = destY - sourceY
        const length = Math.sqrt(dx * dx + dy * dy) * 1.2

        newLines.push({ sourceY, destY, sourceX, destX, weight, color, length })
      }

      // Draw line to exit card if it exists
      const exitEl = container.querySelector(
        `[data-col="${colIdx + 1}"][data-path="(exit)"]`
      ) as HTMLElement | null
      if (exitEl) {
        const exitRect = exitEl.getBoundingClientRect()
        const exitY =
          exitRect.top + exitRect.height / 2 - containerRect.top + container.scrollTop
        const exitX = exitRect.left - containerRect.left + container.scrollLeft
        const dx = exitX - sourceX
        const dy = exitY - sourceY
        const length = Math.sqrt(dx * dx + dy * dy) * 1.2
        newLines.push({ sourceY, destY: exitY, sourceX, destX: exitX, weight: 1, color: '#ef4444', length })
      }
    }

    setLines(newLines)
  }, [selections, columns, transitions, containerRef])

  if (lines.length === 0) return null

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      width={dimensions.width}
      height={dimensions.height}
      style={{ overflow: 'visible' }}
    >
      {lines.map((line, i) => {
        const midX = (line.sourceX + line.destX) / 2
        return (
          <path
            key={i}
            d={`M ${line.sourceX},${line.sourceY} C ${midX},${line.sourceY} ${midX},${line.destY} ${line.destX},${line.destY}`}
            stroke={line.color}
            strokeWidth={line.weight}
            strokeOpacity={0.35}
            fill="none"
            strokeDasharray={line.length}
            strokeDashoffset={line.length}
            style={{
              animation: `draw-line 400ms var(--ease-apple) ${i * 50}ms forwards`,
            }}
          />
        )
      })}
      <style>
        {`@keyframes draw-line {
          to { stroke-dashoffset: 0; }
        }`}
      </style>
    </svg>
  )
}

// ─── Exit count helper ──────────────────────────────────────────────

function getExitCount(
  colIdx: number,
  selectedPath: string,
  columns: AggregatedStep[],
  transitions: PathTransition[],
): number {
  const col = columns[colIdx]
  const page = col?.pages.find((p) => p.path === selectedPath)
  if (!page) return 0
  const outbound = transitions
    .filter((t) => t.step_index === colIdx && t.from_path === selectedPath)
    .reduce((sum, t) => sum + t.session_count, 0)
  return Math.max(0, page.sessionCount - outbound)
}

// ─── Main Component ─────────────────────────────────────────────────

export default function ColumnJourney({
  transitions,
  depth,
  maxPagesPerStep = 20,
}: ColumnJourneyProps) {
  const [selections, setSelections] = useState<Map<number, string>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)

  // Clear selections when data changes
  const transitionsKey = useMemo(
    () => transitions.length + '-' + depth,
    [transitions.length, depth]
  )
  const prevKeyRef = useRef(transitionsKey)
  if (prevKeyRef.current !== transitionsKey) {
    prevKeyRef.current = transitionsKey
    if (selections.size > 0) setSelections(new Map())
  }

  const columns = useMemo(
    () => aggregateJourney(transitions, { depth, maxPagesPerStep }),
    [transitions, depth, maxPagesPerStep]
  )


  const handleSelect = useCallback(
    (colIndex: number, path: string) => {
      setSelections((prev) => {
        const next = new Map(prev)
        if (next.get(colIndex) === path) {
          next.delete(colIndex)
        } else {
          next.set(colIndex, path)
        }
        for (const key of Array.from(next.keys())) {
          if (key > colIndex) next.delete(key)
        }
        return next
      })
    },
    []
  )

  // ─── Empty state ────────────────────────────────────────────────
  if (!transitions.length) {
    return (
      <div className="h-[400px] flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
        <img
          src="/illustrations/journey.svg"
          alt="No journey data"
          className="w-52 h-auto mb-2"
        />
        <h4 className="font-semibold text-white">
          No journey data yet
        </h4>
        <p className="text-sm text-neutral-400 max-w-xs">
          Navigation flows will appear here as visitors browse through your site.
        </p>
        <a href="/installation" target="_blank" rel="noopener noreferrer" className="mt-2 text-sm font-medium text-brand-orange hover:underline">
          View setup guide
        </a>
      </div>
    )
  }

  return (
    <div className="relative">
      <style>
        {`@keyframes col-enter {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes exit-reveal {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }`}
      </style>
      <div
        ref={containerRef}
        className="overflow-x-auto -mx-6 px-6 pb-2 relative"
      >
        <div className="flex min-w-fit py-2">
          {columns.map((col, i) => {
            const prevSelection = selections.get(col.index - 1)
            const exitCount = prevSelection
              ? getExitCount(col.index - 1, prevSelection, columns, transitions)
              : 0

            return (
              <Fragment key={col.index}>
                {i > 0 && (
                  <div className="w-px shrink-0 mx-3 bg-neutral-800" />
                )}
                <JourneyColumn
                  column={col}
                  selectedPath={selections.get(col.index)}
                  exitCount={exitCount}
                  onSelect={(path) => handleSelect(col.index, path)}
                />
              </Fragment>
            )
          })}
        </div>
        <ConnectionLines
          containerRef={containerRef}
          selections={selections}
          columns={columns}
          transitions={transitions}
        />
      </div>
    </div>
  )
}
