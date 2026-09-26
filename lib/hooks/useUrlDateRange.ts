'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PERIOD_PRESETS } from '@/lib/constants/periods'
import { siteWallClockNow } from '@/lib/utils/siteTime'
import { formatDate } from '@/lib/utils/format'
import {
  listFootnote,
  resolveView,
  viewRows,
  type AppliedView,
  type DateSpan,
  type RequestedView,
  type RowState,
  type Surface,
  type WindowState,
} from '@/lib/view/view'
import {
  DEFAULT_PERIOD,
  isValidDateString,
  parsePeriod,
  shiftDateRange,
  type Period,
} from './periodUrl'
import { useQueryParamsWriter } from './useQueryParamsWriter'

export type { Period }

// ---------------------------------------------------------------------------
// The view every date-ranged page shows (?period=&start=&end=), and the ONE memory
// of it (owner decision 25-09-2026, PULSE-20 — reversing the 22-08-2026 per-page
// ruling: "there should be one memory. so the user doesn't have to change views on
// every page").
//
// The URL is the source of truth when it carries a period. When it does not, the
// page opens on the reader's view: the last NAMED row they picked (localStorage,
// global across sites), or — until the tab closes — a custom or arrow-shifted range
// (sessionStorage). Only a pick or an arrow writes it. Opening a page, a shared
// ?period= link, back/forward, a fallback and a closest view NEVER do.
//
// Every page answers the requested view against its OWN data window
// (GET /sites/:id/data-window): a view with no data here becomes the closest view
// (lib/view/view.ts), fetched and ticked as what it is, while the memory keeps what
// was asked. Plan: Pulse/docs/plans/22-09-2026-unified-time-range-design.md §12.
// ---------------------------------------------------------------------------

// 🔴 NOT `pulse_last_period`. Until this change every mount ran
// `localStorage.removeItem('pulse_last_period')` (cleanup of the pre-22-08 shared key),
// so reusing that name would have made the one memory erase itself on every page load
// with every test green. The cleanup line is gone; the name is new.
export const VIEW_KEY = 'pulse_view'
/** sessionStorage — a custom or arrow-shifted range follows the reader until the tab closes. */
export const VIEW_RANGE_KEY = 'pulse_view_range'

/**
 * The per-page keys the one memory replaces, in the order they seed it: the DASHBOARD's
 * first (owner, 25-09-2026), then a fixed order through the rest, then the pre-22-08
 * shared key. All of them are deleted once read, on every mount, and never written.
 */
export const LEGACY_VIEW_KEYS: readonly string[] = [
  'pulse_last_period:dashboard',
  'pulse_last_period:pages',
  'pulse_last_period:visitors',
  'pulse_last_period:funnels',
  'pulse_last_period:journeys',
  'pulse_last_period:uptime',
  'pulse_last_period:cdn',
  'pulse_last_period:search',
  'pulse_last_period',
]

// 🔴 THE VIEW IS GLOBAL; THE APIs BEHIND IT ARE NOT. The analytics API refuses more
// than 366 days (measured 22-08-2026: a ?period=16m on the dashboard 400'd every card);
// Search Console holds ~480. A span over the page's ceiling is clamped keeping its end
// date (lib/view/view.ts) — never sent. All time is exempt: the server resolves it.
export const ANALYTICS_MAX_DAYS = 366
export const SEARCH_CONSOLE_MAX_DAYS = 480

const NAMED_ROWS: ReadonlySet<string> = new Set(PERIOD_PRESETS.map((p) => p.key))

/** A view the memory can hold: a named row, or (session only) a custom span. */
export interface StoredView {
  period: Period
  range?: DateSpan
}

function local(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function session(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * Reads the one memory, migrating the old per-page keys on the way. Storage is
 * best-effort throughout (private mode, blocked site data): any failure reads as "no
 * memory", which is the default view, never an error.
 */
export function readStoredView(): StoredView | null {
  const ls = local()
  const ss = session()
  try {
    if (ls) {
      if (ls.getItem(VIEW_KEY) === null) {
        for (const key of LEGACY_VIEW_KEYS) {
          const v = ls.getItem(key)
          if (v && NAMED_ROWS.has(v)) {
            ls.setItem(VIEW_KEY, v)
            break
          }
        }
      }
      for (const key of LEGACY_VIEW_KEYS) ls.removeItem(key)
    }
  } catch {
    // Storage unavailable — memory is best-effort.
  }
  // The session range is newer than any named pick in this tab: a named pick clears it.
  try {
    const raw = ss?.getItem(VIEW_RANGE_KEY)
    if (raw) {
      const r = JSON.parse(raw) as Partial<DateSpan>
      if (isValidDateString(r.start ?? null) && isValidDateString(r.end ?? null) && r.start! <= r.end!) {
        return { period: 'custom', range: { start: r.start!, end: r.end! } }
      }
    }
  } catch {
    // Garbage in storage is not a view.
  }
  try {
    const v = ls?.getItem(VIEW_KEY)
    if (v && NAMED_ROWS.has(v)) return { period: v as Period }
  } catch {
    // Storage unavailable.
  }
  return null
}

function rememberNamed(p: Period) {
  try {
    local()?.setItem(VIEW_KEY, p)
    session()?.removeItem(VIEW_RANGE_KEY)
  } catch {
    // Storage unavailable (private mode) — memory is best-effort.
  }
}

function rememberRange(range: DateSpan) {
  try {
    session()?.setItem(VIEW_RANGE_KEY, JSON.stringify(range))
  } catch {
    // Storage unavailable.
  }
}

export interface PageRangeOptions {
  /** Which page this is — the key of its window in the data-window response, and its words. */
  surface: Surface
  /**
   * The page's data window (useDataWindow): `undefined` while loading — periodReady
   * waits for it — `null` when unknown, which greys nothing.
   */
  window: WindowState
  /**
   * The zone this page's DAYS are in: the site's IANA zone (undefined while the site
   * loads — periodReady waits), or 'UTC' on CDN, whose days are Bunny's UTC days. Every
   * row resolves against this wall clock (siteWallClockNow), never the browser's.
   */
  timezone?: string | null
  /** The ceiling this page's API enforces, in days. Defaults to analytics (366). */
  maxDays?: number
  /** Periods that are a live MODE here (realtime on the dashboard and Visitors). */
  modes?: readonly Period[]
  /** Periods served as a rolling window, mapped to minutes (realtime → 5). */
  rollingMinutes?: Partial<Record<Period, number>>
  /** For "This site keeps N months of history". */
  retentionMonths?: number | null
  /** The calendar's caption ("Days follow the site's timezone · …"). */
  daysCaption?: string
}

/** Everything DateRangePicker needs, from one object — so menu and fetch cannot drift. */
export interface ViewPickerProps {
  label: string
  suffix: string | null
  tick: string | null
  rows: RowState[]
  footnote: string | null
  onPick: (period: Period) => void
  onCustom: (range: DateSpan) => void
  onShift: (direction: -1 | 1) => void
  shiftBackDisabled: boolean
  shiftForwardDisabled: boolean
  calendar: {
    /** Days before it are greyed (the page's first day of data). */
    min?: string
    /** Days after it are greyed (today, or the page's newest day). */
    max: string
    /** The longest span the page can load; a longer pick is refused in the calendar. */
    maxDays: number
    caption?: string
    range: DateSpan
  }
  now: Date
}

export interface UrlDateRange {
  /**
   * The period the page FETCHES with — the applied view's token: the requested row,
   * 'all', a mode, or 'custom' when the view is a concrete range (a custom pick, a
   * closest view, a clamp). Map it with PERIOD_TO_API; send dates when it maps to none.
   */
  period: Period
  /** The applied range (for All time: the page's data window). */
  dateRange: DateSpan
  /** What the URL or the memory asked for — which the applied view may differ from. */
  requestedPeriod: Period
  /**
   * The requested view whole — the token and, for a custom view, its span. A page that
   * steps away and back (the realtime detour) returns to THIS, never to the applied view:
   * a closest view or a clamp re-derives itself from the request on return.
   */
  requested: RequestedView
  /**
   * False until three things are known: the memory (or a URL period), the site's
   * timezone, and the page's data window. Until then `period`/`dateRange` are
   * PLACEHOLDERS and callers must not fetch with them.
   *
   * 🔴 THIS FLAG EXISTS BECAUSE A CUSTOMER WAS SHOWN 30 DAYS OF DATA UNDER A "Today"
   * LABEL (20-08-2026). The memory is read in an effect (a mount-time router.replace is
   * dropped during hydration), so the first render reports the default — a real SWR key,
   * warm on a return navigation, rendering 30 days one render before the view corrected.
   * The data window is the third gate for the same reason one layer deeper: a view
   * resolved before the window arrives may be about to become its closest view.
   * A ROLLING window (realtime) needs neither zone nor window: `minutes=` never touches
   * dates.
   */
  periodReady: boolean
  /** The active period's rolling width in minutes, or null for an ordinary date span. */
  rollingMinutes: number | null
  /** The stored view — what a fresh load would open on — or null. Never a mode. */
  remembered: StoredView | null
  /** The applied view, whole (label, tick, substitution) — for pages that say more. */
  view: AppliedView
  /** A PICK: writes the URL and the memory. */
  setPeriod: (p: Period, customRange?: DateSpan) => void
  /** Returns to a view without it counting as a pick (leaving realtime): URL only. */
  restoreView: (view: StoredView) => void
  /** An ARROW: shifts the applied range by its own span; follows the reader like a custom range. */
  shiftPeriod: (direction: -1 | 1) => void
  /** The page's wall clock (site's, or UTC) — the value every resolver here used. */
  siteNow: Date
  /** Spread into <DateRangePicker {...picker} />. */
  picker: ViewPickerProps
}

export function useUrlDateRange(options: PageRangeOptions): UrlDateRange {
  const { surface, window: dataWindow, timezone, modes, rollingMinutes, retentionMonths, daysCaption } = options
  const maxDays = options.maxDays ?? ANALYTICS_MAX_DAYS
  const searchParams = useSearchParams()
  const write = useQueryParamsWriter()

  // The page's wall clock, rebuilt once per MINUTE rather than on every render —
  // bucketing to the minute lets a long-lived mount roll "today" over at midnight
  // without a ticking timer. `timezone` undefined means "not known yet"; periodReady
  // is what stops that UTC stand-in reaching a fetch.
  const minuteBucket = Math.floor(Date.now() / 60_000)
  const siteNow = useMemo(
    () => siteWallClockNow(timezone),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timezone, minuteBucket],
  )

  const modesKey = (modes ?? []).join(',')
  const isMode = useCallback(
    (p: Period) => (modes ?? []).includes(p),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modesKey],
  )

  // The memory: read post-mount (never during SSR/hydration, so server and first
  // client render agree), then applied whenever the URL carries no period.
  const [stored, setStored] = useState<StoredView | null>(null)
  // Separate from `stored` on purpose: "nothing stored" and "not read yet" both read as
  // null, and only the second must suppress fetching.
  const [memoryRead, setMemoryRead] = useState(false)
  useEffect(() => {
    setStored(readStoredView())
    setMemoryRead(true)
  }, [])

  const urlHasPeriod = searchParams.get('period') !== null
  const rawPeriod = parsePeriod(searchParams.get('period'))
  const rawStart = searchParams.get('start')
  const rawEnd = searchParams.get('end')

  const requested: RequestedView = useMemo(() => {
    if (urlHasPeriod) {
      if (rawPeriod === 'custom') {
        return isValidDateString(rawStart) && isValidDateString(rawEnd) && rawStart <= rawEnd
          ? { period: 'custom', range: { start: rawStart, end: rawEnd } }
          : { period: DEFAULT_PERIOD }
      }
      return { period: rawPeriod }
    }
    // A mode is never the stored view (it cannot be written), and a stored one would be
    // a defect elsewhere — refused here too, so one bug cannot trap a reader live.
    if (stored && !isMode(stored.period)) return stored
    return { period: DEFAULT_PERIOD }
  }, [urlHasPeriod, rawPeriod, rawStart, rawEnd, stored, isMode])

  const view = useMemo(
    () =>
      resolveView({
        requested,
        now: siteNow,
        window: dataWindow,
        maxDays,
        modes,
        surface,
        retentionMonths,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requested, siteNow, dataWindow, maxDays, modesKey, surface, retentionMonths],
  )

  const activeRollingMinutes = rollingMinutes?.[view.period] ?? null
  const timezoneKnown = timezone !== undefined
  const windowKnown = dataWindow !== undefined
  const periodReady =
    (urlHasPeriod || memoryRead) && (activeRollingMinutes != null || (timezoneKnown && windowKnown))

  const updateUrl = useCallback(
    (updates: Record<string, string | null>) => {
      // Defaults stay out of the URL (the shared writer applies the rest).
      if (updates.period === DEFAULT_PERIOD) updates = { ...updates, period: null }
      write(updates)
    },
    [write],
  )

  const writeUrl = useCallback(
    (p: Period, range?: DateSpan) => {
      if (p === 'custom' && range) updateUrl({ period: p, start: range.start, end: range.end })
      else updateUrl({ period: p, start: null, end: null })
    },
    [updateUrl],
  )

  const setPeriod = useCallback(
    (p: Period, range?: DateSpan) => {
      writeUrl(p, range)
      // A mode is never remembered — it is something a reader is in, not a view they
      // chose for next time. A named row is the global view; a custom span follows the
      // reader until the tab closes. The state copy tracks the write, or picking the
      // default while another view is stored would visibly revert.
      if (isMode(p)) return
      if (p === 'custom' && range) {
        rememberRange(range)
        setStored({ period: 'custom', range })
      } else if (NAMED_ROWS.has(p)) {
        rememberNamed(p)
        setStored({ period: p })
      }
    },
    [writeUrl, isMode],
  )

  const restoreView = useCallback((v: StoredView) => writeUrl(v.period, v.range), [writeUrl])

  const today = formatDate(siteNow)
  const noShift = view.period === 'all' || isMode(view.period)

  const shiftPeriod = useCallback(
    (direction: -1 | 1) => {
      if (noShift) return
      const next = shiftDateRange(view.range, direction, siteNow)
      if (next) setPeriod('custom', next)
    },
    [noShift, view.range, siteNow, setPeriod],
  )

  const rows = useMemo(
    () => viewRows({ surface, now: siteNow, window: dataWindow, retentionMonths }),
    [surface, siteNow, dataWindow, retentionMonths],
  )
  const footnote = useMemo(
    () => view.note ?? listFootnote({ surface, now: siteNow, window: dataWindow, retentionMonths }, rows),
    [view.note, surface, siteNow, dataWindow, retentionMonths, rows],
  )

  const onPick = useCallback((p: Period) => setPeriod(p), [setPeriod])
  const onCustom = useCallback((r: DateSpan) => setPeriod('custom', r), [setPeriod])

  // The furthest day worth asking for: the page's newest day, or today. The calendar and
  // the forward arrow stop at the same edge, and the back arrow at the first day — an
  // arrow that steps into a span with no data would only bounce straight back through
  // the closest view (on Journeys, Yesterday → an empty Today → Yesterday again).
  const calendarMax = dataWindow && dataWindow.through < today ? dataWindow.through : today
  const picker: ViewPickerProps = useMemo(
    () => ({
      label: view.label,
      suffix: view.suffix,
      tick: view.tick,
      rows,
      footnote,
      onPick,
      onCustom,
      onShift: shiftPeriod,
      shiftBackDisabled: noShift || (dataWindow != null && view.range.start <= dataWindow.from),
      shiftForwardDisabled: noShift || view.range.end >= calendarMax,
      calendar: {
        min: dataWindow ? dataWindow.from : undefined,
        max: calendarMax,
        maxDays,
        caption: daysCaption,
        range: view.range,
      },
      now: siteNow,
    }),
    [view, rows, footnote, onPick, onCustom, shiftPeriod, noShift, dataWindow, calendarMax, maxDays, daysCaption, siteNow],
  )

  return {
    period: view.period,
    dateRange: view.range,
    requestedPeriod: requested.period,
    requested,
    periodReady,
    rollingMinutes: activeRollingMinutes,
    remembered: stored && !isMode(stored.period) ? stored : null,
    view,
    setPeriod,
    restoreView,
    shiftPeriod,
    siteNow,
    picker,
  }
}
