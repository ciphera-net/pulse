'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, CaretDown, CaretUp } from '@phosphor-icons/react'
import { formatNumber } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import type { PageTableRow } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// The Pages table (PULSE-18). Anatomy approved 22-09-2026 from three variants
// injected on the live production dashboard:
// docs/plans/22-09-2026-pages-surface-design.md §10a–§10d.
//
// Owner picked the PLAIN COLUMN TABLE (option B) over the bar-share row and
// over the table-with-share-underline. So: no fills, no bars. The house's
// proportional row device deliberately does NOT come to this surface — it
// carries two numbers and this carries nine, and on real production skew
// (1,778 pageviews on the top row against 21 on the bottom) its fill renders
// as a staircase that reads as a rendering fault.
//
// Change indicator: placement B — Trend and Change side by side. The sparkline
// answers *what shape* and the delta answers *how much*; +267% is a different
// fact if it is a steady climb or a single day, and the number alone cannot say
// which.
//
// 🔴 NULL IS AN EM DASH, NEVER A ZERO. A page nobody entered has no entry
// bounce rate; a page with no scroll beacons has no scroll depth; a page with
// no prior period has no delta. Rendering 0 there claims a measurement that was
// never taken — and for the delta it specifically claims the page was FLAT.
// ---------------------------------------------------------------------------

type SortKey =
  | 'path' | 'pageviews' | 'visitors' | 'entries' | 'exits'
  | 'exit_rate' | 'avg_time_on_page' | 'entry_bounce_rate' | 'avg_scroll_depth' | 'delta'

interface Column {
  key: SortKey
  label: string
  width: string
  numeric: boolean
}

// Widths measured in the injected mock at 1440×1000; the header labels must not
// wrap and adjacent right-aligned labels must not touch (they did at 62-84px).
const COLUMNS: Column[] = [
  { key: 'pageviews', label: 'Views', width: '68px', numeric: true },
  { key: 'visitors', label: 'Visitors', width: '76px', numeric: true },
  { key: 'entries', label: 'Entries', width: '70px', numeric: true },
  { key: 'exit_rate', label: 'Exit rate', width: '82px', numeric: true },
  { key: 'avg_time_on_page', label: 'Time on page', width: '96px', numeric: true },
  { key: 'entry_bounce_rate', label: 'Bounce', width: '76px', numeric: true },
  { key: 'avg_scroll_depth', label: 'Scroll', width: '66px', numeric: true },
]

const GRID = `minmax(0,1fr) 68px 92px ${COLUMNS.map((c) => c.width).join(' ')}`

/** An em dash, not a zero — see the file header. */
const UNMEASURED = '—'

function pct(v: number | null): string {
  return v == null ? UNMEASURED : `${Math.round(v)}%`
}

function secs(v: number | null): string {
  if (v == null) return UNMEASURED
  const s = Math.round(v)
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

// * A 14-point line is enough to read a shape and cheap enough to draw per row.
// * Drawn from the row's own max so every sparkline uses its whole height —
// * these compare a page against ITSELF over time, never against other rows.
function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length < 2) {
    return <span className="text-sm text-neutral-600">{UNMEASURED}</span>
  }
  const w = 52
  const h = 16
  const max = Math.max(...values, 1)
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`)
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="rgb(var(--neutral-600))"
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

// * 🔑 The ARROW carries the direction, not the colour. Green and red reinforce
// * it; they never encode it alone. That is what makes this readable in
// * greyscale and to a colour-blind reader, and it is why the owner's
// * counter-proposal beat all three colour-only marks it replaced.
function Change({ delta }: { delta: number | null }) {
  if (delta == null) {
    return (
      <span className="text-sm text-neutral-600" title="No preceding period to compare against">
        {UNMEASURED}
      </span>
    )
  }
  const up = delta > 0
  const flat = Math.round(delta) === 0
  if (flat) {
    return <span className="text-sm tabular-nums text-neutral-500">0%</span>
  }
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-sm tabular-nums whitespace-nowrap',
        up ? 'text-green-400' : 'text-red-400'
      )}
    >
      <Icon className="w-3 h-3 shrink-0" weight="bold" aria-hidden="true" />
      {up ? '+' : ''}
      {Math.round(delta)}%
    </span>
  )
}

function cellValue(row: PageTableRow, key: SortKey): string {
  switch (key) {
    case 'pageviews': return formatNumber(row.pageviews)
    case 'visitors': return formatNumber(row.visitors)
    case 'entries': return formatNumber(row.entries)
    case 'exits': return formatNumber(row.exits)
    case 'exit_rate': return pct(row.exit_rate)
    case 'entry_bounce_rate': return pct(row.entry_bounce_rate)
    case 'avg_scroll_depth': return pct(row.avg_scroll_depth)
    case 'avg_time_on_page': return secs(row.avg_time_on_page)
    default: return ''
  }
}

// * 🔴 An unmeasured value sorts LAST in both directions. Treating null as 0
// * would rank every page that has no scroll beacon above one that scrolled 40%
// * on an ascending sort — a measurement that does not exist must not outrank
// * one that does.
function compare(a: PageTableRow, b: PageTableRow, key: SortKey, dir: 1 | -1): number {
  if (key === 'path') return a.path.localeCompare(b.path) * dir
  const av = a[key] as number | null
  const bv = b[key] as number | null
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  return (av - bv) * dir
}


interface SortHeaderProps {
  k: SortKey
  label: string
  sort: { key: SortKey; dir: 1 | -1 }
  onToggle: (k: SortKey) => void
  className?: string
}

// 🔴 MODULE SCOPE, deliberately. Defined inside PagesTable this is a new
// component type on every render, so React unmounts and remounts every header
// each time the sort changes — which silently drops keyboard focus, making a
// header impossible to activate twice in a row. Found by a test whose second
// fireEvent.click landed on a detached node.
function SortHeader({ k, label, sort, onToggle, className }: SortHeaderProps) {
  const active = sort.key === k
  const Caret = sort.dir === 1 ? CaretUp : CaretDown
  return (
    <button
      type="button"
      onClick={() => onToggle(k)}
      // aria-sort belongs on a role="columnheader", which a bare button is not.
      // This is a CSS grid rather than a <table>, so the sort state goes in the
      // accessible NAME, where a screen reader announces it on focus.
      aria-label={`Sort by ${label}${active ? (sort.dir === 1 ? ', ascending' : ', descending') : ''}`}
      className={cn(
        'group/h inline-flex items-center gap-1 text-xs uppercase tracking-wide whitespace-nowrap',
        'transition-colors duration-fast ease-apple focus-visible:outline-none',
        'focus-visible:ring-1 focus-visible:ring-brand-orange',
        active ? 'text-neutral-300' : 'text-neutral-500 hover:text-neutral-400',
        className
      )}
    >
      {label}
      <Caret
        className={cn(
          'w-3 h-3 shrink-0 transition-opacity',
          active ? 'opacity-100' : 'opacity-0 group-hover/h:opacity-40'
        )}
        weight="bold"
        aria-hidden="true"
      />
    </button>
  )
}

export interface PagesTableProps {
  rows: PageTableRow[]
  /** Shown in the header: how many pages exist before the search filter. */
  total?: number
  rangeLabel?: string
  /**
   * The card's own "Pages" title. Off on the dedicated route, where the page
   * already carries an h1 and the card repeating it reads as a duplicate —
   * visible only once the surface was looked at on staging. Left ON by default
   * so the component still stands alone anywhere else.
   */
  showTitle?: boolean
}

export default function PagesTable({ rows, total, rangeLabel, showTitle = true }: PagesTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'pageviews', dir: -1 })
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? rows.filter((r) => r.path.toLowerCase().includes(q)) : rows
    return [...filtered].sort((a, b) => compare(a, b, sort.key, sort.dir))
  }, [rows, query, sort])

  function toggle(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 }
        : { key, dir: key === 'path' ? 1 : -1 }
    )
  }

  return (
    <div className="rounded-none border border-border bg-card">
      <div className="flex h-10 items-center justify-between gap-3 border-b border-border px-4">
        {showTitle
          ? <span className="text-sm font-medium text-white shrink-0">Pages</span>
          : <span aria-hidden="true" />}
        <div className="flex items-center gap-3 min-w-0">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages…"
            aria-label="Search pages"
            className={cn(
              'h-7 w-44 min-w-0 rounded-none border border-border bg-secondary px-2',
              'text-xs text-neutral-300 placeholder:text-neutral-600',
              'focus:outline-none focus:border-neutral-600'
            )}
          />
          <span className="hidden text-xs text-neutral-500 whitespace-nowrap sm:block">
            {query
              ? `${formatNumber(shown.length)} of ${formatNumber(total ?? rows.length)}`
              : `${formatNumber(total ?? rows.length)} pages`}
            {rangeLabel ? ` · ${rangeLabel}` : ''}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="border-b border-border">
            <div className="grid items-center px-4" style={{ gridTemplateColumns: GRID, height: 32 }}>
              <SortHeader k="path" label="Page" sort={sort} onToggle={toggle} />
              <span className="text-xs uppercase tracking-wide text-neutral-500 whitespace-nowrap text-right pl-3">
                Trend
              </span>
              <SortHeader k="delta" label="Change" sort={sort} onToggle={toggle} className="justify-end pl-3" />
              {COLUMNS.map((c) => (
                <SortHeader key={c.key} k={c.key} label={c.label} sort={sort} onToggle={toggle} className="justify-end pl-3" />
              ))}
            </div>
          </div>

          <div className="py-1">
            {shown.map((row) => (
              <div
                key={row.path}
                className="group relative grid items-center px-4 hover:bg-secondary transition-colors duration-fast ease-apple"
                style={{ gridTemplateColumns: GRID, height: 36 }}
              >
                <span className="text-sm text-neutral-300 truncate pr-3" title={row.path}>
                  {row.path}
                </span>
                <span className="flex justify-end">
                  <Sparkline values={row.trend} />
                </span>
                <span className="flex justify-end">
                  <Change delta={row.delta} />
                </span>
                {COLUMNS.map((c) => (
                  <span
                    key={c.key}
                    className={cn(
                      'text-right tabular-nums text-sm whitespace-nowrap',
                      c.key === 'pageviews' || c.key === 'visitors'
                        ? 'font-semibold text-neutral-400'
                        : 'text-neutral-500'
                    )}
                  >
                    {cellValue(row, c.key)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {shown.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-neutral-500">
          {query ? `No pages match “${query}”.` : 'No pages in this range.'}
        </div>
      )}
    </div>
  )
}
