'use client'

import { useMemo, type ReactNode } from 'react'
import { ArrowLineDown, Clock, Eye, SignOut, Stack } from '@phosphor-icons/react'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { RailDelta } from '@/components/funnels/FunnelRail'
import { CompactNumber } from '@/components/ui/compact-number'
import { FRAME_SURFACE } from '@/lib/dashboard/frameClasses'
import { guardedPctChange, guardedPointChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { formatNumber } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import type { PageTableRow, Stats } from '@/lib/api/stats'
import { seconds } from './buckets'

// ---------------------------------------------------------------------------
// The Pages page's strip: five headline figures over the list, each against the period before. The dashboard's
// tile (components/dashboard/bottom/OverviewTiles.tsx): a name with its icon and the change at the row's end, the
// figure at 20 px, a line of context.
//
// Pageviews, views per visit and the bounce rate are the site's own figures (the dashboard's read). Time on page
// and scroll depth are the listed pages' own, weighted by their views: exact while the list holds every page, and
// said to be over the busiest pages once the read is at its limit.
// ---------------------------------------------------------------------------

const DASH = '—'

interface Figure {
  key: string
  icon: ReactNode
  label: string
  /** The figure as printed, or null where it was not measured. */
  value: string | null
  /** A count, for the exact number under the pointer. */
  count?: number
  change: PctChangeResult
  /** Up is worse (bounce): the arrow keeps the number's direction, the colour turns. */
  invert?: boolean
  context: string
  term?: string
}

export interface PagesStripProps {
  rows: PageTableRow[]
  /** The pages read for the period before; undefined while it loads or where nothing is compared. */
  prevRows?: PageTableRow[]
  stats?: Stats
  prevStats?: Stats
  /** The pages read's row limit: at it, the figures worked out from the rows are over the busiest pages only. */
  limit: number
}

function weighted(rows: PageTableRow[], value: (r: PageTableRow) => number | null, weight: (r: PageTableRow) => number): number | null {
  let sum = 0
  let total = 0
  for (const row of rows) {
    const v = value(row)
    const w = weight(row)
    if (v == null || w <= 0) continue
    sum += v * w
    total += w
  }
  return total > 0 ? sum / total : null
}

const ratio = (a: number, b: number | undefined): number | null => (b && b > 0 ? a / b : null)
/** A change that rounds to nothing is not a change: no badge, where the delta device would write "↓ 0%". */
const moved = (change: PctChangeResult): PctChangeResult => (change && change.type !== 'new' && change.value === 0 ? null : change)
const timeOnPage = (rows: PageTableRow[] | undefined): number | null => (rows ? weighted(rows, (r) => r.avg_time_on_page, (r) => r.pageviews) : null)
const scrollDepth = (rows: PageTableRow[] | undefined): number | null => (rows ? weighted(rows, (r) => r.avg_scroll_depth, (r) => r.pageviews) : null)

export default function PagesStrip({ rows, prevRows, stats, prevStats, limit }: PagesStripProps) {
  const figures = useMemo<Figure[]>(() => {
    const views = stats?.pageviews ?? rows.reduce((n, r) => n + r.pageviews, 0)
    const viewsBefore = prevStats?.pageviews
    const perVisit = stats ? ratio(stats.pageviews, stats.visits) : null
    const perVisitBefore = prevStats ? ratio(prevStats.pageviews, prevStats.visits) : null
    const time = timeOnPage(rows)
    const timeBefore = timeOnPage(prevRows)
    const scroll = scrollDepth(rows)
    const scrollBefore = scrollDepth(prevRows)
    const bounce = stats?.bounce_rate ?? null
    const bounceBefore = prevStats?.bounce_rate ?? null
    const before = (v: string | null) => (v == null ? 'no period before to compare' : `${v} in the period before`)
    // A figure worked out from the rows is over the pages listed. At the read's limit that is the busiest pages,
    // and its line says so in the place of the period before.
    const ofRows = (v: string | null) => (rows.length >= limit ? `over the ${formatNumber(limit)} busiest pages` : before(v))
    return [
      {
        key: 'pageviews',
        icon: <Eye aria-hidden="true" />,
        label: 'Pageviews',
        value: formatNumber(views),
        count: views,
        change: viewsBefore == null ? null : guardedPctChange(views, viewsBefore, viewsBefore),
        context: before(viewsBefore == null ? null : formatNumber(viewsBefore)),
        term: 'pageviews',
      },
      {
        key: 'per-visit',
        icon: <Stack aria-hidden="true" />,
        label: 'Views per visit',
        value: perVisit == null ? null : perVisit.toFixed(2),
        change: perVisit != null && perVisitBefore != null ? guardedPctChange(perVisit, perVisitBefore, prevStats?.visits ?? 0) : null,
        context: before(perVisitBefore == null ? null : perVisitBefore.toFixed(2)),
        term: 'pages_per_visit',
      },
      {
        key: 'time',
        icon: <Clock aria-hidden="true" />,
        label: 'Time on page',
        value: time == null ? null : seconds(time),
        change: time != null && timeBefore != null ? guardedPctChange(time, timeBefore, viewsBefore ?? 0) : null,
        context: ofRows(timeBefore == null ? null : seconds(timeBefore)),
      },
      {
        key: 'scroll',
        icon: <ArrowLineDown aria-hidden="true" />,
        label: 'Scroll depth',
        value: scroll == null ? null : `${Math.round(scroll)}%`,
        change: scroll != null && scrollBefore != null ? guardedPointChange(scroll, scrollBefore, viewsBefore ?? 0) : null,
        context: ofRows(scrollBefore == null ? null : `${Math.round(scrollBefore)}%`),
      },
      {
        key: 'bounce',
        icon: <SignOut aria-hidden="true" />,
        label: 'Bounce rate',
        value: bounce == null ? null : `${Math.round(bounce)}%`,
        change: bounce != null && bounceBefore != null ? guardedPointChange(bounce, bounceBefore, prevStats?.visits ?? 0) : null,
        invert: true,
        // The server's own two counts, never a share multiplied out here.
        context: stats?.bounce_visits != null && stats.visits != null
          ? `${formatNumber(stats.bounce_visits)} of ${formatNumber(stats.visits)} visits`
          : before(bounceBefore == null ? null : `${Math.round(bounceBefore)}%`),
        term: 'bounce_rate',
      },
    ]
  }, [rows, prevRows, stats, prevStats, limit])

  return (
    <section className={`${FRAME_SURFACE} grid grid-cols-2 lg:grid-cols-5`} data-pages-strip="" aria-label="The period at a glance">
      {figures.map((f, i) => (
        <div
          key={f.key}
          data-pages-figure={f.key}
          className={cn(
            'min-w-0 border-white/[0.08] px-5 py-4',
            // Five cells: a row of five on a wide page; two by two and the fifth across on a narrow one.
            'max-lg:odd:border-r max-lg:[&:nth-child(-n+4)]:border-b max-lg:last:col-span-2 max-lg:last:border-r-0',
            i > 0 && 'lg:border-l',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-neutral-400">
              <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{f.icon}</span>
              <span className="truncate">{f.label}</span>
              {f.term && <TermInfoTip term={f.term} />}
            </span>
            {/* On a phone the change sits beside the figure, so the name has its row and is never cut. */}
            <span className="hidden shrink-0 sm:inline-flex"><RailDelta change={moved(f.change)} invert={f.invert} /></span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xl font-semibold tabular-nums text-white">
            <span>{f.value == null ? <span className="text-neutral-600">{DASH}</span> : f.count != null ? <CompactNumber value={f.count} /> : f.value}</span>
            <span className="shrink-0 sm:hidden"><RailDelta change={moved(f.change)} invert={f.invert} /></span>
          </div>
          <p className="mt-0.5 text-[11px] text-neutral-500 sm:truncate">{f.context}</p>
        </div>
      ))}
    </section>
  )
}
