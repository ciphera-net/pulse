'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TreeStructure } from '@phosphor-icons/react'
import type { PathTransition } from '@/lib/api/journeys'

// ─── Types ──────────────────────────────────────────────────────────

interface ColumnJourneyProps {
  transitions: PathTransition[]
  totalSessions: number
  depth: number
  onNodeClick?: (path: string) => void
}

interface ColumnPage {
  path: string
  sessionCount: number
}

interface Column {
  index: number
  totalSessions: number
  dropOffPercent: number
  pages: ColumnPage[]
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
const MAX_NODES_PER_COLUMN = 10

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

// ─── Data transformation ────────────────────────────────────────────

function buildColumns(
  transitions: PathTransition[],
  depth: number,
): Column[] {
  const numCols = depth + 1
  const columns: Column[] = []

  for (let col = 0; col < numCols; col++) {
    const pageMap = new Map<string, number>()

    if (col === 0) {
      for (const t of transitions) {
        if (t.step_index === 0) {
          pageMap.set(t.from_path, (pageMap.get(t.from_path) ?? 0) + t.session_count)
        }
      }
    } else {
      for (const t of transitions) {
        if (t.step_index === col - 1) {
          pageMap.set(t.to_path, (pageMap.get(t.to_path) ?? 0) + t.session_count)
        }
      }
    }

    let pages = Array.from(pageMap.entries())
      .map(([path, sessionCount]) => ({ path, sessionCount }))
      .sort((a, b) => b.sessionCount - a.sessionCount)

    if (pages.length > MAX_NODES_PER_COLUMN) {
      const kept = pages.slice(0, MAX_NODES_PER_COLUMN)
      const otherCount = pages
        .slice(MAX_NODES_PER_COLUMN)
        .reduce((sum, p) => sum + p.sessionCount, 0)
      kept.push({ path: '(other)', sessionCount: otherCount })
      pages = kept
    }

    const totalSessions = pages.reduce((sum, p) => sum + p.sessionCount, 0)
    const prevTotal = col > 0 ? columns[col - 1].totalSessions : totalSessions
    const dropOffPercent =
      col === 0 || prevTotal === 0
        ? 0
        : Math.round(((totalSessions - prevTotal) / prevTotal) * 100)

    columns.push({ index: col, totalSessions, dropOffPercent, pages })
  }

  // Trim empty trailing columns
  while (columns.length > 1 && columns[columns.length - 1].pages.length === 0) {
    columns.pop()
  }

  return columns
}

// ─── Sub-components ─────────────────────────────────────────────────

function ColumnHeader({
  column,
  color,
}: {
  column: Column
  color: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 mb-4">
      <span
        className="flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {column.index + 1}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-neutral-900 dark:text-white">
          {column.totalSessions.toLocaleString()} visitors
        </span>
        {column.dropOffPercent !== 0 && (
          <span
            className={`text-sm font-semibold ${
              column.dropOffPercent < 0 ? 'text-red-500' : 'text-emerald-500'
            }`}
          >
            {column.dropOffPercent > 0 ? '+' : ''}
            {column.dropOffPercent}%
          </span>
        )}
      </div>
    </div>
  )
}

function PageRow({
  page,
  colIndex,
  columnTotal,
  isSelected,
  isOther,
  onClick,
}: {
  page: ColumnPage
  colIndex: number
  columnTotal: number
  isSelected: boolean
  isOther: boolean
  onClick: () => void
}) {
  const pct = columnTotal > 0 ? Math.round((page.sessionCount / columnTotal) * 100) : 0

  return (
    <button
      type="button"
      disabled={isOther}
      onClick={onClick}
      title={page.path}
      data-col={colIndex}
      data-path={page.path}
      className={`
        group flex items-center justify-between w-full
        px-3 py-2.5 rounded-lg text-left transition-all
        ${isOther ? 'cursor-default' : 'cursor-pointer'}
        ${
          isSelected
            ? 'bg-neutral-900 dark:bg-white border border-neutral-900 dark:border-white'
            : isOther
              ? 'border border-neutral-100 dark:border-neutral-800'
              : 'border border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 hover:shadow-sm'
        }
      `}
    >
      <span
        className={`flex-1 truncate text-sm ${
          isSelected
            ? 'text-white dark:text-neutral-900 font-medium'
            : isOther
              ? 'italic text-neutral-400 dark:text-neutral-500'
              : 'text-neutral-700 dark:text-neutral-200'
        }`}
      >
        {isOther ? page.path : smartLabel(page.path)}
      </span>
      <span
        className={`ml-3 shrink-0 text-sm tabular-nums font-semibold ${
          isSelected
            ? 'text-white dark:text-neutral-900'
            : isOther
              ? 'text-neutral-400 dark:text-neutral-500'
              : 'text-neutral-900 dark:text-white'
        }`}
      >
        {page.sessionCount.toLocaleString()}
      </span>
    </button>
  )
}

function JourneyColumn({
  column,
  color,
  selectedPath,
  onSelect,
}: {
  column: Column
  color: string
  selectedPath: string | undefined
  onSelect: (path: string) => void
}) {
  if (column.pages.length === 0) {
    return (
      <div className="w-60 shrink-0">
        <ColumnHeader column={column} color={color} />
        <div className="flex items-center justify-center h-20 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-700">
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            No onward traffic
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-60 shrink-0">
      <ColumnHeader column={column} color={color} />
      <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
        {column.pages.map((page) => {
          const isOther = page.path === '(other)'
          return (
            <PageRow
              key={page.path}
              page={page}
              colIndex={column.index}
              columnTotal={column.totalSessions}
              isSelected={selectedPath === page.path}
              isOther={isOther}
              onClick={() => {
                if (!isOther) onSelect(page.path)
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── Connection Lines ───────────────────────────────────────────────

interface ExitLabel {
  x: number
  y: number
  count: number
  color: string
}

function ConnectionLines({
  containerRef,
  selections,
  columns,
  transitions,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  selections: Map<number, string>
  columns: Column[]
  transitions: PathTransition[]
}) {
  const [lines, setLines] = useState<(LineDef & { color: string })[]>([])
  const [exits, setExits] = useState<ExitLabel[]>([])
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || selections.size === 0) {
      setLines([])
      setExits([])
      return
    }

    const containerRect = container.getBoundingClientRect()
    setDimensions({
      width: container.scrollWidth,
      height: container.scrollHeight,
    })

    const newLines: (LineDef & { color: string })[] = []
    const newExits: ExitLabel[] = []

    for (const [colIdx, selectedPath] of selections) {
      const nextCol = columns[colIdx + 1]

      const sourceEl = container.querySelector(
        `[data-col="${colIdx}"][data-path="${CSS.escape(selectedPath)}"]`
      ) as HTMLElement | null
      if (!sourceEl) continue

      const sourceRect = sourceEl.getBoundingClientRect()
      const sourceY =
        sourceRect.top + sourceRect.height / 2 - containerRect.top + container.scrollTop
      const sourceX = sourceRect.right - containerRect.left + container.scrollLeft

      const relevantTransitions = transitions.filter(
        (t) => t.step_index === colIdx && t.from_path === selectedPath
      )

      const color = colorForColumn(colIdx)

      // Find total sessions for this page
      const col = columns[colIdx]
      const page = col?.pages.find((p) => p.path === selectedPath)
      const pageCount = page?.sessionCount ?? 0
      const outboundCount = relevantTransitions.reduce((sum, t) => sum + t.session_count, 0)
      const exitCount = pageCount - outboundCount

      if (nextCol) {
        const maxCount = Math.max(
          ...relevantTransitions.map((rt) => rt.session_count),
          exitCount > 0 ? exitCount : 0
        )

        for (const t of relevantTransitions) {
          const destEl = container.querySelector(
            `[data-col="${colIdx + 1}"][data-path="${CSS.escape(t.to_path)}"]`
          ) as HTMLElement | null
          if (!destEl) continue

          const destRect = destEl.getBoundingClientRect()
          const destY =
            destRect.top + destRect.height / 2 - containerRect.top + container.scrollTop
          const destX = destRect.left - containerRect.left + container.scrollLeft

          const weight = maxCount > 0
            ? Math.max(1, Math.min(4, (t.session_count / maxCount) * 4))
            : 1

          newLines.push({ sourceY, destY, sourceX, destX, weight, color })
        }
      }

      // Show exit if any visitors dropped off
      if (exitCount > 0) {
        // Position the exit label below the last destination or below the source
        const lastDestY = newLines.length > 0
          ? Math.max(...newLines.filter((l) => l.sourceX === sourceX).map((l) => l.destY))
          : sourceY

        const exitY = lastDestY + 30
        const exitX = nextCol
          ? ((): number => {
              // Find the left edge of the next column
              const nextColEl = container.querySelector(`[data-col="${colIdx + 1}"]`) as HTMLElement | null
              if (nextColEl) {
                const nextRect = nextColEl.getBoundingClientRect()
                return nextRect.left - containerRect.left + container.scrollLeft
              }
              return sourceX + 100
            })()
          : sourceX + 100

        newLines.push({
          sourceY,
          destY: exitY,
          sourceX,
          destX: exitX,
          weight: 1,
          color: '#52525b', // EXIT_GREY
        })

        newExits.push({ x: exitX, y: exitY, count: exitCount, color: '#52525b' })
      }
    }

    setLines(newLines)
    setExits(newExits)
  }, [selections, columns, transitions, containerRef])

  if (lines.length === 0 && exits.length === 0) return null

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
          />
        )
      })}
      {exits.map((exit, i) => (
        <g key={`exit-${i}`}>
          <text
            x={exit.x + 4}
            y={exit.y + 4}
            fontSize={11}
            fontFamily="system-ui, -apple-system, sans-serif"
            fill={exit.color}
          >
            (exit) {exit.count}
          </text>
        </g>
      ))}
    </svg>
  )
}

// ─── Main Component ─────────────────────────────────────────────────

export default function ColumnJourney({
  transitions,
  totalSessions,
  depth,
  onNodeClick,
}: ColumnJourneyProps) {
  const [selections, setSelections] = useState<Map<number, string>>(new Map())
  const [canScrollRight, setCanScrollRight] = useState(false)
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
    () => buildColumns(transitions, depth),
    [transitions, depth]
  )

  // Check if there's scrollable content to the right
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function check() {
      if (!el) return
      setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 1)
    }

    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', check)
      ro.disconnect()
    }
  }, [columns])

  const handleSelect = useCallback(
    (colIndex: number, path: string) => {
      if (colIndex === 0 && onNodeClick) {
        onNodeClick(path)
        return
      }

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
    [onNodeClick]
  )

  // ─── Empty state ────────────────────────────────────────────────
  if (!transitions.length) {
    return (
      <div className="h-[400px] flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
        <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
          <TreeStructure className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
        </div>
        <h4 className="font-semibold text-neutral-900 dark:text-white">
          No journey data yet
        </h4>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
          Navigation flows will appear here as visitors browse through your site.
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="overflow-x-auto -mx-6 px-6 pb-2 relative"
      >
        <div className="flex gap-8 min-w-fit py-2">
          {columns.map((col) => (
            <JourneyColumn
              key={col.index}
              column={col}
              color={colorForColumn(col.index)}
              selectedPath={selections.get(col.index)}
              onSelect={(path) => handleSelect(col.index, path)}
            />
          ))}
        </div>
        <ConnectionLines
          containerRef={containerRef}
          selections={selections}
          columns={columns}
          transitions={transitions}
        />
      </div>
      {/* Scroll fade indicator */}
      {canScrollRight && (
        <div className="absolute top-0 right-0 bottom-0 w-10 pointer-events-none bg-gradient-to-l from-white/90 dark:from-neutral-900/90 to-transparent" />
      )}
    </div>
  )
}
