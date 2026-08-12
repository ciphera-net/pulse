'use client'

import { useCallback, useMemo } from 'react'
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
// ---------------------------------------------------------------------------

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

  // * period=custom without a valid start/end pair normalizes to the default
  const period: Period =
    rawPeriod === 'custom' && (!isValidDateString(rawStart) || !isValidDateString(rawEnd))
      ? DEFAULT_PERIOD
      : rawPeriod

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
