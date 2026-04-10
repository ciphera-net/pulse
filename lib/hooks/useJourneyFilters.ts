'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  getDateRange,
  getThisWeekRange,
  getThisMonthRange,
  formatDate,
} from '@/lib/utils/dateRanges'

// ─── Constants ──────────────────────────────────────────────────────

export const DEPTH_MIN = 2
export const DEPTH_MAX = 6
export const DEPTH_DEFAULT = 4

export const DENSITY_MIN = 5
export const DENSITY_MAX = 50
export const DENSITY_DEFAULT = 20

export type ViewMode = 'columns' | 'flow'
export type Period = 'today' | '7' | '30' | 'week' | 'month' | 'custom'

const VIEW_MODES: ReadonlySet<ViewMode> = new Set(['columns', 'flow'])
const PERIODS: ReadonlySet<Period> = new Set([
  'today',
  '7',
  '30',
  'week',
  'month',
  'custom',
])

const DEFAULT_VIEW: ViewMode = 'columns'
const DEFAULT_PERIOD: Period = '30'

// ─── Helpers ────────────────────────────────────────────────────────

function clampInt(
  raw: string | null,
  min: number,
  max: number,
  fallback: number,
): number {
  if (raw === null) return fallback
  const n = parseInt(raw, 10)
  if (Number.isNaN(n)) return fallback
  if (n < min) return min
  if (n > max) return max
  return n
}

function parseView(raw: string | null): ViewMode {
  if (raw && VIEW_MODES.has(raw as ViewMode)) return raw as ViewMode
  return DEFAULT_VIEW
}

function parsePeriod(raw: string | null): Period {
  if (raw && PERIODS.has(raw as Period)) return raw as Period
  return DEFAULT_PERIOD
}

function periodToDateRange(
  period: Period,
  customRange?: { start: string; end: string },
) {
  switch (period) {
    case 'today': {
      const today = formatDate(new Date())
      return { start: today, end: today }
    }
    case '7':
      return getDateRange(7)
    case '30':
      return getDateRange(30)
    case 'week':
      return getThisWeekRange()
    case 'month':
      return getThisMonthRange()
    case 'custom':
      return customRange ?? getDateRange(30)
  }
}

// ─── Hook ───────────────────────────────────────────────────────────

export interface JourneyFilters {
  depth: number
  committedDepth: number
  density: number
  committedDensity: number
  entryPath: string
  viewMode: ViewMode
  period: Period
  dateRange: { start: string; end: string }

  setDepth: (n: number) => void
  setDensity: (n: number) => void
  setEntryPath: (p: string) => void
  setViewMode: (m: ViewMode) => void
  setPeriod: (p: Period, customRange?: { start: string; end: string }) => void
  resetFilters: () => void
  isDefault: boolean
}

export function useJourneyFilters(): JourneyFilters {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const depth = clampInt(
    searchParams.get('depth'),
    DEPTH_MIN,
    DEPTH_MAX,
    DEPTH_DEFAULT,
  )
  const density = clampInt(
    searchParams.get('density'),
    DENSITY_MIN,
    DENSITY_MAX,
    DENSITY_DEFAULT,
  )
  const entryPath = searchParams.get('entry') ?? ''
  const viewMode = parseView(searchParams.get('view'))
  const period = parsePeriod(searchParams.get('period'))

  const [customRange, setCustomRange] = useState<
    { start: string; end: string } | undefined
  >(undefined)
  const dateRange = useMemo(
    () => periodToDateRange(period, customRange),
    [period, customRange],
  )

  const [committedDepth, setCommittedDepth] = useState(depth)
  const [committedDensity, setCommittedDensity] = useState(density)

  useEffect(() => {
    const t = setTimeout(() => setCommittedDepth(depth), 300)
    return () => clearTimeout(t)
  }, [depth])

  useEffect(() => {
    const t = setTimeout(() => setCommittedDensity(density), 150)
    return () => clearTimeout(t)
  }, [density])

  const updateUrl = useCallback(
    (updates: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          params.delete(key)
        } else {
          params.set(key, String(value))
        }
      }
      if (params.get('depth') === String(DEPTH_DEFAULT)) params.delete('depth')
      if (params.get('density') === String(DENSITY_DEFAULT))
        params.delete('density')
      if (params.get('view') === DEFAULT_VIEW) params.delete('view')
      if (params.get('period') === DEFAULT_PERIOD) params.delete('period')
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const setDepth = useCallback(
    (n: number) => updateUrl({ depth: n }),
    [updateUrl],
  )
  const setDensity = useCallback(
    (n: number) => updateUrl({ density: n }),
    [updateUrl],
  )
  const setEntryPath = useCallback(
    (p: string) => updateUrl({ entry: p || null }),
    [updateUrl],
  )
  const setViewMode = useCallback(
    (m: ViewMode) => updateUrl({ view: m }),
    [updateUrl],
  )
  const setPeriod = useCallback(
    (p: Period, range?: { start: string; end: string }) => {
      if (p === 'custom' && range) {
        setCustomRange(range)
      }
      updateUrl({ period: p })
    },
    [updateUrl],
  )

  const resetFilters = useCallback(() => {
    updateUrl({
      depth: null,
      density: null,
      entry: null,
      view: null,
      period: null,
    })
    setCustomRange(undefined)
  }, [updateUrl])

  const isDefault =
    depth === DEPTH_DEFAULT &&
    density === DENSITY_DEFAULT &&
    entryPath === '' &&
    viewMode === DEFAULT_VIEW &&
    period === DEFAULT_PERIOD

  return {
    depth,
    committedDepth,
    density,
    committedDensity,
    entryPath,
    viewMode,
    period,
    dateRange,
    setDepth,
    setDensity,
    setEntryPath,
    setViewMode,
    setPeriod,
    resetFilters,
    isDefault,
  }
}
