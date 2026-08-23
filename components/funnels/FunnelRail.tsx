'use client'

import { cn } from '@/lib/utils'
import type { PctChangeResult } from '@/lib/utils/pctChange'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'

// ---------------------------------------------------------------------------
// The funnels rail — one metric cell in the estate's instrument grammar
// (CDN/Search): orange left edge, label with the delta beside it, big tabular
// value, one quiet context line. Used by the KPI plate and the Daily
// instrument so the two devices cannot drift apart.
//
// A rail showing an em dash has NO measurement — a delta or context line
// beside it would grade something that does not exist.
// ---------------------------------------------------------------------------

export function RailDelta({ change, invert = false }: { change: PctChangeResult; invert?: boolean }) {
  if (!change || change.type === 'new') return null
  const positive = change.value > 0
  const unit = change.type === 'pp' ? 'pp' : '%'
  // The arrow always encodes the NUMBER's direction; `invert` flips only the
  // COLOR, for metrics where up is bad (bounce rate: ↑2pp renders red).
  const good = invert ? !positive : positive
  return (
    <span className={cn('shrink-0 text-[11px] font-medium tabular-nums', good ? 'text-green-400' : 'text-red-400')}>
      {positive ? '↑' : '↓'} {Math.abs(change.value)}
      {unit}
    </span>
  )
}

export function FunnelRail({
  label,
  value,
  delta,
  context,
  labelTerm,
  className,
}: {
  label: string
  value: string
  delta?: PctChangeResult
  context?: string
  /** Registry key for this rail's own InfoTip — omit for a rail with no term
   * of its own, or whose term already sits elsewhere on the page (the Daily
   * instrument reuses these same labels and carries none, so the sentence
   * opens from exactly one place). */
  labelTerm?: string
  className?: string
}) {
  const isDash = value === '—'
  return (
    <div className={cn('relative flex min-w-0 flex-col justify-center px-4 py-3', className)}>
      <span aria-hidden="true" className="absolute bottom-0 left-0 top-0 w-[2px] bg-brand-orange" />
      <div className="flex items-baseline justify-between gap-2">
        {/* h-5 = the un-glyphed line height. Three of the plate's five rails
            carry a term and two do not; without a pinned height the glyphed
            three grow 4px and their values fall off the grid row. */}
        <span className="flex h-5 min-w-0 items-center gap-1 text-[13px] text-neutral-400">
          <span className="truncate">{label}</span>
          {labelTerm && <TermInfoTip term={labelTerm} glyphSize={12} />}
        </span>
        {!isDash && <RailDelta change={delta ?? null} />}
      </div>
      <span className={cn('mt-0.5 text-xl font-semibold tabular-nums', isDash ? 'text-neutral-600' : 'text-white')}>
        {value}
      </span>
      {!isDash && context && (
        <span className="mt-0.5 truncate text-[11px] text-neutral-500" title={context}>
          {context}
        </span>
      )}
    </div>
  )
}
