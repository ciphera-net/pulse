'use client'

import { useGSCQueryTrend } from '@/lib/swr/dashboard'
import { DelayedSpinner } from '@/components/ui/DelayedSpinner'
import { formatDate } from '@/lib/utils/formatDate'
import { cn } from '@/lib/utils'

// Position trend for one query inside its expanded row. Bars are inverted so a
// TALLER bar means a BETTER (lower) rank; the header states first → last with a
// delta coloured by direction (improvement = lower position = green). Fetch is
// keyed per query (race-free) and null-keyed until the row expands.

const BAR_MIN = 4
const BAR_SPAN = 28 // px added on top of BAR_MIN for the best rank in range

interface QueryTrendSparklineProps {
  siteId: string
  query: string
  start: string
  end: string
}

export function QueryTrendSparkline({ siteId, query, start, end }: QueryTrendSparklineProps) {
  const { data, error, isLoading, mutate } = useGSCQueryTrend(siteId, query, start, end)

  if (isLoading && !data) {
    return (
      <div className="flex h-14 items-center">
        <DelayedSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-14 items-center gap-2 text-sm text-neutral-400">
        Couldn&rsquo;t load the position trend.
        <button
          type="button"
          onClick={() => { void mutate() }}
          className="rounded-none text-brand-orange transition-colors duration-fast ease-apple hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
        >
          Retry
        </button>
      </div>
    )
  }

  const points = data ?? []
  if (points.length < 2) {
    return <div className="flex h-14 items-center text-sm text-neutral-500">Not enough data for a trend.</div>
  }

  const first = points[0]
  const last = points[points.length - 1]
  const delta = last.position - first.position // negative = improved (lower is better)
  const improved = delta < 0
  const worse = delta > 0

  const positions = points.map((p) => p.position)
  const maxPos = Math.max(...positions)
  const minPos = Math.min(...positions)
  const spread = maxPos - minPos || 1

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-sm">
        <span className="text-neutral-400">Position</span>
        <span className="tabular-nums text-white">{first.position.toFixed(1)}</span>
        <span className="text-neutral-500">&rarr;</span>
        <span className="tabular-nums text-white">{last.position.toFixed(1)}</span>
        <span className={cn('tabular-nums', improved ? 'text-green-400' : worse ? 'text-red-400' : 'text-neutral-500')}>
          {improved ? '↑' : worse ? '↓' : ''}{Math.abs(delta).toFixed(1)}
        </span>
      </div>
      <div className="flex h-8 items-end gap-0.5">
        {points.map((point, i) => {
          const height = BAR_MIN + ((maxPos - point.position) / spread) * BAR_SPAN
          const dateLabel = formatDate(new Date(point.date + 'T00:00:00'))
          return (
            <div
              key={i}
              title={`${dateLabel} · pos ${point.position.toFixed(1)} · ${point.clicks} clicks`}
              className="flex-1 rounded-none bg-brand-orange/60 transition-colors duration-fast ease-apple hover:bg-brand-orange"
              style={{ height: `${height}px` }}
            />
          )
        })}
      </div>
    </div>
  )
}
