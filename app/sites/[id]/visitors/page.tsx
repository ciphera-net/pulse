'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { UsersThree } from '@phosphor-icons/react'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { Pagination } from '@/components/search/rowPrimitives'
import { PresenceField } from '@/components/visitors/PresenceField'
import { JourneyStrand } from '@/components/visitors/JourneyStrand'
import { VisitorMeta } from '@/components/visitors/VisitorMeta'
import { VisitorsOffRoom } from '@/components/visitors/VisitorsOffRoom'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { useUrlDateRange } from '@/lib/hooks/useUrlDateRange'
import { useSite, useVisitors } from '@/lib/swr/dashboard'
import { visitorPseudonym } from '@/lib/visitors/pseudonym'
import { formatLastSeen, SITE_TIMEZONE_FALLBACK } from '@/lib/visitors/format'
import {
  VISITORS_MIN_DATE,
  VISITORS_ROLLING_MINUTES,
  VISITORS_PRESETS,
  monthBoundaries,
  presenceTicks,
} from '@/lib/visitors/range'
import type { VisitorRow } from '@/lib/api/visitors'
import { displayDomain } from '@/lib/utils/displayDomain'

// ─── The Visitors roster (approved design §9a, "The list page") ─────
//
// Reference render: Pulse/docs/data/30-08-2026-visitors-mocks/round4-list-v4.png
// (and round4-live-v4.png for the rolling window).

const PAGE_SIZE = 10

/**
 * How many dots the presence field is fed.
 *
 * 🔴 IT IS NOT 200, AND IT CANNOT BE. `visitorsMaxPageSize` is 100 on the server
 * and `ParseLimit` REJECTS rather than clamps, so `pageSize: 200` returns 400 and
 * this page renders an error card. Raising the cap is a wire-contract change and
 * was not taken; the field gets its own bounded request instead, and says how
 * many it is not drawing.
 */
const FIELD_SIZE = 100

function isToggleOff(error: unknown): boolean {
  // A 403 here is not a failure — it is the site's own visitor_views_enabled
  // toggle, and the page renders the enable room for it. Any OTHER 403 shape
  // would be a genuine access problem, so the code is checked as well as the
  // status: a permission denial must not be mistaken for "not switched on".
  const e = error as { status?: number; data?: { error?: string } } | undefined
  return e?.status === 403 && e?.data?.error === 'visitor_views_disabled'
}

export default function VisitorsPage() {
  const params = useParams()
  const siteId = params.id as string

  const { data: site, mutate: refreshSite } = useSite(siteId)
  const { period, dateRange, periodReady, rollingMinutes, setPeriod, shiftPeriod, pickerProps } =
    useUrlDateRange({
      pageKey: 'visitors',
      minDate: VISITORS_MIN_DATE,
      rollingMinutes: VISITORS_ROLLING_MINUTES,
      extraPresets: VISITORS_PRESETS,
    })

  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('last_seen')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')

  // A range or sort change invalidates the page number: page 4 of the old
  // ordering is not page 4 of the new one, and leaving it would show an empty
  // page that reads as "no visitors".
  useEffect(() => {
    setPage(1)
  }, [dateRange.start, dateRange.end, rollingMinutes, sort, order])

  const range = useMemo(
    () =>
      rollingMinutes != null
        ? { minutes: rollingMinutes }
        : { startDate: dateRange.start, endDate: dateRange.end },
    [rollingMinutes, dateRange.start, dateRange.end],
  )

  const { data, error, isLoading } = useVisitors(siteId, range, {
    sort,
    order,
    page,
    pageSize: PAGE_SIZE,
    // 🔴 Gated on periodReady. Without it the first render fetches with
    // DEFAULT_PERIOD — a placeholder, not the user's choice — and on a warm SWR
    // key that stale answer renders under the remembered preset's label. That
    // exact bug shipped to a customer on 20-08-2026.
    enabled: periodReady,
  })

  /**
   * 🔴 THE FIELD GETS ITS OWN REQUEST, DECOUPLED FROM THE ROSTER'S PAGING.
   *
   * It used to be handed `data.visitors` — one page of ten — while its caption
   * said "Each dot is one visitor" and the stats line 12px below printed the real
   * range total. Measured on production: 101 in range, 10 dots; 517 on the
   * busiest site. Its own "+N more not drawn" note was unreachable code.
   *
   * Always page 1 sorted by `last_seen`, whatever the roster is sorted by: the
   * field's x axis IS recency, so feeding it the roster's ordering would draw
   * "the ten least active" as the population the moment somebody pressed
   * "Visits ↑".
   */
  const { data: fieldData } = useVisitors(siteId, range, {
    sort: 'last_seen',
    order: 'desc',
    page: 1,
    pageSize: FIELD_SIZE,
    enabled: periodReady,
  })

  /** The visitor whose dot is lit — set by hovering or focusing a roster row. */
  const [highlightKey, setHighlightKey] = useState<string | null>(null)

  useEffect(() => {
    if (site?.domain) document.title = `Visitors · ${displayDomain(site)} | Pulse`
  }, [site?.domain])

  // 🔴 THE SITE'S ZONE, TAKEN FROM THE SAME RESPONSE AS THE ROWS. Every date on this
  // page is a calendar judgement about data the server bucketed in the site's timezone,
  // so it may never be made in the reader's (audit §2.4). Reading it off `data` rather
  // than off `useSite` keeps the rows and their calendar in one payload — a separate
  // fetch could arrive later, or not at all, and render a page of dates in the meantime.
  // The `useSite` arm covers a response held in an SWR cache from before the field
  // existed; UTC last, because it is the server's own column default and never a guess
  // about where the reader is standing.
  const siteTimezone = data?.site_timezone || site?.timezone || SITE_TIMEZONE_FALLBACK

  // 🔴 EVERYTHING BELOW IS ABOVE THE EARLY RETURNS ON PURPOSE. `boundaries` is a
  // useMemo, and a hook after a conditional `return` runs in a different order on
  // the render where the toggle-off room shows — React's rules-of-hooks error,
  // caught by eslint before it could ship. The two lines it depends on come with
  // it so the three stay together.
  const { from, to, ticks } = presenceTicks(dateRange, rollingMinutes, siteTimezone)
  // A rolling window never spans a month, so live mode gets no boundary.
  const boundaries = useMemo(
    () => (rollingMinutes != null ? [] : monthBoundaries(from, to, siteTimezone)),
    [rollingMinutes, from, to, siteTimezone],
  )

  if (site && site.visitor_views_enabled === false) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
        <PageHeader live={0} showToolbar={false} />
        <VisitorsOffRoom site={site} onEnabled={() => refreshSite()} />
      </div>
    )
  }

  if (error && isToggleOff(error) && site) {
    // Belt and braces: the site row says enabled but the API disagrees (a stale
    // SWR copy after somebody disabled it in another tab). Trust the API.
    return (
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
        <PageHeader live={0} showToolbar={false} />
        <VisitorsOffRoom site={site} onEnabled={() => refreshSite()} />
      </div>
    )
  }

  const visitors = data?.visitors ?? []
  const total = data?.total ?? 0
  const activeNow = data?.active_now ?? 0
  const live = rollingMinutes != null

  const fieldVisitors = fieldData?.visitors ?? []
  // What the field is NOT drawing. The field cannot compute this — it is handed a
  // bounded page on purpose — so the page, which knows the range total, tells it.
  const undrawn = Math.max(0, total - fieldVisitors.length)
  const returningShare =
    visitors.length > 0
      ? Math.round((visitors.filter((v) => v.visits > 1).length / visitors.length) * 100)
      : 0
  const pageviews = visitors.reduce((sum, v) => sum + v.pageviews, 0)

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
      <PageHeader
        live={activeNow}
        showToolbar
        period={period}
        dateRange={dateRange}
        onPeriodChange={(p) => setPeriod(p as never)}
        onDateRangeChange={(r) => setPeriod('custom', r)}
        onShift={shiftPeriod}
        pickerProps={pickerProps}
      />

      <div className="mt-5">
        <PresenceField
          visitors={fieldVisitors}
          from={from}
          to={to}
          ticks={ticks}
          activeCount={activeNow}
          undrawn={undrawn}
          boundaries={boundaries}
          highlightKey={highlightKey}
          caption="Each dot is one visitor · nearer the right, more recently seen"
          emptyLabel={isLoading ? 'Loading…' : 'No visitors in this range'}
        />
      </div>

      <p className="mt-3 text-sm text-neutral-500">
        {live ? (
          'Rolling window · resolves against the live tracker'
        ) : (
          <>
            <span className="tabular-nums text-neutral-300">{total}</span> visitors this range ·{' '}
            <span className="tabular-nums text-neutral-300">{returningShare}%</span> returning ·{' '}
            <span className="tabular-nums text-neutral-300">{pageviews}</span> pageviews on this
            page · sorted by {sort.replace('_', ' ')}
          </>
        )}
      </p>

      <div className="mt-4 rounded-none border border-border bg-card">
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          {/* A HEADING, not a styled span. Preflight resets h1–h6 to inherit their
              size, weight and margin (verified in the shipped bundle), so this is the
              same pixels — and it is the only way a screen-reader user can jump to the
              roster, or know that the rows beneath belong to it. */}
          <h2 className="flex items-center gap-1 text-sm font-medium text-white">
            {live ? 'On the site now' : "This month's readers"}
            <TermInfoTip term="visitor_identity" />
          </h2>
          <span className="bg-brand-orange/10 px-2 py-1 text-xs tabular-nums text-brand-orange">
            {live ? `${activeNow} right now` : `${total} in range`}
          </span>
        </div>

        <div className="flex h-8 items-center border-b border-border px-4 text-xs text-neutral-500">
          <span className="min-w-0 flex-1">Visitor</span>
          <span className="hidden w-24 text-right sm:inline-block">Last journey</span>
          {/* 🔴 HIDDEN BELOW sm, with their rows (approved round 5, §2 B).
              Measured at 375px: the row is 339px and leaves 47px for the
              pseudonym AND the whole five-segment meta line, because 224px of
              numerals are shrink-0 beside it. The name truncated to "Thou…".
              Below sm the roster answers WHO and WHEN; visits and pages retreat
              one click deeper, which is the same retreat the journey strand
              already makes at this width. */}
          <SortHeader label="Visits" col="visits" sort={sort} order={order} onSort={applySort} className="hidden w-16 sm:inline-block" />
          <SortHeader label="Pages" col="pageviews" sort={sort} order={order} onSort={applySort} className="hidden w-16 sm:inline-block" />
          <SortHeader label="Last seen" col="last_seen" sort={sort} order={order} onSort={applySort} className="w-24" />
        </div>

        {/* Pressing a sort header re-orders the rows silently: nothing moves focus and
            nothing is announced, so a screen-reader user has no way to tell the press
            worked. The button's own aria-label carries the state for anyone who returns
            to it; this says it at the moment it changes. */}
        <span aria-live="polite" className="sr-only">
          Sorted by {sort.replace('_', ' ')}, {order === 'desc' ? 'descending' : 'ascending'}
        </span>

        {error && !isToggleOff(error) ? (
          <ErrorCard
            title="Couldn't load this view"
            description="The visitor list didn't come back. Try again."
          />
        ) : isLoading && visitors.length === 0 ? (
          <div className="p-4" role="status">
            <span className="sr-only">Loading visitors…</span>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} aria-hidden="true" className="mb-3 h-10 animate-pulse rounded-none bg-neutral-800/50" />
            ))}
          </div>
        ) : visitors.length === 0 ? (
          <EmptyState
            icon={<UsersThree className="size-6" weight="regular" />}
            title={live ? 'Nobody on the site right now' : 'No visitors in this range'}
            description={
              live
                ? 'This updates on its own — a reader arriving in the next few minutes will appear here.'
                : 'Identities begin on 26 August 2026 and reset each calendar month. Try a wider range.'
            }
          />
        ) : (
          <>
            {visitors.map((v) => (
              <VisitorRowLink
                key={`${v.visitor_key}-${v.month}`}
                siteId={siteId}
                visitor={v}
                collectsReferrers={site?.collect_referrers ?? false}
                siteTimezone={siteTimezone}
                onHighlight={setHighlightKey}
              />
            ))}
            {/*
              🔴 Pagination is ZERO-indexed (`disabled={page === 0}`, and its
              "N–M of T" label is computed as `page * pageSize + 1`). The API is
              ONE-indexed, per §4. Passing our 1-based page straight in left
              Previous enabled on the first page, sent `page=0`, and the server
              correctly rejected it — the user saw "Couldn't load this view" for
              pressing a button that should have been disabled. The label was
              wrong too: page 1 rendered rows 1–10 under "11–20 of N".

              Converted here, at the one boundary where the two conventions
              meet, rather than by loosening the server's validation.
            */}
            <Pagination
              page={page - 1}
              pageSize={PAGE_SIZE}
              total={total}
              onPage={(zeroBased) => setPage(zeroBased + 1)}
            />
          </>
        )}
      </div>
    </div>
  )

  function applySort(col: string) {
    if (sort === col) {
      setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSort(col)
    setOrder('desc')
  }
}

function PageHeader({
  live,
  showToolbar,
  period,
  dateRange,
  onPeriodChange,
  onDateRangeChange,
  onShift,
  pickerProps,
}: {
  live: number
  showToolbar: boolean
  period?: string
  dateRange?: { start: string; end: string }
  onPeriodChange?: (p: string) => void
  onDateRangeChange?: (r: { start: string; end: string }) => void
  onShift?: (d: -1 | 1) => void
  pickerProps?: Record<string, unknown>
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pt-6">
      <div>
        <h1 className="text-2xl font-medium text-white">Visitors</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Every reader is a month-long pseudonym — then the slate wipes clean
        </p>
        <p className="mt-1 text-xs text-neutral-600">
          Data begins 26 Aug 2026 · identities reset each calendar month
        </p>
      </div>

      {showToolbar && (
        <div className="flex items-center gap-2">
          {live > 0 && (
            <span className="flex h-10 items-center gap-2 border border-border px-3 text-sm text-neutral-300">
              <span className="size-1.5 rounded-full bg-green-500" aria-hidden="true" />
              {live} on the site now
            </span>
          )}
          <DateRangePicker
            period={period as string}
            dateRange={dateRange as { start: string; end: string }}
            onPeriodChange={onPeriodChange as (p: string) => void}
            onDateRangeChange={onDateRangeChange as (r: { start: string; end: string }) => void}
            onShift={onShift}
            align="right"
            {...pickerProps}
          />
        </div>
      )}
    </div>
  )
}

function SortHeader({
  label,
  col,
  sort,
  order,
  onSort,
  className,
}: {
  label: string
  col: string
  sort: string
  order: 'asc' | 'desc'
  onSort: (col: string) => void
  className?: string
}) {
  const active = sort === col
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      // Not aria-sort: that property is only meaningful on a columnheader, and
      // this is a button in a flex row, not a table. A screen reader gets the
      // state from the accessible NAME instead, which is what actually reaches
      // the user.
      aria-label={
        active
          ? `${label}, sorted ${order === 'desc' ? 'descending' : 'ascending'}. Activate to reverse.`
          : `Sort by ${label.toLowerCase()}`
      }
      className={
        'shrink-0 text-right transition-colors duration-fast ease-apple hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange ' +
        (active ? 'text-neutral-300' : '') +
        ' ' +
        (className ?? '')
      }
    >
      {label}
      {active && <span aria-hidden="true">{order === 'desc' ? ' ↓' : ' ↑'}</span>}
    </button>
  )
}

function VisitorRowLink({
  siteId,
  visitor,
  collectsReferrers,
  siteTimezone,
  onHighlight,
}: {
  siteId: string
  visitor: VisitorRow
  collectsReferrers: boolean
  siteTimezone: string
  onHighlight: (key: string | null) => void
}) {
  const name = visitorPseudonym(visitor.visitor_key)
  return (
    <Link
      href={`/sites/${siteId}/visitors/${visitor.visitor_key}`}
      /*
        🔑 FOCUS, NOT ONLY HOVER. The row lights its dot in the field above on
        pointer-enter — and on keyboard focus, because hover does not exist on a
        phone, which is exactly where the field is most crowded. The row is
        already a link, so it is already in the tab order; this costs nothing and
        gives the pairing to anyone tabbing the roster.
      */
      onMouseEnter={() => onHighlight(visitor.visitor_key)}
      onMouseLeave={() => onHighlight(null)}
      onFocus={() => onHighlight(visitor.visitor_key)}
      onBlur={() => onHighlight(null)}
      className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 transition-colors duration-fast ease-apple last:border-b-0 hover:bg-neutral-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange"
    >
      <div className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-white">{name}</span>
          {visitor.active_now && (
            <>
              {/* 🔴 THE aria-label MOVED OFF THE DOT. `aria-label` on a bare <span> is
                  an `aria-prohibited-attr` violation — axe rates it SERIOUS — because a
                  span with no role maps to `generic`, and `generic` forbids naming, so
                  assistive technology is entitled to drop the name entirely. The
                  visually-hidden text beside it is the house device (CommandDeck,
                  UptimePanel, InstrumentPanel all use it) and cannot be dropped.
                  It also fixes the reading: the name used to run into the pseudonym as
                  "Quiet Readeron the site now". */}
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-green-500"
                style={{ boxShadow: '0 0 0 3px rgb(34 197 94 / 0.18)' }}
              />
              <span className="sr-only">on the site now</span>
            </>
          )}
        </span>
        <VisitorMeta
          className="mt-1"
          country={visitor.country}
          city={visitor.city}
          browser={visitor.browser}
          os={visitor.os}
          deviceType={visitor.device_type}
          referrer={visitor.referrer}
          collectsReferrers={collectsReferrers}
        />
      </div>

      {/* The column header says "Last journey" and the cell under it was a decorative
          SVG marked aria-hidden — a labelled column with nothing in it. */}
      <span className="hidden w-24 justify-end sm:flex">
        <JourneyStrand pages={visitor.pageviews} eventAt={visitor.events > 0 ? [1] : []} />
        <span className="sr-only">
          last journey: {visitor.pageviews} {visitor.pageviews === 1 ? 'page' : 'pages'}
          {visitor.events > 0 ? ', with an event' : ''}.{' '}
        </span>
      </span>
      {/*
        🔴 THREE BARE NUMBERS. Measured with dom-accessibility-api: a row's whole
        accessible name ended
            "…viaGoogle 372h ago"
        — that is 3 visits, 7 pages and "2h ago", run together with no labels and no
        separators, because this is a flex layout and not a table, so nothing associates
        a cell with its column header. A screen reader reads "three seventy-two h ago".

        The labels are visually hidden rather than rendered: the column headers already
        carry them for a sighted reader, and repeating them in every row would be the
        wrong design. `.sr-only` is `position:absolute` and clipped to 1px, so the
        numerals' geometry is untouched (verified against the shipped bundle's rule).
      */}
      {/*
        ⚠️ THE WHOLE PHRASE GOES IN THE HIDDEN NODE, and the visible numeral is
        hidden from AT — rather than hiding just the word beside a visible number.
        Measured: the accessible-name algorithm joins adjacent inline text WITHOUT
        a separator, so `3` + `<sr-only> visits</sr-only>` came out as "3visits".
        One self-contained text node cannot be run together with its neighbour.
      */}
      <span className="hidden w-16 shrink-0 text-right text-sm tabular-nums text-neutral-300 sm:inline-block">
        <span aria-hidden="true">{visitor.visits}</span>
        <span className="sr-only">
          {visitor.visits} {visitor.visits === 1 ? 'visit' : 'visits'},{' '}
        </span>
      </span>
      <span className="hidden w-16 shrink-0 text-right text-sm tabular-nums text-neutral-300 sm:inline-block">
        <span aria-hidden="true">{visitor.pageviews}</span>
        <span className="sr-only">
          {visitor.pageviews} {visitor.pageviews === 1 ? 'page' : 'pages'},{' '}
        </span>
      </span>
      <span className="w-24 shrink-0 text-right text-sm tabular-nums text-neutral-500">
        <span aria-hidden="true">{formatLastSeen(visitor.last_seen, siteTimezone)}</span>
        <span className="sr-only">last seen {formatLastSeen(visitor.last_seen, siteTimezone)}</span>
      </span>
    </Link>
  )
}
