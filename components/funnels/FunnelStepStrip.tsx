'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CircleNotch, FileText, House } from '@phosphor-icons/react'
import type { FunnelStepStats } from '@/lib/api/funnels'
import { useFunnelBreakdown } from '@/lib/swr/dashboard'
import { getFilterValueIcon } from '@/lib/utils/icons'
import { formatNumber } from '@/lib/utils/format'
import Select from '@/components/ui/select'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'

// ---------------------------------------------------------------------------
// Step drill-down strip under the canvas: left, where the selected step's
// drop-offs went; right, a dimension breakdown (Select limited to the keys
// the backend's ValidDimension accepts). Panes height-morph on step change,
// loading follows the 150ms rule inside stable-height boxes, and empties
// only render on settled fetches.
// ---------------------------------------------------------------------------

// * All verified against pulse-backend dimensionToColumn (+ channel)
const DIMENSIONS = [
  { value: 'device', label: 'Device' },
  { value: 'country', label: 'Country' },
  { value: 'browser', label: 'Browser' },
  { value: 'os', label: 'OS' },
  { value: 'referrer', label: 'Referrer' },
  { value: 'utm_source', label: 'UTM source' },
  { value: 'channel', label: 'Channel' },
]

interface FunnelStepStripProps {
  siteId: string
  funnelId: string
  steps: FunnelStepStats[]
  /** 1-based selected step (matches ?step=). */
  selectedStep: number
  dateRange: { start: string; end: string }
  filters?: string
}

function pathGlyph(path: string) {
  const cls = 'h-4 w-4 shrink-0 text-neutral-500'
  if (path === '/') return <House className={cls} />
  return <FileText className={cls} />
}

/** 150 ms-delayed spinner for stable-height loading boxes. */
function DelayedSpinner() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 150)
    return () => clearTimeout(t)
  }, [])
  if (!visible) return null
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center">
      <CircleNotch className="h-5 w-5 animate-spin text-neutral-500" />
    </div>
  )
}

/** Animates its height to the measured content height on change. */
function HeightMorph({ children }: { children: React.ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>('auto')
  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight))
    observer.observe(el)
    setHeight(el.offsetHeight)
    return () => observer.disconnect()
  }, [])
  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
      className="overflow-hidden"
    >
      <div ref={innerRef}>{children}</div>
    </motion.div>
  )
}

function BarRow({
  icon,
  label,
  count,
  pct,
  trailing,
}: {
  icon: React.ReactNode
  label: string
  count: number
  pct: number
  trailing?: string
}) {
  return (
    <div className="relative flex h-9 items-center gap-2.5 overflow-hidden rounded-none px-2.5">
      <div
        className="absolute bottom-0.5 left-0 top-0.5 rounded-none bg-brand-orange/10"
        style={{ width: `${pct}%` }}
      />
      <span className="relative shrink-0">{icon}</span>
      <span className="relative min-w-0 flex-1 truncate text-sm text-neutral-200" title={label}>
        {label}
      </span>
      {trailing && (
        <span className="relative shrink-0 text-xs tabular-nums text-neutral-500">{trailing}</span>
      )}
      <span className="relative shrink-0 text-sm font-semibold tabular-nums text-neutral-400">
        {formatNumber(count)}
      </span>
    </div>
  )
}

export function FunnelStepStrip({
  siteId,
  funnelId,
  steps,
  selectedStep,
  dateRange,
  filters,
}: FunnelStepStripProps) {
  const [dimension, setDimension] = useState('device')
  const step = steps[selectedStep - 1]
  const {
    data: breakdown,
    error: breakdownError,
    isLoading: breakdownLoading,
    mutate: retryBreakdown,
  } = useFunnelBreakdown(
    siteId,
    funnelId,
    selectedStep - 1, // API steps are 0-based
    dimension,
    dateRange.start,
    dateRange.end,
    filters,
  )

  if (!step) return null

  const exits = step.exit_pages ?? []
  const maxExit = exits.length > 0 ? exits[0].visitors : 0
  const entries = breakdown?.entries ?? []
  const maxEntry = entries.reduce((m, e) => Math.max(m, e.visitors), 0)
  const dimensionLabel = DIMENSIONS.find((d) => d.value === dimension)?.label ?? dimension

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* Exits pane */}
      <div className="rounded-none border border-border bg-card p-4">
        <div className="mb-3 flex h-10 items-center">
          <span className="font-mono text-xs text-neutral-500">
            Where visitors went after dropping off
          </span>
        </div>
        <HeightMorph>
          {selectedStep === 1 ? (
            <p className="px-2.5 pb-2 text-sm text-neutral-500">
              Entry step — all visitors start here.
            </p>
          ) : exits.length > 0 ? (
            <div className="space-y-0.5 pb-1">
              {exits.map((ep) => (
                <BarRow
                  key={ep.path}
                  icon={pathGlyph(ep.path)}
                  label={ep.path}
                  count={ep.visitors}
                  pct={maxExit > 0 ? (ep.visitors / maxExit) * 100 : 0}
                />
              ))}
            </div>
          ) : (
            <p className="px-2.5 pb-2 text-sm text-neutral-500">
              No exit page data for this step in this period.
            </p>
          )}
        </HeightMorph>
      </div>

      {/* Breakdown pane */}
      <div className="rounded-none border border-border bg-card p-4">
        <div className="mb-3 flex h-10 items-center justify-between gap-3">
          <span className="font-mono text-xs text-neutral-500">Breakdown</span>
          <Select
            variant="input"
            className="w-40"
            value={dimension}
            onChange={setDimension}
            options={DIMENSIONS}
          />
        </div>
        <HeightMorph>
          {breakdownError ? (
            <ErrorCard
              title="Couldn't load the breakdown"
              onRetry={() => { void retryBreakdown() }}
              className="py-8"
            />
          ) : breakdownLoading && !breakdown ? (
            <DelayedSpinner />
          ) : entries.length > 0 ? (
            <div className="space-y-0.5 pb-1">
              {entries.map((entry) => (
                <BarRow
                  key={entry.value}
                  icon={getFilterValueIcon(dimension, entry.value)}
                  label={entry.value}
                  count={entry.visitors}
                  pct={maxEntry > 0 ? (entry.visitors / maxEntry) * 100 : 0}
                  trailing={`${Math.round(entry.conversion)}% conv`}
                />
              ))}
            </div>
          ) : (
            <p className="px-2.5 pb-2 text-sm text-neutral-500">
              No {dimensionLabel.toLowerCase()} data for this step in this period.
            </p>
          )}
        </HeightMorph>
      </div>
    </div>
  )
}
