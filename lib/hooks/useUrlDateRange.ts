'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  DEFAULT_PERIOD,
  isValidDateString,
  parsePeriod,
  periodMaxDays,
  periodToDateRange,
  shiftDateRange,
  type Period,
} from './periodUrl'
import { useQueryParamsWriter } from './useQueryParamsWriter'

export type { Period }

// ---------------------------------------------------------------------------
// Shared URL-synced date range for date-ranged pages (funnels, behavior,
// search, CDN) (?period=&start=&end=) — the journeys grammar, so list and
// detail views are shareable and survive refresh. Defaults (period=30) stay
// out of the URL.
//
// The URL is the source of truth, but the last-chosen PRESET is remembered:
// a page reached with no ?period= takes the remembered preset as its
// EFFECTIVE default (state, applied post-mount — a mount-time router.replace
// is silently dropped while hydration is in flight, measured on the prod
// build). An explicit ?period= in a shared link always wins, and defaults
// stay out of the URL as before. Custom ranges are deliberately NOT
// remembered — a frozen stale date span as the default is the exact F12 bug
// the URL migration removed.
// ---------------------------------------------------------------------------

const LAST_PERIOD_KEY = 'pulse_last_period'

// 🔴 THE PRESET VOCABULARY IS GLOBAL; THE APIs BEHIND IT ARE NOT.
//
// Period covers up to '16m' (480 days) because Search Console retains ~480
// days, and the last-chosen preset is remembered ACROSS PAGES. The analytics
// API refuses anything over 366 days, so a customer who picked "Last 16
// months" on Search and then opened the Dashboard got HTTP 400 on every card
// and a "Couldn't load the dashboard" screen — measured in production
// 22-08-2026. Nothing was wrong with their data; the page asked a question
// its own API forbids.
//
// So every caller declares the ceiling ITS API enforces, and a period that
// exceeds it — whether it arrives from storage or from ?period= in a shared
// link — falls back to the default instead of being sent. Clamping on READ is
// what makes an already-poisoned localStorage heal itself on the next load
// rather than needing every affected customer to clear storage by hand.
export const ANALYTICS_MAX_DAYS = 366
export const SEARCH_CONSOLE_MAX_DAYS = 480

function withinCeiling(p: Period, maxDays: number): boolean {
  // 'custom' is exempt: it is not a preset with a span, it carries explicit
  // start/end chosen in the picker. Comparing its unbounded sentinel against
  // a finite cap rejected EVERY custom range — caught by the existing suite
  // while this ceiling was being written, which is what those tests are for.
  if (p === 'custom') return true
  return periodMaxDays(p) <= maxDays
}

function readLastPeriod(maxDays: number): Period | null {
  try {
    const raw = window.localStorage.getItem(LAST_PERIOD_KEY)
    if (!raw) return null
    const p = parsePeriod(raw)
    // parsePeriod maps unknown values to the default — honour only an exact,
    // non-custom echo so garbage in storage cannot masquerade as a choice.
    if (raw !== p || p === 'custom') return null
    // A preset this page's API cannot serve is not a usable memory. Dropping
    // it here (rather than at fetch time) means the picker shows the default
    // it will actually request, instead of a label whose fetch 400s.
    return withinCeiling(p, maxDays) ? p : null
  } catch {
    return null
  }
}

export interface UrlDateRange {
  period: Period
  dateRange: { start: string; end: string }
  /**
   * False for the one render between mount and the range-memory read, when the
   * URL carries no ?period=. During that render `period` is DEFAULT_PERIOD — a
   * PLACEHOLDER, not the user's choice — and callers must not fetch with it.
   *
   * 🔴 THIS FLAG EXISTS BECAUSE A CUSTOMER WAS SHOWN 30 DAYS OF DATA UNDER A
   * "Today" LABEL. 20-08-2026, themodestyhouse.com. The remembered preset is
   * read in an effect (deliberately — a mount-time router.replace is dropped
   * during hydration), so the first render reports DEFAULT_PERIOD='30' →
   * period=30d. That render is not harmless: it is a real SWR key, and on a
   * return navigation that key is already WARM, so the dashboard resolves
   * instantly to a 30-day range and every card downstream renders 30 days of
   * data one render before the period corrects to the remembered "today".
   *
   * The customer reported it as "Campaigns is empty, then shows data after I
   * navigate away and back". The empty state was the CORRECT one — that site
   * has no campaign traffic today. What was wrong was the data: `reddit`
   * (last seen 9 days earlier) and `copilot.com` (6 days earlier) can only
   * appear in a 30-day window, which is how the window was identified.
   *
   * Gating on this rather than reading storage synchronously in useState keeps
   * server and first client render in agreement, so hydration is unaffected.
   */
  periodReady: boolean
  setPeriod: (p: Period, customRange?: { start: string; end: string }) => void
  shiftPeriod: (direction: -1 | 1) => void
}

export function useUrlDateRange(options?: { maxDays?: number }): UrlDateRange {
  const maxDays = options?.maxDays ?? ANALYTICS_MAX_DAYS
  const searchParams = useSearchParams()
  const write = useQueryParamsWriter()

  const rawPeriod = parsePeriod(searchParams.get('period'))
  const rawStart = searchParams.get('start')
  const rawEnd = searchParams.get('end')

  // Range memory: read post-mount (never during SSR/hydration, so server and
  // first client render agree on the default), then applied as the effective
  // period whenever the URL carries none.
  const urlHasPeriod = searchParams.get('period') !== null
  const [remembered, setRemembered] = useState<Period | null>(null)
  // Separate from `remembered` on purpose: "no preset stored" and "storage not
  // read yet" both read as null, and only the second one must suppress
  // fetching. Collapsing them would leave a user who has never picked a preset
  // permanently un-ready.
  const [memoryRead, setMemoryRead] = useState(false)
  useEffect(() => {
    setRemembered(readLastPeriod(maxDays))
    setMemoryRead(true)
  }, [maxDays])

  // An explicit ?period= is authoritative immediately — there is nothing to
  // wait for, so shared links and in-app navigations that carry the param
  // never pay for this gate.
  const periodReady = urlHasPeriod || memoryRead

  // * period=custom without a valid start/end pair normalizes to the default
  const parsedUrlPeriod: Period =
    rawPeriod === 'custom' && (!isValidDateString(rawStart) || !isValidDateString(rawEnd))
      ? DEFAULT_PERIOD
      : rawPeriod
  // * A shared ?period=16m link opened on an analytics page would 400 exactly
  // * like the remembered preset did, so the ceiling applies to the URL too.
  const urlPeriod: Period = withinCeiling(parsedUrlPeriod, maxDays) ? parsedUrlPeriod : DEFAULT_PERIOD
  const period: Period = urlHasPeriod ? urlPeriod : (remembered ?? urlPeriod)

  const dateRange = useMemo(
    () =>
      period === 'custom' && rawStart && rawEnd
        ? { start: rawStart, end: rawEnd }
        : periodToDateRange(period),
    [period, rawStart, rawEnd],
  )

  const updateUrl = useCallback(
    (updates: Record<string, string | null>) => {
      // * Defaults stay out of the URL (the shared writer applies the rest).
      if (updates.period === DEFAULT_PERIOD) updates = { ...updates, period: null }
      write(updates)
    },
    [write],
  )

  const setPeriod = useCallback(
    (p: Period, range?: { start: string; end: string }) => {
      if (p === 'custom' && range) {
        updateUrl({ period: p, start: range.start, end: range.end })
      } else {
        updateUrl({ period: p, start: null, end: null })
      }
      // Presets are remembered as the future default; custom spans are not
      // (a frozen date range as the default is the F12 bug). The state copy
      // must track the write, or picking the default period while a
      // different preset is remembered would visibly revert.
      if (p !== 'custom') {
        setRemembered(p)
        try {
          window.localStorage.setItem(LAST_PERIOD_KEY, p)
        } catch {
          // Storage unavailable (private mode) — memory is best-effort.
        }
      }
    },
    [updateUrl],
  )

  const shiftPeriod = useCallback(
    (direction: -1 | 1) => {
      const next = shiftDateRange(dateRange, direction)
      if (next) setPeriod('custom', next)
    },
    [dateRange, setPeriod],
  )

  return { period, dateRange, periodReady, setPeriod, shiftPeriod }
}
