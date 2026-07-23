'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { CaretRight, FileText, House, Lightning, PencilSimple, Trash } from '@phosphor-icons/react'
import type { Funnel, FunnelStep } from '@/lib/api/funnels'
import { useFunnelStats, useFunnelTrends } from '@/lib/swr/dashboard'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { guardedPctChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { previousDateRange } from '@/lib/hooks/periodUrl'

// ---------------------------------------------------------------------------
// Funnels list row — the whole card is a link to the funnel detail route;
// edit/delete are hover/focus-revealed SIBLINGS (absolutely positioned), never
// nested inside the link. Step chips show the real targets (custom names keep
// the value in title), the conversion % is plain white with a tiny-base-
// guarded delta, and the right rail carries a lazy 96×28 trend sparkline.
// ---------------------------------------------------------------------------

interface FunnelSummaryCardProps {
  funnel: Funnel
  siteId: string
  dateRange: { start: string; end: string }
  /** Current ?period/start/end query (with leading `?`) carried into the detail link. */
  hrefQuery: string
  canManage: boolean
  onEdit: (funnel: Funnel) => void
  onDelete: (funnel: { id: string; name: string }) => void
}

function stepGlyph(step: FunnelStep) {
  const cls = 'h-3.5 w-3.5 shrink-0 text-neutral-500'
  if (step.category === 'event') return <Lightning className={cls} />
  if (step.value === '/') return <House className={cls} />
  return <FileText className={cls} />
}

function stepLabel(step: FunnelStep): string {
  // * Default names are "Step N" — show the real target instead.
  return /^Step \d+$/.test(step.name) ? step.value : step.name
}

function DeltaBadge({ change }: { change: PctChangeResult }) {
  if (!change) return null
  if (change.type === 'new') {
    return (
      <span className="rounded-none bg-brand-orange/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-orange">
        New
      </span>
    )
  }
  const positive = change.value > 0
  return (
    <span className={`text-xs font-medium tabular-nums ${positive ? 'text-green-400' : 'text-red-400'}`}>
      {positive ? '+' : ''}{change.value}% vs prev
    </span>
  )
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 96
  const h = 28
  const pad = 2
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2)
      const y = h - pad - ((v - min) / span) * (h - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} aria-hidden="true" className="shrink-0">
      <polyline points={points} fill="none" stroke="#FD5E0F" strokeWidth={1.5} />
    </svg>
  )
}

export function FunnelSummaryCard({
  funnel,
  siteId,
  dateRange,
  hrefQuery,
  canManage,
  onEdit,
  onDelete,
}: FunnelSummaryCardProps) {
  const { data: stats, error: statsError } = useFunnelStats(
    siteId,
    funnel.id,
    dateRange.start,
    dateRange.end,
  )

  const prevRange = useMemo(() => previousDateRange(dateRange), [dateRange])

  const { data: prevStats } = useFunnelStats(
    siteId,
    funnel.id,
    prevRange?.start ?? '',
    prevRange?.end ?? '',
  )
  const { data: trends } = useFunnelTrends(siteId, funnel.id, dateRange.start, dateRange.end)

  const conversion = stats?.steps.length ? stats.steps[stats.steps.length - 1].conversion : null
  const prevConversion = prevStats?.steps.length
    ? prevStats.steps[prevStats.steps.length - 1].conversion
    : 0
  const prevVisitors = prevStats?.steps[0]?.visitors ?? 0
  const delta =
    conversion !== null && prevStats
      ? guardedPctChange(conversion, prevConversion, prevVisitors)
      : null

  const windowChip = `${funnel.conversion_window_value}${funnel.conversion_window_unit === 'hours' ? 'h' : 'd'} window`

  return (
    <div className="group relative">
      <Link
        href={`/sites/${siteId}/funnels/${funnel.id}${hrefQuery}`}
        className="block rounded-none border border-border bg-card p-5 transition-colors duration-fast ease-apple hover:border-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            {/* Row 1: name + meta chips (actions overlay reserves the right edge) */}
            <div className="flex items-center gap-3 pr-20">
              <h3 className="truncate text-base font-semibold text-white">{funnel.name}</h3>
              <span className="shrink-0 text-xs text-neutral-500">
                {funnel.steps.length} steps · {windowChip}
              </span>
            </div>

            {/* Row 2: real step targets */}
            <div className="mt-2.5 flex flex-wrap items-center gap-y-1.5">
              {funnel.steps.map((step, i) => (
                <span key={`${step.value}-${i}`} className="flex items-center">
                  <span
                    title={step.value}
                    className="inline-flex max-w-56 items-center gap-1.5 rounded-none border border-neutral-800 px-2 py-0.5"
                  >
                    {stepGlyph(step)}
                    <span className="truncate text-xs text-neutral-300">{stepLabel(step)}</span>
                  </span>
                  {i < funnel.steps.length - 1 && (
                    <CaretRight className="mx-1 h-3 w-3 shrink-0 text-neutral-600" />
                  )}
                </span>
              ))}
            </div>

            {/* Row 3: description */}
            {funnel.description && (
              <p className="mt-2 truncate text-sm text-neutral-400">{funnel.description}</p>
            )}
          </div>

          {/* Right rail: conversion + delta + sparkline */}
          <div className="flex shrink-0 items-center gap-5 sm:pr-2 sm:pt-1">
            <div className="flex flex-col items-start gap-0.5 sm:items-end">
              {conversion !== null ? (
                <AnimatedNumber
                  value={conversion}
                  format={(v) => `${Math.round(v)}%`}
                  className="text-xl font-semibold tabular-nums text-white"
                />
              ) : (
                <span
                  className="text-xl font-semibold text-neutral-600"
                  title={statsError ? 'Couldn’t load stats' : 'Loading…'}
                >
                  —
                </span>
              )}
              <DeltaBadge change={delta} />
            </div>
            <Sparkline values={trends?.overall ?? []} />
          </div>
        </div>
      </Link>

      {/* Hover/focus actions — siblings of the link, never nested interactive */}
      {canManage && (
        <div className="absolute right-4 top-4 flex items-center gap-1 opacity-0 transition-opacity duration-fast ease-apple focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            aria-label={`Edit ${funnel.name}`}
            onClick={() => onEdit(funnel)}
            className="rounded-none border border-neutral-800 bg-card p-2 text-neutral-400 transition-colors duration-fast ease-apple hover:border-neutral-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
          >
            <PencilSimple className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${funnel.name}`}
            onClick={() => onDelete({ id: funnel.id, name: funnel.name })}
            className="rounded-none border border-neutral-800 bg-card p-2 text-neutral-400 transition-colors duration-fast ease-apple hover:border-red-500/50 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
          >
            <Trash className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
