'use client'

import type { FrustrationSummary } from '@/lib/api/stats'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { guardedPctChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { formatNumber } from '@/lib/utils/format'

// ---------------------------------------------------------------------------
// Behavior KPI band — dashboard KPI language (mono micro label, large tabular
// AnimatedNumber, guarded delta). Frustration is an INVERTED metric: more
// signals is worse, so an increase is red and a decrease is green. The guard
// (min base 10) silences the noisy -100%-on-zero-base deltas.
// ---------------------------------------------------------------------------

function DeltaBadge({ change }: { change: PctChangeResult }) {
  // * Guard returns null on a tiny base — show nothing. There is no "New" pill:
  // * the delta's base equals the previous value, so 'new' can never surface.
  if (!change || change.type !== 'pct') return null
  if (change.value === 0) {
    return <span className="text-xs tabular-nums text-neutral-500">0%</span>
  }
  const up = change.value > 0
  return (
    <span className={`text-xs font-medium tabular-nums ${up ? 'text-red-400' : 'text-green-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(change.value)}%
    </span>
  )
}

function KpiCard({
  label,
  value,
  meta,
  metaTitle,
  delta,
}: {
  label: string
  value: number
  meta: string
  metaTitle?: string
  delta: PctChangeResult
}) {
  return (
    <div className="rounded-none border border-border bg-card p-4">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="text-xs text-neutral-500">{label}</span>
        <DeltaBadge change={delta} />
      </div>
      <AnimatedNumber
        value={value}
        format={(v) => formatNumber(Math.round(v))}
        className="text-2xl font-semibold tabular-nums text-white"
      />
      <p className="mt-1 truncate text-xs text-neutral-500" title={metaTitle}>
        {meta}
      </p>
    </div>
  )
}

export default function FrustrationSummaryCards({ data }: { data: FrustrationSummary }) {
  const totalSignals = data.rage_clicks + data.dead_clicks
  const prevTotal = data.prev_rage_clicks + data.prev_dead_clicks
  const topPage = data.rage_top_page || data.dead_top_page

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <KpiCard
        label="Rage clicks"
        value={data.rage_clicks}
        meta={`${formatNumber(data.rage_unique_elements)} unique elements`}
        delta={guardedPctChange(data.rage_clicks, data.prev_rage_clicks, data.prev_rage_clicks)}
      />
      <KpiCard
        label="Dead clicks"
        value={data.dead_clicks}
        meta={`${formatNumber(data.dead_unique_elements)} unique elements`}
        delta={guardedPctChange(data.dead_clicks, data.prev_dead_clicks, data.prev_dead_clicks)}
      />
      <KpiCard
        label="Total signals"
        value={totalSignals}
        meta={topPage ? `Top page: ${topPage}` : 'No signals in this period'}
        metaTitle={topPage || undefined}
        delta={guardedPctChange(totalSignals, prevTotal, prevTotal)}
      />
    </div>
  )
}
