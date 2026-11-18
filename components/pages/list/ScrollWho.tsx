'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Switcher } from '@ciphera-net/facet'
import { SkeletonLine } from '@/components/skeletons'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { HEAT_STEPS } from '@/lib/dashboard/heatmapGrid'
import { ApiError } from '@/lib/api/client'
import { usePageScroll } from '@/lib/swr/dashboard'
import { formatNumber } from '@/lib/utils/format'
import { getCountryFlagIcon, getDeviceIcon, getReferrerDisplayName, getReferrerIcon } from '@/lib/utils/icons'
import type { PageScrollBy, PageScrollRow, ScrollDepthDistribution } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// WHO READS FURTHEST: how far one page's visits scroll, inside its opened row on the Pages page (ruling R80,
// 17-11-2026, picked out of seven options; scroll depth left the dashboard for this page by ruling R5).
//
// A heat map of the page's four quarters by device, source or country, in the grammar of the dashboard's "When
// people come" block (components/dashboard/bottom/WeekHeat.tsx): tabs that name what the rows are, ONE figure and
// its line over the grid (at rest the furthest reader, under the pointer the cell pointed at), and the heat map's
// own five steps of orange. Rows carry the dashboard's marks: device glyphs, source logos, flags. After the
// segments of Microsoft Clarity's scroll map.
//
// Shading: Everyone's row on its own scale (its quarters against its first); the rows under it against each
// other, column by column, so the brightest cell of a column is who reads furthest there.
//
// ONE read a tab (lib/swr/dashboard usePageScroll): the page's scroll depth for every visit and for the busiest
// values of the tab's dimension. The answer names the dimension it was asked for, so the rows of the tab before
// are never drawn under the next tab's name while its own read is on the way.
//
// THE TABS ARE THE BLOCKS' OWN (ruling R85, 18-11-2026): the orange Switcher of every dashboard block, and like
// them always on the page. Until then a tab whose read was on the way replaced the whole panel, tabs included, by
// a placeholder: the group left the page for the length of the read and came back with its highlight already
// moved (no glide), and an arrow key lost its focus with it. Now only what the read answers waits: the tabs
// stay, the highlight glides, and Everyone's row (the same on every tab) stays while the rows under it load.
// The tab is held by the page (PagesListPage), so it is kept from page to page and over a trip to Trend.
// ---------------------------------------------------------------------------

const QUARTERS = ['25%', '50%', '75%', 'The end'] as const
const KEYS = ['scroll_25', 'scroll_50', 'scroll_75', 'scroll_100'] as const

const DIMS: { value: PageScrollBy; label: string }[] = [
  { value: 'device', label: 'Devices' },
  { value: 'referrer', label: 'Sources' },
  { value: 'country', label: 'Countries' },
]
interface Who { key: string; name: string; icon: ReactNode; depth: ScrollDepthDistribution }
/** Rows under Everyone's. */
const ROWS = 4
/** Under this many visits a row's shares are noise: it is drawn, and it is not named the furthest reader. */
const ENOUGH = 30

// The heat map's five steps of orange (lib/dashboard/heatmapGrid.ts), its first (no colour) left out, and the ink
// at 8% for a cell with nothing in it: WeekHeat's own.
const NOTHING = 'rgb(var(--neutral-400) / 0.08)'
const STEPS = HEAT_STEPS.slice(1)
const tint = (value: number, max: number) => (value <= 0 || max <= 0 ? NOTHING : value === max ? STEPS[4] : STEPS[Math.min(3, Math.floor((value / max) * 4))])

/** The four quarters as shares of the visits, in percent; null where there is no visit. */
function shares(d?: ScrollDepthDistribution | null): number[] | null {
  if (!d || d.total_sessions <= 0) return null
  return KEYS.map((k) => (d[k] / d.total_sessions) * 100)
}
/** Whole numbers from 10%, one decimal below: a 1.5% must never print "2%" beside a 1.4% that prints "1%". */
const pct = (v: number) => (v >= 10 || v === 0 ? `${Math.round(v)}%` : `${v.toFixed(1)}%`)
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
function countryName(code: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code } catch { return code }
}
const sameDepth = (a: ScrollDepthDistribution, b: ScrollDepthDistribution) => a.total_sessions === b.total_sessions && KEYS.every((k) => a[k] === b[k])
const sum = (a: ScrollDepthDistribution, b: ScrollDepthDistribution): ScrollDepthDistribution => ({
  scroll_25: a.scroll_25 + b.scroll_25,
  scroll_50: a.scroll_50 + b.scroll_50,
  scroll_75: a.scroll_75 + b.scroll_75,
  scroll_100: a.scroll_100 + b.scroll_100,
  total_sessions: a.total_sessions + b.total_sessions,
})

/**
 * The answer's rows as the tab draws them: named and marked as the dashboard's lists are, the busiest first.
 * Sources are merged by the name the dashboard shows (google.com and google.de are one "Google"): a visit has
 * one referrer, so their counts add up. A visit with no referrer is left out, as it is on the dashboard's list.
 */
export function whoRows(by: PageScrollBy, rows: PageScrollRow[]): Who[] {
  if (by === 'device') return rows.filter((r) => r.value).slice(0, ROWS).map((r) => ({ key: `device:${r.value}`, name: cap(r.value), icon: getDeviceIcon(r.value), depth: r.depth }))
  if (by === 'country') return rows.filter((r) => r.value).slice(0, ROWS).map((r) => ({ key: `country:${r.value}`, name: countryName(r.value), icon: getCountryFlagIcon(r.value), depth: r.depth }))
  const byName = new Map<string, Who>()
  for (const r of rows) {
    if (!r.value) continue
    const name = getReferrerDisplayName(r.value)
    const hit = byName.get(name)
    if (hit) hit.depth = sum(hit.depth, r.depth)
    else byName.set(name, { key: `referrer:${name}`, name, icon: getReferrerIcon(name), depth: r.depth })
  }
  return [...byName.values()].sort((a, b) => b.depth.total_sessions - a.depth.total_sessions).slice(0, ROWS)
}

export interface ScrollWhoProps {
  siteId: string
  /** The page whose visits are read. */
  path: string
  start: string
  end: string
  apiPeriod?: string
  /** The page's filters as the dashboard sends them, WITHOUT the page itself (the read names it by `path`). */
  filters?: string
  /** What the rows are. Held by the page, so the choice is kept from one opened page to the next. */
  by: PageScrollBy
  onBy: (by: PageScrollBy) => void
}

export default function ScrollWho({ siteId, path, start, end, apiPeriod, filters, by: dim, onBy }: ScrollWhoProps) {
  const [over, setOver] = useState<{ row: number; col: number } | null>(null)
  const { data, error } = usePageScroll(siteId, path, dim, start, end, filters, apiPeriod)

  // Everyone's row is every visit of the page: the same whichever tab asked. The last answer's is kept while the
  // next tab's read is on the way, for as long as the page, the range and the filters are the ones it was read for.
  const ask = [path, start, end, filters ?? '', apiPeriod ?? ''].join('\n')
  const [kept, setKept] = useState<{ ask: string; all: ScrollDepthDistribution } | null>(null)
  // Set while rendering, and only when its numbers differ: one more render at most, and none that the same answer
  // handed over again as a new object could start.
  if (data && (kept?.ask !== ask || !sameDepth(kept.all, data.all))) setKept({ ask, all: data.all })
  const everyone = data?.all ?? (kept && kept.ask === ask ? kept.all : null)

  // A cell named by a finger stays named until the finger presses outside the grid: there is no "leave" on touch.
  useEffect(() => {
    if (!over) return
    const clear = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && !(e.target instanceof Element && e.target.closest('[data-who-grid]'))) setOver(null)
    }
    document.addEventListener('pointerdown', clear)
    return () => document.removeEventListener('pointerdown', clear)
  }, [over])

  // The answer in hand is this tab's own once it names this tab's dimension. Everyone's row is the same on every
  // tab, so it stays while the next tab's rows are on the way.
  const fresh = data?.by === dim
  const who = useMemo<Who[] | null>(() => (data && fresh ? whoRows(dim, data.rows) : null), [data, fresh, dim])

  // A read that failed with nothing in hand is said, never drawn as rows that wait for good. A range the server
  // will not break down for one page (a 422: too many rows in it) is a limit and is said as one: waiting does not
  // lift it, a shorter range does, and so can one filter fewer.
  const failed = !data && Boolean(error)
  const refused = failed && error instanceof ApiError && error.status === 422
  // Nothing in hand at all: the first read of this page, or of a new range.
  const waiting = !failed && !everyone
  const state = failed ? (refused ? 'refused' : 'failed') : waiting ? 'loading' : 'who'

  const rows: { key: string; name: string; icon: ReactNode; depth: ScrollDepthDistribution | null; loaded: boolean }[] = [
    { key: 'all', name: 'Everyone', icon: null, depth: everyone, loaded: Boolean(everyone) },
    ...(who
      ? who.map((w) => ({ ...w, loaded: true }))
      : Array.from({ length: ROWS }, (_, i) => ({ key: `wait:${i}`, name: '', icon: null, depth: null, loaded: false }))),
  ]
  const grid = rows.map((r) => shares(r.depth))
  const colMax = [0, 1, 2, 3].map((c) => Math.max(0, ...grid.slice(1).map((g) => g?.[c] ?? 0)))

  // The furthest reader: the row with the largest share at the end of the page, among rows with enough visits; and
  // the one it is set against, the smallest.
  let best = -1
  rows.forEach((r, i) => { if (i > 0 && r.depth && r.depth.total_sessions >= ENOUGH && (best < 0 || (grid[i]?.[3] ?? 0) > (grid[best]?.[3] ?? 0))) best = i })
  let least = -1
  rows.forEach((r, i) => { if (i > 0 && i !== best && r.depth && r.depth.total_sessions >= ENOUGH && (least < 0 || (grid[i]?.[3] ?? 0) < (grid[least]?.[3] ?? 0))) least = i })

  let figure = '—'
  let line = 'Not enough visits in this range to say who reads furthest.'
  if (over && rows[over.row]?.depth) {
    const d = rows[over.row].depth!
    figure = `${rows[over.row].name}, ${over.col === 3 ? 'the end' : `reached ${QUARTERS[over.col]}`}`
    line = `${formatNumber(d[KEYS[over.col]])} of ${formatNumber(d.total_sessions)} visits · ${pct(grid[over.row]![over.col])}`
  } else if (!who) {
    figure = ''
    line = ''
  } else if (best > 0) {
    // The heat map's own grammar: the thing, then what makes it first and its number.
    figure = rows[best].name
    line = least > 0
      ? `Furthest reader · ${pct(grid[best]![3])} of its visits reach the end, ${pct(grid[least]![3])} for ${rows[least].name}`
      : `Furthest reader · ${pct(grid[best]![3])} of its visits reach the end`
  }
  const by = DIMS.find((d) => d.value === dim)!.label.toLowerCase()

  return (
    <div className="flex h-full min-h-[232px] flex-col" data-page-scroll={state} data-who-dim={dim} data-who-rows={who ? rows.length : 0}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-h-[3.25rem] min-w-0" aria-live="polite" data-who-headline="" data-who-ready={who ? 'yes' : 'no'}>
          {failed ? null : figure === '' ? (
            // The loaded headline's own two lines, so nothing moves when the rows arrive.
            <div className="flex min-h-[3.25rem] flex-col justify-center gap-2" aria-hidden="true">
              <SkeletonLine className="h-6 w-40 max-w-full" />
              <SkeletonLine className="h-3 w-64 max-w-full" />
            </div>
          ) : (
            <>
              <span className="block truncate text-2xl font-semibold tabular-nums text-white">{figure}</span>
              <p className="truncate text-xs text-neutral-400">{line}</p>
            </>
          )}
        </div>
        {/* The blocks' own tabs, and always here: while a tab's read is on the way, and after one that failed (so
            another tab can still be pressed). */}
        <Switcher size="sm" tone="solid" aria-label="Who reads furthest, by" options={DIMS} value={dim} onChange={(v) => { onBy(v as PageScrollBy); setOver(null) }} />
      </div>
      {failed ? (
        <div className="flex flex-1 items-center justify-center">
          {refused
            ? <ErrorCard title="Scroll depth can't be shown for this range" description={filters ? 'Choose a shorter range or remove a filter.' : 'Choose a shorter range.'} />
            : <ErrorCard title="Could not load scroll depth" description="The request failed. This is usually temporary." />}
        </div>
      ) : (
      // On a phone the names take less and the heads lose "Reached": four cells of 50 px hold a share each.
      <div
        className="mt-2 grid flex-1 grid-cols-[minmax(72px,96px)_repeat(4,minmax(0,1fr))] gap-y-0 sm:grid-cols-[minmax(84px,150px)_repeat(4,minmax(0,1fr))]"
        onPointerLeave={() => setOver(null)}
        role="img"
        aria-label={`How far this page's visits scroll, by ${by}`}
        data-who-grid=""
      >
        <span />
        {QUARTERS.map((q) => <span key={q} className="truncate pb-1 pl-1 text-[11px] text-neutral-500">{q === 'The end' ? q : <><span className="hidden sm:inline">Reached </span>{q}</>}</span>)}
        {rows.map((r, i) => (
          <div key={r.key} className="contents">
            <span className={`flex min-w-0 items-center gap-2 pr-2 text-sm ${i === 0 ? 'text-neutral-400' : 'text-white'}`}>
              {r.icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center [&_img]:h-4 [&_img]:w-4 [&_svg]:h-4 [&_svg]:w-4">{r.icon}</span>}
              {r.loaded ? <span className="truncate">{r.name}</span> : <SkeletonLine className="h-3 w-16" />}
            </span>
            {[0, 1, 2, 3].map((c) => {
              const v = grid[i]?.[c]
              const on = over?.row === i && over.col === c
              const shade = v == null ? NOTHING : i === 0 ? tint(v, grid[0]?.[0] ?? 0) : tint(v, colMax[c])
              return (
                <div
                  key={c}
                  className="min-h-0 p-[2px]"
                  // A mouse points; a finger presses. Either names the cell, and nothing stays named once the pointer
                  // has left the grid (a finger: once it presses anywhere else).
                  onPointerEnter={(e) => { if (e.pointerType !== 'touch' && v != null) setOver({ row: i, col: c }) }}
                  onPointerDown={(e) => { if (e.pointerType === 'touch' && v != null) setOver({ row: i, col: c }) }}
                  data-who-cell={`${i}-${c}`}
                >
                  {/* The cell under the pointer is marked by its outline's colour alone: the cells touch, and a cell
                      that changed its opacity or size there would trade the pointer with its neighbour. */}
                  <div
                    className={`pointer-events-none flex h-full min-h-[30px] w-full items-center px-1 text-xs font-semibold tabular-nums outline outline-1 transition-[outline-color] duration-150 ease-apple sm:px-2 sm:text-sm ${on ? 'outline-white/70' : 'outline-transparent'} ${v != null && v > 0 ? 'text-white' : 'text-neutral-500'}`}
                    style={{ backgroundImage: `linear-gradient(${shade}, ${shade})` }}
                  >
                    {!r.loaded ? <SkeletonLine className="h-3 w-8" /> : v == null ? '—' : pct(v)}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      )}
    </div>
  )
}
