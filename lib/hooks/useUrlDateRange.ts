'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  DEFAULT_PERIOD,
  isValidDateString,
  parsePeriod,
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

function readLastPeriod(): Period | null {
  try {
    const raw = window.localStorage.getItem(LAST_PERIOD_KEY)
    if (!raw) return null
    const p = parsePeriod(raw)
    // parsePeriod maps unknown values to the default — honour only an exact,
    // non-custom echo so garbage in storage cannot masquerade as a choice.
    return raw === p && p !== 'custom' ? p : null
  } catch {
    return null
  }
}

export interface UrlDateRange {
  period: Period
  dateRange: { start: string; end: string }
  setPeriod: (p: Period, customRange?: { start: string; end: string }) => void
  shiftPeriod: (direction: -1 | 1) => void
}

export function useUrlDateRange(): UrlDateRange {
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
  useEffect(() => {
    setRemembered(readLastPeriod())
  }, [])

  // * period=custom without a valid start/end pair normalizes to the default
  const urlPeriod: Period =
    rawPeriod === 'custom' && (!isValidDateString(rawStart) || !isValidDateString(rawEnd))
      ? DEFAULT_PERIOD
      : rawPeriod
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

  return { period, dateRange, setPeriod, shiftPeriod }
}
