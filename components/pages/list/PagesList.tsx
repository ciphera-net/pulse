'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowSquareOut, CaretRight, File, Layout, MagnifyingGlass } from '@phosphor-icons/react'
import { Button, Input, Select, Switcher } from '@ciphera-net/facet'
import { CascadeGroup, CascadeRow } from '@/components/dashboard/Cascade'
import { ROW_NUMBER } from '@/components/dashboard/MetricRowStat'
import { SortHead, sortRows, type Sort, type SortColumn } from '@/components/dashboard/SortHead'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { RailDelta } from '@/components/funnels/FunnelRail'
import { CompactNumber } from '@/components/ui/compact-number'
import { EmptyState } from '@/components/ui/EmptyState'
import { FRAME_CARD_NAME, FRAME_SURFACE } from '@/lib/dashboard/frameClasses'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { guardedPctChange, guardedPointChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { formatNumber } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import type { PageTableRow } from '@/lib/api/stats'
import PathLabel from '../PathLabel'
import DayBars from './DayBars'
import PageTrend, { PREV_INK, type TrendPoint } from './PageTrend'
import { bucketsFor, hourName, seconds, type Bucket, type BucketKind } from './buckets'

// ---------------------------------------------------------------------------
// The Pages page: EVERY PAGE IN ONE LIST (rulings R78 and R82, 17-11-2026). All of a site's pages at once, each with
// a bar chart of its days (after OpenPanel's Pages report), its measures, and its views against the period before;
// a press on a page opens it IN PLACE under its row (after Matomo's row evolution): its line over the period with
// the period before, each measure against the period before, how far its visits scroll, and two ways out.
//
// EVERY PART IS THE DASHBOARD'S OWN:
//   the search field      Facet's Input with its icon
//   a row                 the blocks' row: 36 px, the hover band, a name at 14 px, the blocks' numbers; rows 8 px
//                         apart, no rules
//   opening a row         the blocks' caret, a quarter turn, orange on the open one
//   a column's name       the blocks' SortHead, capital first
//   a change              the deck's change mark (RailDelta)
//   a page's line         the dashboard's chart (PageTrend.tsx): its grid, axes, crosshair, card and dashed line
//   a page's measures     the deck's rail cell: name, change, figure, a line of context
//   a page's other views  the blocks' orange tabs on the opened page (Trend, Scroll depth)
//   the info circle       the blocks' (lib/dashboard/terms.ts, `pages_list`)
//   nothing found         the app's EmptyState
//
// THE ADDRESS HOLDS THE PLACE: the search, the order, the opened page, its tab and a phone's column start from the
// address and are written back to it, as the period and the filters are. So a reload, Back from the dashboard and
// a shared link all show the same list.
//
// THE FIRST PAGE IS OPEN (ruling R84, 18-11-2026): a reader who opens the page meets the list's first page already
// opened, so what a row holds is on screen without a press. It is chosen ONCE, on the first rows, and is then an
// opened page like any other: it stays with its row through a sort or a search. The address says nothing while
// the opened page IS the list's first (its first state, as an unsorted list and an empty search are), names the
// page once it is any other, and says `show=none` once the reader has closed every page (every page's address
// starts with "/", so that word is no page's). So a reload always opens what was open, or keeps the list closed.
// The tab is the opened page's, and the first page's while the list still waits for its rows: `tab=scroll` alone
// opens the list's first page on its Scroll depth.
//
// THE LIST LAYS ITSELF OUT BY THE ROOM IT HAS, never by the window's width (18-11-2026). The app's sidebar, open or
// closed, changes that room by about 190 px: at a 1024 px window with the sidebar open the list has 655 px, and on
// window breakpoints it drew the seven columns and the bars of a 1024 px page there, which left the addresses no
// room at all and pushed the last column over the card's edge. The list's block is a CONTAINER and every rule
// below asks its width (`cq-[...]`, tailwind.config.ts). The steps are worked out from what a row holds, each
// leaving an address 180 px or more:
//   under 380 px   one number column, the reader's pick (a phone)
//   380 px         Views, Change, Scroll
//   550 px         and Visitors, Time on page
//   700 px         all seven
//   800 px         an opened page sets its measures beside its chart (under it below that)
//   880 px         and the bars
// ---------------------------------------------------------------------------

type Key = 'pageviews' | 'change' | 'visitors' | 'entry_bounce_rate' | 'avg_time_on_page' | 'exit_rate' | 'avg_scroll_depth'

const DASH = '—'
const DAY_MS = 86_400_000
/** As many bars as fit the column: a day each up to here, then weeks, then months. */
const MAX_BARS = 42

/**
 * The blocks' row (components/dashboard/MetricRowStat.tsx, DIMENSION_ROW) without its clip: a row here has no fill
 * to clip, and it holds a bar chart whose card rises above it.
 */
const ROW = 'w-[calc(100%+1rem)] text-left relative flex items-center justify-between h-9 group rounded-none px-2 -mx-2'

/**
 * The columns. Change is a page's views against the period before, the opened page's own figure.
 * In the narrowest list one number column fits, and the reader picks which (a menu beside the heading). So a column
 * has two sets of classes: `on` when it is the picked column (shown from the narrowest list; hidden again only
 * where it was hidden before, between the narrowest list and its own turn), `off` when it is not (shown where the
 * room allows). The room is the LIST's (see the head of this file). Written out whole, so the stylesheet holds
 * every class.
 */
const COLUMNS: readonly { key: Key; label: string; on: string; off: string }[] = [
  { key: 'pageviews', label: 'Views', on: 'w-14 inline-flex', off: 'w-14 hidden cq-[380px]:inline-flex' },
  { key: 'change', label: 'Change', on: 'w-14 inline-flex', off: 'w-14 hidden cq-[380px]:inline-flex' },
  { key: 'visitors', label: 'Visitors', on: 'w-14 inline-flex cq-[380px]:hidden cq-[550px]:inline-flex', off: 'w-14 hidden cq-[550px]:inline-flex' },
  { key: 'entry_bounce_rate', label: 'Bounce', on: 'w-14 inline-flex cq-[380px]:hidden cq-[700px]:inline-flex', off: 'w-14 hidden cq-[700px]:inline-flex' },
  { key: 'avg_time_on_page', label: 'Time on page', on: 'w-[84px] inline-flex cq-[380px]:hidden cq-[550px]:inline-flex', off: 'w-[84px] hidden cq-[550px]:inline-flex' },
  { key: 'exit_rate', label: 'Exit rate', on: 'w-16 inline-flex cq-[380px]:hidden cq-[700px]:inline-flex', off: 'w-16 hidden cq-[700px]:inline-flex' },
  { key: 'avg_scroll_depth', label: 'Scroll', on: 'w-12 inline-flex', off: 'w-12 hidden cq-[380px]:inline-flex' },
]
const PHONE_OPTIONS = COLUMNS.map((c) => ({ value: c.key as string, label: c.label }))
const percent = (v: number | null | undefined): string => (v == null ? DASH : `${Math.round(v)}%`)
/** The bars' column, and the room over it in the head: drawn where the list has room for them beside all seven columns. */
const BARS = 'hidden w-[168px] shrink-0 cq-[880px]:block'

/** A row of the list: a page and its views against the period before. */
interface Line {
  row: PageTableRow
  /** The change as drawn; null where nothing is compared or the base is too small to mean anything. */
  changeMark: PctChangeResult
  /** That change as a number, for the sort. */
  change: number | null
}

/**
 * A page's views against the period before, by the opened page's own rule (its Views cell), so a row and its opened
 * page never disagree: no mark where nothing is compared, where the page had no view then, or under ten views then.
 */
function versus(now: number, then: number | undefined, compared: boolean): Pick<Line, 'changeMark' | 'change'> {
  const changeMark = compared && then != null ? guardedPctChange(now, then, then) : null
  return { changeMark, change: changeMark && changeMark.type === 'pct' ? changeMark.value : null }
}

const figure = (line: Line, key: Key): number | null => (key === 'change' ? line.change : line.row[key])
/** A line's number for the sort. A line without one comes last in both directions: a dash never leads the list. */
const rank = (line: Line, key: Key, sort: Sort<Key>): number => figure(line, key) ?? (sort.dir === 'desc' ? -Infinity : Infinity)

// ---------------------------------------------------------------------------
// A page, opened in place under its row.
// ---------------------------------------------------------------------------

/** The deck's legend mark: a line in a series' own ink. */
function LegendLine({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg aria-hidden="true" width="16" height="8" viewBox="0 0 16 8" className="shrink-0">
      <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth={dash ? 1.5 : 2} strokeDasharray={dash} strokeLinecap={dash ? undefined : 'round'} />
    </svg>
  )
}

interface Measure {
  name: string
  now: string
  /** The figure in the period before, or null where there was none. */
  before: string | null
  change: PctChangeResult
  /** Up is worse: the arrow keeps the number's direction, the colour turns. */
  invert?: boolean
}

/** The opened page's tabs. */
export type PageView = 'trend' | 'scroll'

interface OpenedPageProps {
  row: PageTableRow
  /** The page's row of the period before; undefined where it had no view then, or nothing is compared. */
  before?: PageTableRow
  /** Whether a period before was read at all. */
  compared: boolean
  start: string
  prevStart?: string
  live: boolean
  host: string | null
  /** How far this page's visits scroll, and who reads furthest (ScrollWho.tsx), read when the tab is opened. */
  scroll?: ReactNode
  /** The dashboard filtered to this page. */
  dashboardHref?: string
  /** A range of ONE day: the page's hours, drawn in place of its days (PageHours.tsx). */
  hours?: ReactNode
  /** Whether those hours carry the day before as the dashed line. */
  hoursCompare?: boolean
  view: PageView
  onView: (view: PageView) => void
}

function OpenedPage({ row, before, compared, start, prevStart, live, host, scroll, dashboardHref, hours, hoursCompare, view, onView }: OpenedPageProps) {
  const now = useMemo(() => row.trend ?? [], [row.trend])
  const then = useMemo(() => before?.trend ?? [], [before?.trend])
  const n = now.length
  const drawPrev = hours ? Boolean(hoursCompare) : then.length > 0
  const data = useMemo<TrendPoint[]>(() => {
    const day0 = Date.parse(`${start}T00:00:00Z`)
    const prev0 = prevStart ? Date.parse(`${prevStart}T00:00:00Z`) : NaN
    return now.map((views, i) => ({
      dateObj: new Date(day0 + i * DAY_MS),
      views,
      prev: then[i] ?? null,
      prevDateObj: Number.isNaN(prev0) ? null : new Date(prev0 + i * DAY_MS),
      isPartial: live && i === n - 1,
    }))
  }, [now, then, start, prevStart, live, n])

  const base = before?.pageviews ?? 0
  const rate = (a: number | null | undefined, b: number | null | undefined, weight: number): PctChangeResult => (a != null && b != null ? guardedPointChange(a, b, weight) : null)
  const measures: Measure[] = [
    { name: 'Views', now: formatNumber(row.pageviews), before: before ? formatNumber(before.pageviews) : null, change: before ? guardedPctChange(row.pageviews, before.pageviews, base) : null },
    { name: 'Visitors', now: formatNumber(row.visitors), before: before ? formatNumber(before.visitors) : null, change: before ? guardedPctChange(row.visitors, before.visitors, before.visitors) : null },
    {
      name: 'Time on page',
      now: seconds(row.avg_time_on_page),
      before: before ? seconds(before.avg_time_on_page) : null,
      change: before && row.avg_time_on_page != null && before.avg_time_on_page != null ? guardedPctChange(row.avg_time_on_page, before.avg_time_on_page, base) : null,
    },
    { name: 'Scroll depth', now: percent(row.avg_scroll_depth), before: before ? percent(before.avg_scroll_depth) : null, change: rate(row.avg_scroll_depth, before?.avg_scroll_depth, base) },
    { name: 'Bounce', now: percent(row.entry_bounce_rate), before: before ? percent(before.entry_bounce_rate) : null, change: rate(row.entry_bounce_rate, before?.entry_bounce_rate, before?.entries ?? 0), invert: true },
    { name: 'Exit rate', now: percent(row.exit_rate), before: before ? percent(before.exit_rate) : null, change: rate(row.exit_rate, before?.exit_rate, base), invert: true },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
      className="mt-2 grid border border-white/[0.08] cq-[800px]:grid-cols-[minmax(0,1fr)_340px]"
      data-page-open={row.path}
    >
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3">
          {scroll ? (
            <>
              <Switcher
                size="sm"
                tone="solid"
                aria-label="What to show for this page"
                options={[{ value: 'trend', label: 'Trend' }, { value: 'scroll', label: 'Scroll depth' }]}
                value={view}
                onChange={(v) => onView(v as PageView)}
              />
              {view === 'scroll' && <TermInfoTip term="scroll_depth" />}
            </>
          ) : (
            <span className="text-xs font-medium text-neutral-400">Views a day</span>
          )}
          <div className={cn('flex items-center gap-4 cq-[550px]:ml-auto', view !== 'trend' && 'hidden')}>
            <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-neutral-400">
              <LegendLine color="var(--chart-1)" />
              This period
            </span>
            {drawPrev && (
              <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-neutral-400">
                <LegendLine color={PREV_INK} dash="3 3" />
                Previous period
              </span>
            )}
          </div>
        </div>
        {view === 'scroll' && scroll ? (
          // Who reads furthest (ScrollWho.tsx): it fills the room the chart has on the other tab, so the opened page
          // keeps one height on both.
          <div className="min-h-[264px] px-4 pb-4 pt-3 cq-[800px]:flex-1" data-page-scroll-tab="">
            <div className="h-full">{scroll}</div>
          </div>
        ) : (
          // As the deck's chart: it takes the height the measures beside it give the row, and never less than a floor.
          <div className="min-h-[264px] flex-1 px-2.5 pb-2 pt-1" data-page-chart="">
            {hours ?? <PageTrend data={data} bucket="day" drawPrev={drawPrev} live={live} />}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col border-t border-white/[0.08] cq-[800px]:border-l cq-[800px]:border-t-0">
        <div className="grid flex-1 grid-cols-2" data-page-measures="">
          {measures.map((m, i) => (
            <div key={m.name} className={cn('min-w-0 border-white/[0.08] px-3 py-3 cq-[380px]:px-4', i % 2 === 0 && 'border-r', i < 4 && 'border-b')} data-page-measure="">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] text-neutral-400" data-measure-name="">{m.name}</span>
                {/* The change sits at the name's row end where a cell holds both side by side. In the narrowest
                    list (a phone: a cell of about 150 px) it sits beside the figure, so the name has its row and
                    is never cut. */}
                <span className="hidden shrink-0 cq-[380px]:inline-flex" data-measure-change="">
                  <RailDelta change={m.change && m.change.type !== 'new' && m.change.value === 0 ? null : m.change} invert={m.invert} />
                </span>
              </div>
              <span className="mt-0.5 flex items-baseline justify-between gap-2">
                <span className="text-xl font-semibold tabular-nums text-white" data-measure-figure="">{m.now}</span>
                <span className="shrink-0 cq-[380px]:hidden">
                  <RailDelta change={m.change && m.change.type !== 'new' && m.change.value === 0 ? null : m.change} invert={m.invert} />
                </span>
              </span>
              {/* Never cut: a line too long for its cell takes a second line. */}
              <span className="mt-0.5 block text-[11px] tabular-nums text-neutral-500" data-measure-context="">
                {m.before != null ? `${m.before} in the period before` : compared ? 'no views in the period before' : 'no period before'}
              </span>
            </div>
          ))}
        </div>
        {/* The two ways out of the row, as two cells of the measures' own grid: a hairline between them, and each
            fills its cell, so the hover band is the whole box. One alone takes the row. In the narrowest list a
            cell is 138 px on a 360 px phone: the measures' own narrower padding there, so "Open the page" fits. */}
        <div className="grid grid-cols-2 border-t border-white/[0.08]" data-page-actions="">
          {dashboardHref && (
            <Button asChild variant="ghost" size="sm" className={cn('h-11 w-full min-w-0 justify-start gap-1.5 rounded-none px-3 text-[13px] font-normal text-neutral-300 cq-[380px]:px-4 [&_svg]:size-3.5 [&_svg]:shrink-0', host ? 'border-r border-white/[0.08]' : 'col-span-2')}>
              <Link href={dashboardHref}>
                <Layout className="text-muted-foreground" aria-hidden="true" />
                {/* A cell is 170 px beside the chart and about 150 px in the narrowest list: the words that fit
                    each, never cut. */}
                <span className="truncate cq-[380px]:hidden">Dashboard</span>
                <span className="hidden truncate cq-[380px]:inline">Open in dashboard</span>
              </Link>
            </Button>
          )}
          {host && (
            <Button asChild variant="ghost" size="sm" className={cn('h-11 w-full min-w-0 justify-start gap-1.5 rounded-none px-3 text-[13px] font-normal text-neutral-300 cq-[380px]:px-4 [&_svg]:size-3.5 [&_svg]:shrink-0', !dashboardHref && 'col-span-2')}>
              {/* An outbound link's arrow turns orange under the pointer, as every one in the app does. The link
                  is its own group, so the arrow answers to this cell and to no row around it. */}
              <a href={`https://${host}${row.path}`} target="_blank" rel="noopener noreferrer" className="group">
                <ArrowSquareOut className="text-muted-foreground transition-colors ease-apple group-hover:text-brand-ink" aria-hidden="true" />
                <span className="truncate">Open the page</span>
              </a>
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// The list.
// ---------------------------------------------------------------------------

/** The words this list keeps in the address. The dashboard's link leaves them behind. */
export const LIST_PARAMS = ['q', 'sort', 'show', 'tab', 'col'] as const

const FIRST_SORT: Sort<Key> = { key: 'pageviews', dir: 'desc' }
/** The address's word for "the reader closed every page". No page's address is it: they all start with "/". */
const NONE_SHOWN = 'none'
const isKey = (word: string | null | undefined): word is Key => COLUMNS.some((c) => c.key === word)

function readSort(word: string | null): Sort<Key> {
  const [key, dir] = (word ?? '').split('.')
  return isKey(key) && (dir === 'asc' || dir === 'desc') ? { key, dir } : FIRST_SORT
}
const readTab = (word: string | null): PageView => (word === 'scroll' ? 'scroll' : 'trend')

export interface PagesListProps {
  rows: PageTableRow[]
  /** The same read for the period before; undefined while it loads or where nothing is compared. */
  prevRows?: PageTableRow[]
  /** The pages read's row limit. At it the list holds the busiest pages only, and its count says so. */
  limit: number
  /** The range's first day, YYYY-MM-DD, and the first day of the period before. */
  start: string
  prevStart?: string
  /** The range ends today, still being counted. */
  live: boolean
  /** A range of ONE day whose rows carry their hours (`hours`): the rows' bars are hours. */
  hourly: boolean
  /** On a day still being counted, the site's hour now (0 to 23): the hours after it have not happened. */
  nowHour?: number
  domain?: string
  /** How far a page's visits scroll and who reads furthest, for its opened row (ScrollWho.tsx). */
  renderScroll?: (path: string) => ReactNode
  /** The dashboard filtered to a page: its sources, places, devices and events. */
  dashboardHref?: (path: string) => string
  /** Set on a range of ONE day: a page's hours for its opened row, as the dashboard draws a day. */
  renderHours?: (path: string) => ReactNode
  /** Whether those hours are compared with the day before (the legend names the dashed line). */
  hoursCompare?: boolean
}

export default function PagesList({ rows, prevRows, limit, start, prevStart, live, hourly, nowHour, domain, renderScroll, dashboardHref, renderHours, hoursCompare }: PagesListProps) {
  const asked = useSearchParams()
  const [query, setQuery] = useState(() => asked.get('q') ?? '')
  const [sort, setSort] = useState<Sort<Key>>(() => readSort(asked.get('sort')))
  const [shown, setShown] = useState<string | null>(() => { const word = asked.get('show'); return word && word !== NONE_SHOWN ? word : null })
  // Whether the list still owes its reader an opened first page: only an address that says nothing about it does.
  const [owed, setOwed] = useState(() => asked.get('show') === null)
  const [tab, setTab] = useState<PageView>(() => readTab(asked.get('tab')))
  // The one number column a phone shows.
  const [phone, setPhone] = useState<Key>(() => { const word = asked.get('col'); return isKey(word) ? word : 'pageviews' })
  const host = domain ? domain.replace(/^https?:\/\//, '').replace(/\/$/, '') : null

  const prev = useMemo(() => new Map((prevRows ?? []).map((r) => [r.path, r])), [prevRows])
  const compared = prevRows !== undefined
  const q = query.trim().toLowerCase()
  const lines = useMemo(() => {
    const found = q ? rows.filter((r) => r.path.toLowerCase().includes(q)) : rows
    return sortRows(found.map((row): Line => ({ row, ...versus(row.pageviews, prev.get(row.path)?.pageviews, compared) })), sort, (l, key) => rank(l, key, sort))
  }, [rows, prev, compared, q, sort])

  // The first page of the list, opened once the list has rows (set while rendering, so the list is never painted
  // closed first). After it, `shown` is the reader's.
  if (owed && lines.length > 0) {
    setOwed(false)
    setShown(lines[0].row.path)
  }

  // The address holds the place (see the head of this file).
  const firstPath = lines[0]?.row.path ?? null
  useEffect(() => {
    const url = new URL(window.location.href)
    for (const word of LIST_PARAMS) url.searchParams.delete(word)
    if (query.trim()) url.searchParams.set('q', query.trim())
    if (sort.key !== FIRST_SORT.key || sort.dir !== FIRST_SORT.dir) url.searchParams.set('sort', `${sort.key}.${sort.dir}`)
    if (shown) {
      // The list's first page is what an address without the word opens: only another page is named.
      if (shown !== firstPath) url.searchParams.set('show', shown)
    } else if (!owed) {
      // Nothing is open and the first page is no longer owed: the reader closed it, and a reload keeps it closed.
      url.searchParams.set('show', NONE_SHOWN)
    }
    // The opened page's tab. While the first page is still OWED (the list has no row yet), the tab it will open on
    // stays in the address too: a list can be mounted before its rows and mounted again when they arrive, and the
    // address is all the second one starts from. Dropping the word there lost the tab over a reload.
    if ((shown || owed) && tab !== 'trend') url.searchParams.set('tab', tab)
    if (phone !== 'pageviews') url.searchParams.set('col', phone)
    window.history.replaceState({}, '', url.toString())
  }, [query, sort, shown, tab, phone, owed, firstPath])

  const days = rows[0]?.trend?.length ?? 0
  const { kind, buckets } = useMemo<{ kind: BucketKind; buckets: Bucket[] }>(() => bucketsFor(start, days, MAX_BARS), [start, days])
  // The hours are the rows' own, and the server may answer a day without them (a day too large to read by the
  // hour): then there is nothing to draw, and the bars are not headed "an hour" over nothing.
  const byHour = hourly && rows.some((r) => r.hours?.length === 24)
  const perBar = byHour ? 'Views an hour' : kind === 'day' ? 'Views a day' : kind === 'week' ? 'Views a week' : 'Views a month'
  // One day has one figure a day: a single bar says nothing, so without the day's hours the column is left out.
  const showBars = byHour || days > 1
  // A day still being counted is drawn up to the hour it has reached.
  const hoursShown = live && nowHour != null ? Math.min(24, nowHour + 1) : 24
  const hourNames = useMemo(() => Array.from({ length: hoursShown }, (_, h) => hourName(h)), [hoursShown])
  // Each column's classes, by whether it is the phone's.
  const columns = useMemo<SortColumn<Key>[]>(() => COLUMNS.map((c) => ({ key: c.key, label: c.label, className: c.key === phone ? c.on : c.off })), [phone])
  const cls = (key: Key) => columns.find((c) => c.key === key)!.className

  return (
    <section className={`${FRAME_SURFACE} min-w-0 p-6 [container-type:inline-size]`} data-pages-list="" data-sort-block="">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5">
          <span className={FRAME_CARD_NAME}>Pages</span>
          <TermInfoTip term="pages_list" />
        </span>
        {/* At the read's limit the list holds the busiest pages only, so the count says "500+", never a plain 500. */}
        <span className="me-auto text-[11px] text-neutral-500" data-pages-count="">
          {rows.length >= limit ? `${formatNumber(limit)}+` : formatNumber(rows.length)} {rows.length === 1 ? 'page' : 'pages'}
        </span>
        {/* The narrowest list has room for one number column; this picks it. A wider one shows the columns. */}
        <div className="cq-[380px]:hidden" data-phone-column="">
          <Select
            aria-label="The column to show"
            options={PHONE_OPTIONS}
            value={phone}
            onChange={(v) => { if (isKey(v)) setPhone(v) }}
            className="h-8 min-w-[8.5rem] text-xs"
          />
        </div>
        <div className="w-full cq-[380px]:w-60">
          <Input
            icon={<MagnifyingGlass className="h-4 w-4" aria-hidden="true" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages"
            aria-label="Search pages"
            className="h-9 pl-10 text-sm"
          />
        </div>
      </div>

      <div className="mb-1 flex h-6 items-center justify-between">
        <span className="min-w-0 flex-1 text-[11px] text-neutral-500">Page</span>
        {showBars && <span className={`${BARS} ml-4 text-[11px] text-neutral-500`} data-bars-head="">{perBar}</span>}
        <SortHead columns={columns} sort={sort} onSort={setSort} className="ml-4 gap-3" />
      </div>

      {lines.length === 0 ? (
        <EmptyState
          icon={<MagnifyingGlass />}
          title={q ? 'No page matches' : 'No page was viewed'}
          description={q ? `No address in this range holds "${query.trim()}".` : 'Try a longer range.'}
          className="py-10"
        />
      ) : (
        <CascadeGroup flipKey={`${sort.key}-${sort.dir}-${q}`} className="space-y-2">
          {lines.map((line, i) => {
            const { row } = line
            const isOpen = shown === row.path
            // A page opens on its Trend; the tab it was left on is kept only while it stays open.
            const press = () => { setOwed(false); setShown(isOpen ? null : row.path); setTab('trend') }
            return (
              <CascadeRow key={row.path} index={Math.min(i, 14)}>
                <div className={`interactive-row ${ROW} cursor-pointer${isOpen ? ' bg-white/[0.04]' : ''}`} data-page-line={row.path}>
                  <button
                    type="button"
                    className="absolute inset-0 h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange"
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? 'Hide' : 'Show'} how ${row.path} did over the period`}
                    onClick={press}
                  />
                  <div className="pointer-events-none relative flex min-w-0 flex-1 items-center gap-2">
                    {/* The blocks' caret: a quarter turn when open, orange on the open one (colour in a small mark). */}
                    <CaretRight
                      weight="bold"
                      className={cn('h-3 w-3 shrink-0 transition-[transform,color] duration-fast ease-apple', isOpen ? 'rotate-90 text-brand-ink' : 'text-neutral-600 group-hover:text-neutral-300')}
                      aria-hidden="true"
                    />
                    <File className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                    {/* The room the caret, the icon and the link take, which the address must leave free. */}
                    <PathLabel path={row.path} reserve={44 + (host ? 30 : 0)} title={row.path} className="text-sm text-white" />
                    {host && (
                      <a
                        href={`https://${host}${row.path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${row.path} in a new tab`}
                        className="pointer-events-auto relative z-10 -m-1 shrink-0 p-1 text-neutral-500 opacity-0 transition ease-apple hover:text-brand-ink focus:outline-none focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-brand-orange group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <ArrowSquareOut className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                  {/* The bars take the pointer for their own days; a press on them is still a press on the row. */}
                  {showBars && (
                    <span className={`${BARS} relative z-10 ml-4`} onClick={press}>
                      {byHour
                        ? <DayBars values={(row.hours ?? []).slice(0, hoursShown)} hours={hourNames} kind="day" buckets={[]} live={live} className="w-full" />
                        : <DayBars values={row.trend ?? []} kind={kind} buckets={buckets} live={live} className="w-full" />}
                    </span>
                  )}
                  <div className="pointer-events-none relative ml-4 flex shrink-0 items-center gap-3">
                    <CompactNumber value={row.pageviews} className={cn(cls('pageviews'), 'justify-end text-sm font-semibold tabular-nums text-white')} />
                    {/* The deck's change mark. A dash where nothing is compared; a change that rounds to nothing is
                        written as that, in grey, never as a fall of 0%. */}
                    <span className={`${cls('change')} justify-end`} data-line-change={line.change ?? ''}>
                      {line.changeMark == null
                        ? <span className="text-sm text-neutral-600">{DASH}</span>
                        : line.change === 0
                          ? <span className="text-[11px] font-medium tabular-nums text-neutral-500">0%</span>
                          : <RailDelta change={line.changeMark} />}
                    </span>
                    <CompactNumber value={row.visitors} className={cn(ROW_NUMBER, cls('visitors'), 'justify-end')} />
                    <span className={`${cls('entry_bounce_rate')} justify-end text-sm tabular-nums text-neutral-500`}>{percent(row.entry_bounce_rate)}</span>
                    <span className={`${cls('avg_time_on_page')} justify-end text-sm tabular-nums text-neutral-500`}>{seconds(row.avg_time_on_page)}</span>
                    <span className={`${cls('exit_rate')} justify-end text-sm tabular-nums text-neutral-500`}>{percent(row.exit_rate)}</span>
                    <span className={`${cls('avg_scroll_depth')} justify-end text-sm tabular-nums text-neutral-500`}>{percent(row.avg_scroll_depth)}</span>
                  </div>
                </div>
                {isOpen && (
                  <OpenedPage
                    row={row}
                    before={prev.get(row.path)}
                    compared={compared}
                    start={start}
                    prevStart={prevStart}
                    live={live}
                    host={host}
                    scroll={renderScroll?.(row.path)}
                    view={tab}
                    onView={setTab}
                    dashboardHref={dashboardHref?.(row.path)}
                    hours={renderHours?.(row.path)}
                    hoursCompare={hoursCompare}
                  />
                )}
              </CascadeRow>
            )
          })}
        </CascadeGroup>
      )}
    </section>
  )
}
