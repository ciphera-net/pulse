'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, CircleNotch, FileText, House } from '@phosphor-icons/react'
import type { FunnelStepStats } from '@/lib/api/funnels'
import { useFunnelBreakdown } from '@/lib/swr/dashboard'
import { getFilterValueIcon } from '@/lib/utils/icons'
import { formatNumber } from '@/lib/utils/format'
import Select from '@/components/ui/select'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import { formatFunnelPct } from './FunnelColumns'

// ---------------------------------------------------------------------------
// The two panes under the funnel columns (31-08 overhaul):
//
//   Drop-off — WHERE the selected step's drop-offs went. The header NAMES the
//              step it describes (the old generic header forced a mental
//              cross-reference to a 40%-opacity ring 500px above), and the
//              page defaults selection to the biggest drop-off step.
//   Breakdown — FUNNEL-scoped: each segment's end-to-end conversion (entered →
//              completed). It used to follow the selected step, which made the
//              default view a tautology — "conversion to step 1" is 100% by
//              definition, and prod rendered "desktop · 100% conv" beside a 4%
//              funnel. All backend-valid dimensions are offered.
//
// Panes height-morph on step change, loading follows the 150ms rule inside
// stable-height boxes, and empties only render on settled fetches.
// ---------------------------------------------------------------------------

// * Every key the backend's ValidDimension accepts (dimensionToColumn +
// * channel) — owner decision 30-08-2026: offer all of them, not a curated 7.
const DIMENSIONS = [
  { value: 'device', label: 'Device' },
  { value: 'browser', label: 'Browser' },
  { value: 'os', label: 'OS' },
  { value: 'country', label: 'Country' },
  { value: 'region', label: 'Region' },
  { value: 'city', label: 'City' },
  { value: 'language', label: 'Language' },
  { value: 'timezone', label: 'Timezone' },
  { value: 'screen_resolution', label: 'Screen size' },
  { value: 'referrer', label: 'Referrer' },
  { value: 'channel', label: 'Channel' },
  { value: 'page', label: 'Entry page' },
  { value: 'event_name', label: 'Entry event' },
  { value: 'utm_source', label: 'UTM source' },
  { value: 'utm_medium', label: 'UTM medium' },
  { value: 'utm_campaign', label: 'UTM campaign' },
  { value: 'utm_term', label: 'UTM term' },
  { value: 'utm_content', label: 'UTM content' },
]

interface FunnelStepStripProps {
  siteId: string
  funnelId: string
  steps: FunnelStepStats[]
  /** 1-based selected step (matches ?step=) — scopes the Drop-off pane only. */
  selectedStep: number
  dateRange: { start: string; end: string }
  filters?: string
  /** Bumped after an edit so both panes refetch immediately (their SWR keys
   *  otherwise only carry ids and range — a step change would go stale for a
   *  poll cycle). */
  editEpoch?: number
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
  count: number | null
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
        {count != null ? formatNumber(count) : '—'}
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
  editEpoch,
}: FunnelStepStripProps) {
  const [dimension, setDimension] = useState('device')
  const step = steps[selectedStep - 1]
  // * Breakdown target is ALWAYS the final step: entered → completed per
  // * segment, end to end. (0-based on the wire.)
  const {
    data: breakdown,
    error: breakdownError,
    isLoading: breakdownLoading,
    mutate: retryBreakdown,
  } = useFunnelBreakdown(
    siteId,
    funnelId,
    steps.length - 1,
    dimension,
    dateRange.start,
    dateRange.end,
    filters,
    editEpoch,
  )

  if (!step) return null

  const exits = step.exit_pages ?? []
  const maxExit = exits.length > 0 ? exits[0].visitors : 0
  // How many reached this step but not the next — the population whose exit
  // pages the backend looks up. Zero means there was nothing to look for,
  // which is not the same as looking and finding nothing.
  const dropped = Math.max(0, step.visitors - (steps[selectedStep]?.visitors ?? 0))
  const entries = breakdown?.entries ?? []
  const maxEntry = entries.reduce((m, e) => Math.max(m, e.visitors ?? 0), 0)
  const dimensionLabel = DIMENSIONS.find((d) => d.value === dimension)?.label ?? dimension
  const isFinalStep = selectedStep === steps.length

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* Drop-off pane — scoped to the selected step, and it says so */}
      <div className="rounded-none border border-border bg-card p-4">
        <div className="mb-3 flex h-10 items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1 text-xs text-neutral-500">
            <span className="truncate">
              Drop-off · after step {selectedStep} ·{' '}
              <span className="font-mono text-neutral-400" title={step.step.value}>
                {step.step.value}
              </span>
            </span>
            <TermInfoTip term="funnel_exit_pages" />
          </span>
          {step.step.category !== 'event' && step.step.type === 'exact' && (
            <Link
              href={`/sites/${siteId}/journeys?entry=${encodeURIComponent(step.step.value)}`}
              className="inline-flex shrink-0 items-center gap-1 text-xs text-neutral-500 transition-colors duration-fast ease-apple hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
            >
              View journeys from here
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
        <HeightMorph>
          {isFinalStep ? (
            // The final step has no onward drop-off — the backend never
            // queries exit pages for it, so the generic "no data" line would
            // present a non-measurement as an empty measurement (F3).
            <p className="px-2.5 pb-2 text-sm text-neutral-500">
              Final step — completions end here, so there is no drop-off to follow.
            </p>
          ) : dropped === 0 ? (
            // Nobody dropped off this step, so there was nothing to follow —
            // also a non-measurement, and distinct from "we looked and found
            // nothing" (same F3 rule as the final step above).
            <p className="px-2.5 pb-2 text-sm text-neutral-500">
              Everyone who reached this step continued, so there is no drop-off to follow.
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

      {/* Breakdown pane — funnel-scoped conversion per segment */}
      <div className="rounded-none border border-border bg-card p-4">
        <div className="mb-3 flex h-10 items-center justify-between gap-3">
          <span className="flex items-center gap-1 text-xs text-neutral-500">
            Breakdown · funnel conversion
            <TermInfoTip term="funnel_breakdown_floor" />
          </span>
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
                  // Sub-floor values are withheld as WHOLE ROWS server-side
                  // (26-08 ruling) — nothing here is ever floored; the null
                  // guards survive only as wire-robustness.
                  pct={entry.visitors != null && maxEntry > 0 ? (entry.visitors / maxEntry) * 100 : 0}
                  trailing={entry.conversion != null ? `${formatFunnelPct(entry.conversion)} conv` : '—'}
                />
              ))}
            </div>
          ) : (
            <p className="px-2.5 pb-2 text-sm text-neutral-500">
              No {dimensionLabel.toLowerCase()} data for this funnel in this period.
            </p>
          )}
        </HeightMorph>
      </div>
    </div>
  )
}
