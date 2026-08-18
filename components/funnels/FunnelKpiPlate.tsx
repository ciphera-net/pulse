'use client'

import { useMemo } from 'react'
import type { FunnelStats } from '@/lib/api/funnels'
import { formatNumber, formatConvertTime } from '@/lib/utils/format'
import { guardedPctChange, guardedPointChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { FunnelRail } from './FunnelRail'

// ---------------------------------------------------------------------------
// The KPI plate — the five headline figures fused into ONE bordered plate of
// hairline-divided rails (the CDN/Search instrument grammar), replacing five
// separate boxes. Rates render an em dash when there is no population; the
// whole plate ghosts to dashes while stats load.
// ---------------------------------------------------------------------------

export function FunnelKpiPlate({
  stats,
  prevStats,
  statsError,
}: {
  stats?: FunnelStats
  prevStats?: FunnelStats
  statsError?: boolean
}) {
  const m = useMemo(() => {
    const last = stats?.steps.length ? stats.steps[stats.steps.length - 1] : null
    const prevLast = prevStats?.steps.length ? prevStats.steps[prevStats.steps.length - 1] : null
    const entered = stats?.steps[0]?.visitors ?? null
    const prevEntered = prevStats?.steps[0]?.visitors ?? 0
    const conversion = last?.conversion ?? null
    const prevConversion = prevLast?.conversion ?? null

    // Biggest drop-off: the largest measured (non-null) per-step dropoff.
    const worst = stats?.steps.reduce<{ value: string; dropoff: number } | null>((acc, step, i) => {
      if (i === 0 || step.dropoff == null) return acc
      if (!acc || step.dropoff > acc.dropoff) return { value: step.step.value, dropoff: step.dropoff }
      return acc
    }, null)

    return {
      conversion: conversion != null ? `${Math.round(conversion)}%` : '—',
      conversionDelta:
        conversion != null && prevConversion != null
          ? guardedPointChange(conversion, prevConversion, prevEntered)
          : (null as PctChangeResult),
      conversionContext:
        entered == null ? undefined : entered > 0 ? `${last?.visitors ?? 0} of ${formatNumber(entered)} entered` : 'no visitors entered',
      entered: entered != null ? formatNumber(entered) : '—',
      enteredDelta: entered != null && prevStats ? guardedPctChange(entered, prevEntered, prevEntered) : null,
      converted: stats ? formatNumber(last?.visitors ?? 0) : '—',
      convertedDelta:
        stats && prevStats ? guardedPctChange(last?.visitors ?? 0, prevLast?.visitors ?? 0, prevEntered) : null,
      drop: worst ? `${Math.round(worst.dropoff)}%` : '—',
      dropContext: worst?.value,
      median: stats?.median_convert_seconds != null ? formatConvertTime(stats.median_convert_seconds) : '—',
    }
  }, [stats, prevStats])

  const cell = 'border-border max-md:odd:border-r max-md:[&:nth-child(-n+4)]:border-b md:border-r md:last:border-r-0'

  return (
    <div
      className="grid grid-cols-2 rounded-none border border-border bg-card md:grid-cols-5"
      title={statsError ? 'Couldn’t load stats' : undefined}
    >
      <FunnelRail label="Conversion" value={m.conversion} delta={m.conversionDelta} context={m.conversionContext} className={cell} />
      <FunnelRail label="Visitors" value={m.entered} delta={m.enteredDelta} context="entered the funnel" className={cell} />
      <FunnelRail label="Converted" value={m.converted} delta={m.convertedDelta} context="completed every step" className={cell} />
      <FunnelRail label="Biggest drop-off" value={m.drop} context={m.dropContext} className={cell} />
      <FunnelRail label="Median time" value={m.median} context="entry → conversion" className={cell} />
    </div>
  )
}
