'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CaretDownIcon, CaretRight, CaretUpIcon } from '@phosphor-icons/react'
import { CascadeGroup, CascadeRow } from '@/components/dashboard/Cascade'
import { CardPager } from '@/components/dashboard/CardPager'
import { CardFooter } from '@/lib/dashboard/frame'
import { ROW_NUMBER } from '@/components/dashboard/MetricRowStat'
import { SortHead, type Sort, type SortColumn } from '@/components/dashboard/SortHead'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { formatLastSeen } from '@/lib/visitors/format'
import { formatNumber } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import type { DimensionFilter } from '@/lib/filters'
import type { VisitorRange, VisitorRow } from '@/lib/api/visitors'
import { DayMarks } from './DayMarks'
import OpenedVisitor, { type VisitorLinks } from './OpenedVisitor'
import { Marks, Place, ROW, Source, VisitorName } from './parts'

// ---------------------------------------------------------------------------
// The new Visitors page's list (look C, rulings R98 to R116; plan Pulse/docs/plans/18-11-2026-visitors-page-overhaul-
// plan.md): one line a visitor in the Pages page's list grammar (components/pages/list/PagesList.tsx), its 36 px rows
// with the full-row press, the caret, SortHead's capital names, the lead number in white and the rest dimmer; on every
// row their day as marks (DayMarks). The server sorts and pages (25 a page); the dashboard blocks' pager pages it (R116).
//
// THE VISITOR BESIDE THE LIST (R120, 20-11-2026): from 820 px of block the list takes three fifths
// and a panel beside it holds the visitor it points at (OpenedVisitor, under a line naming them with their carets to the
// visitor above and below); the panel shows the page's first visitor until a press picks another, and sticks under the
// frame's toolbar while the list scrolls. The visitor shown has the open row's tint and the orange caret. Under 820 px
// there is no room beside the list: a press unfolds the visitor under the row, and none opens by itself (R119).
//
// THE LIST LAYS ITSELF OUT BY THE ROOM IT HAS (the Pages page's rule): the block is a container, and each step leaves a
// visitor's name its whole width (the longest with its avatar and the caret: 212 px).
//   under 440 px   one number column, the reader's pick (the menu beside the block's name)
//   440 px         Pages, Visits, Last seen
//   660 px         and their day, sharing the room the fixed columns leave with the name
//   960 px         and Place, Device, Events
//   1180 px        and Source
// A column has two sets of classes: `on` when it is the phone's pick, `off` when it is not. Written out whole, so the
// stylesheet holds every class.
// ---------------------------------------------------------------------------

export type Key = 'pageviews' | 'visits' | 'events' | 'last_seen'

const COLUMN_SETS: readonly { key: Key; label: string; on: string; off: string }[] = [
  { key: 'pageviews', label: 'Pages', on: 'w-14 inline-flex', off: 'w-14 hidden cq-[440px]:inline-flex' },
  { key: 'visits', label: 'Visits', on: 'w-14 inline-flex', off: 'w-14 hidden cq-[440px]:inline-flex' },
  { key: 'events', label: 'Events', on: 'w-14 inline-flex cq-[440px]:hidden cq-[960px]:inline-flex', off: 'w-14 hidden cq-[960px]:inline-flex' },
  { key: 'last_seen', label: 'Last seen', on: 'w-16 inline-flex', off: 'w-16 hidden cq-[440px]:inline-flex' },
]
export const PHONE_OPTIONS = COLUMN_SETS.map((c) => ({ value: c.key as string, label: c.label }))
export const isKey = (v: unknown): v is Key => COLUMN_SETS.some((c) => c.key === v)

/** The server's name for each column's sort: Events sorts by the site's own events, the figure it shows (R110). */
export const SERVER_SORT: Record<Key, string> = { pageviews: 'pageviews', visits: 'visits', events: 'own_events', last_seen: 'last_seen' }
/** The first order: the most recently seen first, as the roster has always been. */
export const FIRST_SORT: Sort<Key> = { key: 'last_seen', dir: 'desc' }
/** A page of the list, the server's. */
export const PER_PAGE = 25

/** Their day, from 660 px of room: it shares what the fixed columns leave with the name, half each. */
const WAY = 'hidden min-w-0 flex-1 cq-[660px]:block'

/** The block's width from which the visitor sits beside the list (R120); under it the list stands alone. */
export const SPLIT_FROM = 820
/**
 * The panel sticks under the frame's toolbar, which sticks to the top of the same scroll (60 px at every width), with
 * the blocks' 16 px between: at a smaller top the panel's head slides under the toolbar (measured on the lab).
 */
const PANEL = 'sticky top-[76px] min-w-0 self-start'
/** The panel's up and down: the dashboard blocks' pager buttons (components/dashboard/CardPager.tsx: BTN, GHOST, OFF). */
const STEP = 'h-6 min-w-[24px] px-1 inline-flex items-center justify-center rounded-none transition-colors duration-fast ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange'
const STEP_ON = 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 cursor-pointer'
const STEP_OFF = 'text-neutral-500 opacity-40 cursor-default'
/** A layout effect in the browser, an effect on a server render (where there is no layout to measure). */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** The panel's head: the visitor named with their place, source and device, and the carets to the visitor above and below. */
function PanelHead({ v, at, count, onStep }: { v: VisitorRow; at: number; count: number; onStep: (index: number) => void }) {
  const up = at > 0
  const down = at < count - 1
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <VisitorName
          v={v}
          size={32}
          sub={
            <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] text-neutral-500">
              <span className="min-w-0 truncate"><Place v={v} /></span>
              <span aria-hidden="true" className="text-neutral-700">·</span>
              <span className="min-w-0 truncate"><Source referrer={v.referrer} /></span>
              <span aria-hidden="true" className="text-neutral-700">·</span>
              <span className="shrink-0"><Marks v={v} /></span>
            </span>
          }
        />
      </div>
      <span className="flex shrink-0 items-center gap-0.5" data-panel-steps="">
        <button type="button" aria-label="The visitor above" disabled={!up} onClick={() => { if (up) onStep(at - 1) }} className={cn(STEP, up ? STEP_ON : STEP_OFF)}>
          <CaretUpIcon className="h-3 w-3" weight="bold" />
        </button>
        <button type="button" aria-label="The visitor below" disabled={!down} onClick={() => { if (down) onStep(at + 1) }} className={cn(STEP, down ? STEP_ON : STEP_OFF)}>
          <CaretDownIcon className="h-3 w-3" weight="bold" />
        </button>
      </span>
    </div>
  )
}

export interface VisitorsListProps {
  siteId: string
  /** The server's page of rows, in its order. */
  rows: readonly VisitorRow[]
  /** Every visitor the list holds (the scope's size), for the pager. */
  total: number
  /** The page asked for, 1-based, as the pager counts: the pager shows it at once. */
  page: number
  /**
   * Which order and page the rows SHOWN are (VisitorsListAnswer.pageOf): the page flip and the opened visitor follow
   * it, never the page asked for, so a flip runs once, when the rows it flips to are here.
   */
  arrival: string
  onPage: (page: number) => void
  sort: Sort<Key>
  onSort: (sort: Sort<Key>) => void
  /** The one number column the narrowest list shows. */
  phone: Key
  range: VisitorRange
  siteTimezone: string
  links: VisitorLinks
  onFilter: (filters: DimensionFilter[]) => void
}

export default function VisitorsList({ siteId, rows, total, page, arrival, onPage, sort, onSort, phone, range, siteTimezone, links, onFilter }: VisitorsListProps) {
  const columns: SortColumn<Key>[] = COLUMN_SETS.map((c) => ({ key: c.key, label: c.label, className: c.key === phone ? c.on : c.off }))
  const cls = (key: Key) => columns.find((c) => c.key === key)!.className
  const zone = useDisplayZone(siteTimezone).zone
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE))
  // Whether the block has room for the visitor beside the list (R120), measured before the first paint: null until it
  // is, so a phone never mounts the panel (nor reads a visitor it will not show). The root is measured, never the list
  // column, whose width the answer itself changes.
  const root = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState<boolean | null>(null)
  useBrowserLayoutEffect(() => {
    const el = root.current
    if (!el) return
    setWide(el.getBoundingClientRect().width >= SPLIT_FROM)
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= SPLIT_FROM))
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const split = wide === true
  // What a press chose stays chosen until the next arrival (new rows: a page or an order). Beside the list the panel
  // shows the page's first visitor until a press picks another (R120); in place nothing opens by itself (R119,
  // 20-11-2026; until then the first visitor of a page opened by itself).
  const [open, setOpen] = useState<{ at: string; key: string | null } | null>(null)
  const chosen = open && open.at === arrival ? open.key : null
  const openKey = split ? chosen ?? rows[0]?.visitor_key ?? null : chosen
  const at = openKey ? rows.findIndex((r) => r.visitor_key === openKey) : -1
  const shown = split && at >= 0 ? rows[at] : null

  return (
    <div ref={root} className={cn(split && 'grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6')} data-visitors-list="" data-visitors-split={split ? '' : undefined}>
      {/* The list keeps its place in the tree in both layouts, so the block crossing 820 px never mounts its rows again. */}
      <div className="min-w-0 [container-type:inline-size]">
        <div className="mb-1 flex h-6 items-center justify-between text-[11px] text-neutral-500">
          <span className="min-w-0 flex-1">Visitor</span>
          <span className="ml-4 hidden w-36 shrink-0 cq-[960px]:inline">Place</span>
          <span className="ml-4 hidden w-16 shrink-0 cq-[960px]:inline">Device</span>
          <span className="ml-4 hidden w-40 shrink-0 cq-[1180px]:inline">Source</span>
          <span className={`${WAY} ml-4`} data-way-head="">Their day</span>
          <SortHead columns={columns} sort={sort} onSort={onSort} className="ml-4 gap-3" />
        </div>
        {/* Pressing a column's name re-orders the rows and moves nothing else: said here for a screen reader. */}
        <span aria-live="polite" className="sr-only">
          Sorted by {COLUMN_SETS.find((c) => c.key === sort.key)?.label.toLowerCase()}, {sort.dir === 'desc' ? 'high to low' : 'low to high'}
        </span>
        <CascadeGroup flipKey={arrival} className="space-y-2">
          {rows.map((v, i) => {
            const isOpen = openKey === v.visitor_key
            // Beside the list a press picks the visitor (the panel always shows one); in place it opens and closes them.
            const press = () => setOpen({ at: arrival, key: split ? v.visitor_key : isOpen ? null : v.visitor_key })
            const seen = v.active_now ? 'now' : formatLastSeen(v.last_seen, zone)
            return (
              <CascadeRow key={`${v.visitor_key}-${v.month}`} index={Math.min(i, 14)}>
                <div className={cn('interactive-row', ROW, 'cursor-pointer', isOpen && 'bg-white/[0.04]')} data-visitor-line={v.visitor_key}>
                  <button
                    type="button"
                    className="absolute inset-0 h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange"
                    aria-expanded={split ? undefined : isOpen}
                    aria-pressed={split ? isOpen : undefined}
                    aria-label={split ? 'Show this visitor beside the list' : `${isOpen ? 'Hide' : 'Show'} what this visitor did`}
                    onClick={press}
                  />
                  <span className="pointer-events-none relative flex min-w-0 flex-1 items-center gap-2">
                    {/* The blocks' caret: a quarter turn when open, orange on the open one (colour in a small mark). Beside
                        the panel it keeps pointing at it, orange on the visitor the panel shows. */}
                    <CaretRight weight="bold" className={cn('h-3 w-3 shrink-0 transition-[transform,color] duration-fast ease-apple', isOpen && !split && 'rotate-90', isOpen ? 'text-brand-ink' : 'text-neutral-600 group-hover:text-neutral-300')} aria-hidden="true" />
                    <VisitorName v={v} size={22} />
                  </span>
                  {/* The place and the marks take the pointer for their cards; a press on them is still a press on the row. */}
                  <span className="relative z-10 ml-4 hidden w-36 shrink-0 cq-[960px]:block" onClick={press}><Place v={v} /></span>
                  <span className="relative z-10 ml-4 hidden w-16 shrink-0 cq-[960px]:block" onClick={press}><Marks v={v} /></span>
                  <span className="pointer-events-none relative ml-4 hidden w-40 shrink-0 cq-[1180px]:block"><Source referrer={v.referrer} /></span>
                  <span className={`${WAY} relative z-10 ml-4`} onClick={press}><DayMarks day={v.day} /></span>
                  {/* Each number is said whole to a screen reader ("3 visits"), the visible numeral hidden from it: the row
                      is a flex layout, so nothing ties a number to its column's name. */}
                  <span className="pointer-events-none relative ml-4 flex shrink-0 items-center gap-3">
                    <span className={cn(cls('pageviews'), 'justify-end text-sm font-semibold tabular-nums text-white')}>
                      <span aria-hidden="true">{formatNumber(v.pageviews)}</span>
                      <span className="sr-only">{`${v.pageviews} ${v.pageviews === 1 ? 'page' : 'pages'}, `}</span>
                    </span>
                    <span className={cn(ROW_NUMBER, cls('visits'), 'justify-end tabular-nums')}>
                      <span aria-hidden="true">{v.visits}</span>
                      <span className="sr-only">{`${v.visits} ${v.visits === 1 ? 'visit' : 'visits'}, `}</span>
                    </span>
                    {/* The site's own events only (R110). */}
                    <span className={cn(cls('events'), 'justify-end text-sm tabular-nums text-neutral-500')} data-visitor-events="">
                      <span aria-hidden="true">{v.own_events ?? 0}</span>
                      <span className="sr-only">{`${v.own_events ?? 0} of the site's own ${(v.own_events ?? 0) === 1 ? 'event' : 'events'}, `}</span>
                    </span>
                    {/* "now" for a visitor on the site now (R111). */}
                    <span className={cn(cls('last_seen'), 'justify-end whitespace-nowrap text-sm tabular-nums', v.active_now ? 'text-white' : 'text-neutral-500')} data-visitor-seen={v.active_now ? 'now' : ''}>
                      <span aria-hidden="true">{seen}</span>
                      <span className="sr-only">{`last seen ${seen}`}</span>
                    </span>
                  </span>
                </div>
                {isOpen && wide === false && <OpenedVisitor siteId={siteId} row={v} range={range} siteTimezone={siteTimezone} links={links} onFilter={onFilter} className="mt-2" />}
              </CascadeRow>
            )
          })}
        </CascadeGroup>
        <div data-visitors-pager="cards">
          <CardFooter>
            <CardPager page={page} pageCount={pageCount} onPageChange={onPage} label="visitors" />
          </CardFooter>
        </div>
      </div>
      {shown && (
        <div className={PANEL} data-split-panel={shown.visitor_key}>
          <OpenedVisitor
            key={shown.visitor_key}
            siteId={siteId}
            row={shown}
            range={range}
            siteTimezone={siteTimezone}
            links={links}
            onFilter={onFilter}
            header={<PanelHead v={shown} at={at} count={rows.length} onStep={(i) => setOpen({ at: arrival, key: rows[i].visitor_key })} />}
          />
        </div>
      )}
    </div>
  )
}
