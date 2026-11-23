'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CaretDoubleLeftIcon, CaretDoubleRightIcon, CaretDownIcon, CaretRight, CaretUpIcon } from '@phosphor-icons/react'
import { Avatar, visitorAvatarSeed } from '@ciphera-net/facet-avatar'
import { CascadeGroup, CascadeRow } from '@/components/dashboard/Cascade'
import { CardPager } from '@/components/dashboard/CardPager'
import { CardFooter } from '@/lib/dashboard/frame'
import { ROW_NUMBER } from '@/components/dashboard/MetricRowStat'
import { SortHead, type Sort, type SortColumn } from '@/components/dashboard/SortHead'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { isPageShortcut, somethingIsOpen } from '@/lib/keyboard/shortcuts'
import { formatLastSeen } from '@/lib/visitors/format'
import { formatNumber } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import type { DimensionFilter } from '@/lib/filters'
import type { VisitorRange, VisitorRow } from '@/lib/api/visitors'
import { DayMarks } from './DayMarks'
import OpenedVisitor, { type VisitorLinks } from './OpenedVisitor'
import { Marks, nameOf, Place, ROW, Source, VisitorName } from './parts'

// ---------------------------------------------------------------------------
// The new Visitors page's list (look C, rulings R98 to R116; plan Pulse/docs/plans/18-11-2026-visitors-page-overhaul-
// plan.md): one line a visitor in the Pages page's list grammar (components/pages/list/PagesList.tsx), its 36 px rows
// with the full-row press, the caret, SortHead's capital names, the lead number in white and the rest dimmer; on every
// row their day as marks (DayMarks). The server sorts and pages (25 a page); the dashboard blocks' pager pages it (R116).
//
// THE VISITOR BESIDE THE LIST (R120, 20-11-2026; R121 the same night; R122 21-11-2026): from 820 px of block a 380 px
// panel beside the list holds the visitor it points at (OpenedVisitor in its compact form, under a line naming them with their place,
// source and device and the carets to the visitor above and below), and sticks under the frame's toolbar while the
// list scrolls. No visitor opens by itself there either (R119): the page and every new list (a tab, an order, a page,
// a range, a filter) start with the panel FOLDED into its strip, holding the list's first visitor (R123, 23-11-2026; from
// 21-11 the open panel said to press a visitor, and before that it showed the first visitor open). A press on the strip
// unfolds it on that visitor, a press on any row unfolds it on that row; » or Esc folds it again, and the list takes the
// room. The strip holds the visitor's face and name. The visitor a press picked has the open row's tint and the orange
// caret. Under 820 px there is no room beside the list: a press unfolds the visitor under the row, and none opens by
// itself (R119).
//
// THE LIST LAYS ITSELF OUT BY THE ROOM IT HAS (the Pages page's rule): the block is a container, and each step leaves a
// visitor's name its whole width (the longest with its avatar and the caret: 212 px).
//   under 440 px   one number column, the reader's pick (the menu beside the block's name)
//   440 px         Pages, Visits, Last seen
//   660 px         and their day, sharing the room the fixed columns leave with the name
//   960 px         and Place, Device, Events
//   1180 px        and Source
// Beside the panel (R121, R122) the list keeps Place, Device and Source in narrower columns, and Events and Visits step
// out (the panel counts both): Place 112 px and Device 56 from 700 px of list, Source 136 from 760 (a source's whole
// name: duckduckgo.com needs 109 px of text), Pages 48, 12 px between. The name takes two parts of the room left to
// their day's one and never less than the widest name needs, 212 px ("Thoughtful Cartographer" is 158 px of 14 px Geist,
// the widest of the 1,024 the pseudonyms make, with its caret and avatar), so the panel narrows their day, never a name.
// A number column alone has two sets of classes: `on` when it is the phone's pick, `off` when it is not. Written out
// whole, so the stylesheet holds every class.
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

/** Their day, from 660 px of room: it shares what the fixed columns leave with the name (half each alone). */
const WAY = 'hidden min-w-0 flex-1 cq-[660px]:block'
/** The number columns beside the panel (R121, R122): Pages narrower (its figure is short), Events and Visits out. */
const BESIDE_NUMBER: Record<Key, string> = { pageviews: 'w-12 inline-flex', visits: 'hidden', events: 'hidden', last_seen: 'w-16 inline-flex' }
/** The other columns, the list alone and beside the panel (R121); a head and its rows take the same classes. */
const LAYOUT = {
  alone: {
    name: 'flex-1',
    place: 'ml-4 hidden w-36 shrink-0 cq-[960px]:block',
    device: 'ml-4 hidden w-16 shrink-0 cq-[960px]:block',
    source: 'ml-4 hidden w-40 shrink-0 cq-[1180px]:block',
    way: `${WAY} ml-4`,
  },
  beside: {
    name: 'flex-[2] min-w-[212px]',
    place: 'ml-3 hidden w-28 shrink-0 cq-[700px]:block',
    device: 'ml-3 hidden w-14 shrink-0 cq-[700px]:block',
    source: 'ml-3 hidden w-[136px] shrink-0 cq-[760px]:block',
    way: `${WAY} ml-3`,
  },
} as const

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
/** The folded panel (R121): one press target down the list's side, 44 px, holding the visitor's face and name. */
const STRIP = 'flex w-11 flex-col items-center gap-3 border border-white/[0.08] py-3 text-neutral-500 transition-colors duration-fast ease-apple hover:bg-white/[0.04] hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange'
/** A layout effect in the browser, an effect on a server render (where there is no layout to measure). */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * The panel's head: the visitor named, with their place, source and device one to a line under the name (R121: each
 * starts with its own mark, the flag, the source's logo and the browser, so no dot parts them, and three lines for every
 * visitor keep the head one height as the carets step); the carets to the visitor above and below, and the fold.
 */
function PanelHead({ v, at, count, onStep, onFold }: { v: VisitorRow; at: number; count: number; onStep: (index: number) => void; onFold: () => void }) {
  const up = at > 0
  const down = at < count - 1
  return (
    <div className="flex items-start gap-3" data-panel-head="">
      <div className="min-w-0 flex-1">
        <VisitorName
          v={v}
          size={32}
          sub={
            <span className="mt-1 flex min-w-0 flex-col items-start gap-y-1 text-[13px] text-neutral-500" data-panel-meta="">
              <span className="flex min-w-0 max-w-full"><Place v={v} /></span>
              <span className="flex min-w-0 max-w-full"><Source referrer={v.referrer} /></span>
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
        <button type="button" aria-label="Fold the panel" title="Fold the panel (Esc)" onClick={onFold} className={cn(STEP, STEP_ON)} data-panel-fold="">
          <CaretDoubleRightIcon className="h-3 w-3" weight="bold" />
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
  const L = split ? LAYOUT.beside : LAYOUT.alone
  const columns: SortColumn<Key>[] = COLUMN_SETS.map((c) => ({ key: c.key, label: c.label, className: split ? BESIDE_NUMBER[c.key] : c.key === phone ? c.on : c.off }))
  const cls = (key: Key) => columns.find((c) => c.key === key)!.className
  // What a press chose stays chosen until the next arrival (new rows: a page or an order); a new list (a tab, a range, a
  // filter) mounts the list again. Only a press opens a visitor, beside the list and in place (R119).
  const [open, setOpen] = useState<{ at: string; key: string | null } | null>(null)
  const openKey = open && open.at === arrival ? open.key : null
  // The panel is open only on the arrival a press opened it on (R123): every new list starts with it folded into its
  // strip, which holds the visitor a press chose or, until one does, the list's first visitor.
  const [unfoldedAt, setUnfoldedAt] = useState<string | null>(null)
  const shut = split && unfoldedAt !== arrival
  const picked = openKey ? rows.findIndex((r) => r.visitor_key === openKey) : -1
  const at = picked >= 0 ? picked : rows.length > 0 ? 0 : -1
  const shown = split && at >= 0 ? rows[at] : null
  // A fold or an unfold from the keyboard keeps the focus in the panel's place: the control pressed is gone, so the
  // strip takes it on a fold and the fold button on an unfold.
  const panel = useRef<HTMLDivElement>(null)
  const refocus = useRef<'strip' | 'fold' | null>(null)
  const focusHere = () => typeof document !== 'undefined' && !!panel.current?.contains(document.activeElement)
  const fold = () => { refocus.current = focusHere() ? 'strip' : null; setUnfoldedAt(null) }
  // The strip opens the panel on the visitor it holds, who becomes the one picked.
  const unfold = () => {
    refocus.current = focusHere() ? 'fold' : null
    if (shown) setOpen({ at: arrival, key: shown.visitor_key })
    setUnfoldedAt(arrival)
  }
  useEffect(() => {
    const to = refocus.current
    refocus.current = null
    if (to) panel.current?.querySelector<HTMLElement>(to === 'strip' ? '[data-split-strip]' : '[data-panel-fold]')?.focus()
  }, [shut])
  // Esc folds the panel, unless the press is closing something else first (a menu, the filter, a dialog) or is typed
  // in a field (lib/keyboard/shortcuts.ts).
  useEffect(() => {
    if (!split || shut) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isPageShortcut(e) || somethingIsOpen()) return
      refocus.current = panel.current?.contains(document.activeElement) ? 'strip' : null
      setUnfoldedAt(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [split, shut])

  return (
    <div
      ref={root}
      className={cn(split && 'grid', split && (shut ? 'grid-cols-[minmax(0,1fr)_44px] gap-4' : 'grid-cols-[minmax(0,1fr)_380px] gap-6'))}
      data-visitors-list=""
      data-visitors-split={split ? '' : undefined}
      data-split-fold={split ? (shut ? 'shut' : 'open') : undefined}
    >
      {/* The list keeps its place in the tree in both layouts, so the block crossing 820 px never mounts its rows again. */}
      <div className="min-w-0 [container-type:inline-size]">
        <div className="mb-1 flex h-6 items-center justify-between text-[11px] text-neutral-500">
          <span className={cn('min-w-0', L.name)}>Visitor</span>
          <span className={L.place}>Place</span>
          <span className={L.device}>Device</span>
          <span className={L.source}>Source</span>
          <span className={L.way} data-way-head="">Their day</span>
          <SortHead columns={columns} sort={sort} onSort={onSort} className="ml-4 gap-3" />
        </div>
        {/* Pressing a column's name re-orders the rows and moves nothing else: said here for a screen reader. */}
        <span aria-live="polite" className="sr-only">
          Sorted by {COLUMN_SETS.find((c) => c.key === sort.key)?.label.toLowerCase()}, {sort.dir === 'desc' ? 'high to low' : 'low to high'}
        </span>
        <CascadeGroup flipKey={arrival} className="space-y-2">
          {rows.map((v, i) => {
            const isOpen = openKey === v.visitor_key
            // Beside the list a press picks the visitor (a second press keeps them) and unfolds the panel on them: a press is
            // asking to see them. In place it opens and closes them.
            const press = () => {
              setOpen({ at: arrival, key: split ? v.visitor_key : isOpen ? null : v.visitor_key })
              if (split) setUnfoldedAt(arrival)
            }
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
                  <span className={cn('pointer-events-none relative flex min-w-0 items-center gap-2', L.name)}>
                    {/* The blocks' caret: a quarter turn when open, orange on the open one (colour in a small mark). Beside
                        the panel it keeps pointing at it, orange on the visitor the panel shows. */}
                    <CaretRight weight="bold" className={cn('h-3 w-3 shrink-0 transition-[transform,color] duration-fast ease-apple', isOpen && !split && 'rotate-90', isOpen ? 'text-brand-ink' : 'text-neutral-600 group-hover:text-neutral-300')} aria-hidden="true" />
                    <VisitorName v={v} size={22} />
                  </span>
                  {/* The place and the marks take the pointer for their cards; a press on them is still a press on the row. */}
                  <span className={cn('relative z-10', L.place)} onClick={press}><Place v={v} /></span>
                  <span className={cn('relative z-10', L.device)} onClick={press}><Marks v={v} /></span>
                  <span className={cn('pointer-events-none relative', L.source)}><Source referrer={v.referrer} /></span>
                  <span className={cn('relative z-10', L.way)} onClick={press}><DayMarks day={v.day} /></span>
                  {/* Each number is said whole to a screen reader ("3 visits"), the visible numeral hidden from it: the row
                      is a flex layout, so nothing ties a number to its column's name. */}
                  <span className="pointer-events-none relative ml-4 flex shrink-0 items-center gap-3">
                    <span className={cn(cls('pageviews'), 'justify-end text-sm font-semibold tabular-nums text-white')}>
                      <span aria-hidden="true">{formatNumber(v.pageviews)}</span>
                      <span className="sr-only">{`${v.pageviews} ${v.pageviews === 1 ? 'page' : 'pages'}, `}</span>
                    </span>
                    <span className={cn(ROW_NUMBER, cls('visits'), 'justify-end tabular-nums')} data-visitor-visits="">
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
        <div ref={panel} className={PANEL} data-split-panel={shown.visitor_key}>
          {shut ? (
            // The folded panel: one press target, which opens it on the visitor it holds.
            <button type="button" onClick={unfold} aria-label={`Show ${nameOf(shown)} beside the list`} className={STRIP} data-split-strip="">
              <CaretDoubleLeftIcon className="h-3 w-3" weight="bold" aria-hidden="true" />
              <Avatar seed={visitorAvatarSeed(shown.visitor_key)} size={28} />
              <span className="text-[13px] text-neutral-300 [writing-mode:vertical-rl]">{nameOf(shown)}</span>
            </button>
          ) : (
            <OpenedVisitor
              key={shown.visitor_key}
              siteId={siteId}
              row={shown}
              range={range}
              siteTimezone={siteTimezone}
              links={links}
              onFilter={onFilter}
              compact
              header={<PanelHead v={shown} at={at} count={rows.length} onStep={(i) => setOpen({ at: arrival, key: rows[i].visitor_key })} onFold={fold} />}
            />
          )}
        </div>
      )}
    </div>
  )
}
