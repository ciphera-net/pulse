'use client'

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  selections: Map<number, string>,
): Column[] {
  const numCols = depth + 1
  const columns: Column[] = []

  // Build a filtered transitions set based on selections
  // For each column N with a selection, only keep transitions at step_index=N
  // where from_path matches the selection
  let filteredTransitions = transitions

  for (let col = 0; col < numCols - 1; col++) {
    const selected = selections.get(col)
    if (selected) {
      filteredTransitions = filteredTransitions.filter(
        (t) => t.step_index !== col || t.from_path === selected
      )
    }
  }

  for (let col = 0; col < numCols; col++) {
    const pageMap = new Map<string, number>()

    if (col === 0) {
      // Column 0: aggregate from_path across step_index=0
      for (const t of filteredTransitions) {
        if (t.step_index === 0) {
          pageMap.set(t.from_path, (pageMap.get(t.from_path) ?? 0) + t.session_count)
        }
      }
    } else {
      // Column N: aggregate to_path across step_index=N-1
      for (const t of filteredTransitions) {
        if (t.step_index === col - 1) {
          pageMap.set(t.to_path, (pageMap.get(t.to_path) ?? 0) + t.session_count)
        }
      }
    }

    // Sort descending by count
    let pages = Array.from(pageMap.entries())
      .map(([path, sessionCount]) => ({ path, sessionCount }))
      .sort((a, b) => b.sessionCount - a.sessionCount)

    // Cap and merge into (other)
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
    <div className="flex items-center gap-2.5 mb-3 px-1">
      <span
        className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white shrink-0"
        style={{ backgroundColor: color }}
      >
        {column.index + 1}
      </span>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-sm font-semibold text-neutral-900 dark:text-white whitespace-nowrap">
          {column.totalSessions.toLocaleString()}
        </span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
          visitors
        </span>
        {column.dropOffPercent !== 0 && (
          <span
            className={`text-xs font-medium whitespace-nowrap ${
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
        h-9 px-2 rounded-lg text-left transition-colors
        ${isOther ? 'cursor-default' : 'cursor-pointer'}
        ${
          isSelected
            ? 'bg-brand-orange/10 dark:bg-brand-orange/15 ring-1 ring-brand-orange/30'
            : isOther
              ? ''
              : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
        }
      `}
    >
      <span
        className={`flex-1 truncate text-sm ${
          isOther
            ? 'italic text-neutral-400 dark:text-neutral-500'
            : 'text-neutral-900 dark:text-white'
        }`}
      >
        {isOther ? page.path : smartLabel(page.path)}
      </span>
      <div className="flex items-center gap-2 ml-2 shrink-0">
        {!isOther && (
          <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150">
            {pct}%
          </span>
        )}
        <span
          className={`text-xs tabular-nums font-medium ${
            isOther
              ? 'text-neutral-400 dark:text-neutral-500'
              : 'text-neutral-500 dark:text-neutral-400'
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
      <div className="w-52 shrink-0">
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
    <div className="w-52 shrink-0">
      <ColumnHeader column={column} color={color} />
      <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
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

    const newLines: (LineDef & { color: string })[] = []

    for (const [colIdx, selectedPath] of selections) {
      const nextCol = columns[colIdx + 1]
      if (!nextCol) continue

      // Find the source row element
      const sourceEl = container.querySelector(
        `[data-col="${colIdx}"][data-path="${CSS.escape(selectedPath)}"]`
      ) as HTMLElement | null
      if (!sourceEl) continue

      const sourceRect = sourceEl.getBoundingClientRect()
      const sourceY =
        sourceRect.top + sourceRect.height / 2 - containerRect.top + container.scrollTop
      const sourceX = sourceRect.right - containerRect.left + container.scrollLeft

      // Find matching transitions
      const relevantTransitions = transitions.filter(
        (t) => t.step_index === colIdx && t.from_path === selectedPath
      )

      const color = colorForColumn(colIdx)

      for (const t of relevantTransitions) {
        const destEl = container.querySelector(
          `[data-col="${colIdx + 1}"][data-path="${CSS.escape(t.to_path)}"]`
        ) as HTMLElement | null
        if (!destEl) continue

        const destRect = destEl.getBoundingClientRect()
        const destY =
          destRect.top + destRect.height / 2 - containerRect.top + container.scrollTop
        const destX = destRect.left - containerRect.left + container.scrollLeft

        const maxCount = Math.max(...relevantTransitions.map((rt) => rt.session_count))
        const weight = Math.max(1, Math.min(4, (t.session_count / maxCount) * 4))

        newLines.push({ sourceY, destY, sourceX, destX, weight, color })
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
            strokeOpacity={0.3}
            fill="none"
          />
        )
      })}
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
    () => buildColumns(transitions, depth, selections),
    [transitions, depth, selections]
  )

  const handleSelect = useCallback(
    (colIndex: number, path: string) => {
      // Column 0 click → set entry path filter (API-level)
      if (colIndex === 0 && onNodeClick) {
        onNodeClick(path)
        return
      }

      setSelections((prev) => {
        const next = new Map(prev)
        // Toggle: click same page deselects
        if (next.get(colIndex) === path) {
          next.delete(colIndex)
        } else {
          next.set(colIndex, path)
        }
        // Clear all selections after this column
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
        <div className="flex gap-6 min-w-fit py-2">
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
    </div>
  )
}
