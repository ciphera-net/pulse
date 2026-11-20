'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Clock, Eye, Tag, Users } from '@phosphor-icons/react'
import { RailDelta } from '@/components/funnels/FunnelRail'
import { CompactNumber } from '@/components/ui/compact-number'
import { SkeletonLine } from '@/components/skeletons'
import { FRAME_SURFACE } from '@/lib/dashboard/frameClasses'
import { guardedPctChange, guardedPointChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { formatNumber } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/visitors/format'
import type { VisitorSummaryFigures, VisitorsSummaryResponse } from '@/lib/api/visitors'
import { NAME_AN_EVENT_HREF } from './day'

// ---------------------------------------------------------------------------
// The new Visitors page's strip (look C, rulings R110 to R114; plan Pulse/docs/plans/18-11-2026-visitors-page-
// overhaul-plan.md): four figures over the list, each against the period before, in the Pages page's strip
// (components/pages/list/PagesStrip.tsx), its markup and its steps. Two cells a row under 880 px of room, four in a row
// from 880; the change at the name's row end from 400 px, beside the figure below that.
//
//   Visitors           the range's visitor-days (a visitor is one site-local day: lib/visitors/identityWindow)
//   Pages per visitor  pageviews over visitors
//   Time on site       the measured seconds of every visit over visitors: a visitor's day, on average
//   Converted          the share of visitors who fired one of the site's NAMED events (R114, Settings, Events); a
//                      site with none named gets the way to name one in place of a figure
//
// Every figure is the server's (GET /sites/:id/visitors/summary): the range and the period before under the same
// filter, never under the list's quick tab. The period before is null where it reaches back past the visitors floor;
// then no change is drawn and each line says what the range holds instead.
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
  context: ReactNode
}

/** A change that rounds to nothing is not a change: no badge, where the delta device would write "↓ 0%". */
const moved = (change: PctChangeResult): PctChangeResult => (change && change.type !== 'new' && change.value === 0 ? null : change)
const per = (a: number, b: number): number | null => (b > 0 ? a / b : null)
/** Seconds a visitor, null where no visit had a measured time. */
const timeOf = (f: VisitorSummaryFigures): number | null => (f.seconds == null ? null : per(f.seconds, f.visitors))
/** Converted as a share in percent; null where the site has named no event, or where there was no visitor. */
const shareOf = (f: VisitorSummaryFigures): number | null => {
  const share = f.converted == null ? null : per(f.converted, f.visitors)
  return share == null ? null : share * 100
}

export function stripFigures(summary: VisitorsSummaryResponse): Figure[] {
  const cur = summary.current
  const prev = summary.previous
  const before = (said: string | null, otherwise: ReactNode): ReactNode => (prev ? (said == null ? 'not measured in the period before' : `${said} in the period before`) : otherwise)

  const pages = per(cur.pageviews, cur.visitors)
  const pagesBefore = prev ? per(prev.pageviews, prev.visitors) : null
  const time = timeOf(cur)
  const timeBefore = prev ? timeOf(prev) : null
  const named = summary.named_events > 0
  const share = shareOf(cur)
  const shareBefore = prev ? shareOf(prev) : null

  return [
    {
      key: 'visitors',
      icon: <Users aria-hidden="true" />,
      label: 'Visitors',
      value: formatNumber(cur.visitors),
      count: cur.visitors,
      change: prev ? guardedPctChange(cur.visitors, prev.visitors, prev.visitors) : null,
      context: before(prev ? formatNumber(prev.visitors) : null, `${formatNumber(cur.visits)} ${cur.visits === 1 ? 'visit' : 'visits'}`),
    },
    {
      key: 'pages',
      icon: <Eye aria-hidden="true" />,
      label: 'Pages per visitor',
      value: pages == null ? null : pages.toFixed(2),
      change: prev && pages != null && pagesBefore != null ? guardedPctChange(pages, pagesBefore, prev.visitors) : null,
      context: before(pagesBefore == null ? null : pagesBefore.toFixed(2), `${formatNumber(cur.pageviews)} ${cur.pageviews === 1 ? 'page' : 'pages'}`),
    },
    {
      key: 'time',
      icon: <Clock aria-hidden="true" />,
      label: 'Time on site',
      value: time == null ? null : formatDuration(time),
      change: prev && time != null && timeBefore != null ? guardedPctChange(time, timeBefore, prev.visitors) : null,
      context: before(timeBefore == null ? null : formatDuration(timeBefore), "a visitor's day, on average"),
    },
    named
      ? {
          key: 'converted',
          icon: <Tag aria-hidden="true" />,
          label: 'Converted',
          value: share == null ? null : `${Math.round(share)}%`,
          change: prev && share != null && shareBefore != null ? guardedPointChange(share, shareBefore, prev.visitors) : null,
          context: `${formatNumber(cur.converted ?? 0)} of ${formatNumber(cur.visitors)} ${cur.visitors === 1 ? 'visitor' : 'visitors'}`,
        }
      : {
          key: 'converted',
          icon: <Tag aria-hidden="true" />,
          label: 'Converted',
          value: null,
          change: null,
          context: (
            <Link href={NAME_AN_EVENT_HREF} className="text-neutral-300 underline decoration-neutral-600 underline-offset-2 hover:text-white" data-name-an-event="">
              Name an event to count conversions
            </Link>
          ),
        },
  ]
}

/**
 * The strip; without a summary yet (its read on the way), the four cells with their loading marks, and where its read
 * failed, the four cells with a dash and a line saying so (never a mark that loads for ever).
 */
export default function VisitorStrip({ summary, failed = false }: { summary: VisitorsSummaryResponse | undefined; failed?: boolean }) {
  const figures = summary ? stripFigures(summary) : null
  const cells = figures ?? (['visitors', 'pages', 'time', 'converted'] as const).map((key) => ({ key, label: LOADING_LABELS[key], icon: LOADING_ICONS[key] }))
  return (
    // The wrapper is the container the cells ask for their room (a block cannot ask its own width).
    <div className="[container-type:inline-size]">
      <section className={`${FRAME_SURFACE} grid grid-cols-2 cq-[880px]:grid-cols-4`} data-visitors-strip="" aria-label="The period at a glance" aria-busy={!figures && !failed}>
        {cells.map((cell, i) => {
          const f = figures?.[i]
          return (
            <div
              key={cell.key}
              data-visitors-figure={cell.key}
              className={cn(
                'min-w-0 border-white/[0.08] px-4 py-4 cq-[400px]:px-5',
                'cqmax-[879.98px]:odd:border-r cqmax-[879.98px]:[&:nth-child(-n+2)]:border-b',
                i > 0 && 'cq-[880px]:border-l',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-[13px] text-neutral-400">
                  <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{cell.icon}</span>
                  <span className="truncate" data-figure-name="">{cell.label}</span>
                </span>
                {f && (
                  <span className="hidden shrink-0 cq-[400px]:inline-flex" data-figure-change="">
                    <RailDelta change={moved(f.change)} />
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xl font-semibold tabular-nums text-white">
                <span data-figure-value="">
                  {!f ? (failed ? <span className="text-neutral-600">{DASH}</span> : <SkeletonLine className="mt-1.5 h-4 w-16" />) : f.value == null ? <span className="text-neutral-600">{DASH}</span> : f.count != null ? <CompactNumber value={f.count} /> : f.value}
                </span>
                {f && <span className="shrink-0 cq-[400px]:hidden"><RailDelta change={moved(f.change)} /></span>}
              </div>
              <div className="mt-0.5 min-h-4 text-[11px] tabular-nums text-neutral-500" data-figure-context="">
                {f ? f.context : failed ? 'did not load' : <SkeletonLine className="mt-1 h-2.5 w-24 max-w-full" />}
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}

const LOADING_LABELS = { visitors: 'Visitors', pages: 'Pages per visitor', time: 'Time on site', converted: 'Converted' } as const
const LOADING_ICONS = {
  visitors: <Users aria-hidden="true" />,
  pages: <Eye aria-hidden="true" />,
  time: <Clock aria-hidden="true" />,
  converted: <Tag aria-hidden="true" />,
} as const
