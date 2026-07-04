'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  DEFAULT_PERIOD,
  isValidDateString,
  parsePeriod,
  periodToDateRange,
  type Period,
} from './periodUrl'
import { serializeFilters, parseFiltersFromURL, type DimensionFilter } from '@/lib/filters'

export type { Period }

/** Journeys V1 supports only the session_flows dimensions (design §8). */
export const JOURNEY_FILTER_DIMENSIONS = ['country', 'device', 'referrer'] as const

// ─── Constants ──────────────────────────────────────────────────────

export const DEPTH_MIN = 2
export const DEPTH_MAX = 6
export const DEPTH_STEP = 1
export const DEPTH_DEFAULT = 4

export const DENSITY_MIN = 5
export const DENSITY_MAX = 50
export const DENSITY_STEP = 5
export const DENSITY_DEFAULT = 20

export type ViewMode = 'columns' | 'flow'

const VIEW_MODES: ReadonlySet<ViewMode> = new Set(['columns', 'flow'])

const DEFAULT_VIEW: ViewMode = 'columns'

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

// ─── Hook ───────────────────────────────────────────────────────────

export interface JourneyFilters {
  depth: number
  committedDepth: number
  density: number
  committedDensity: number
  entryPath: string
  /** Pinned chain path shared by both views; null = no lens. */
  lens: string | null
  /** Dashboard-codec dimension filters (country/device/referrer). */
  dimensionFilters: DimensionFilter[]
  /** Serialized `filters=` param, or '' when none. */
  filtersParam: string
  viewMode: ViewMode
  period: Period
  dateRange: { start: string; end: string }

  setDepth: (n: number) => void
  setDensity: (n: number) => void
  setEntryPath: (p: string) => void
  setLens: (path: string | null) => void
  setDimensionFilters: (filters: DimensionFilter[]) => void
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
  const lens = searchParams.get('lens') || null
  const viewMode = parseView(searchParams.get('view'))

  const rawFilters = searchParams.get('filters')
  const dimensionFilters = useMemo(
    () => (rawFilters ? parseFiltersFromURL(rawFilters) : []),
    [rawFilters],
  )
  const filtersParam = useMemo(() => serializeFilters(dimensionFilters), [dimensionFilters])

  // * Raw period value from URL (may be 'custom')
  const rawPeriod = parsePeriod(searchParams.get('period'))
  const rawStart = searchParams.get('start')
  const rawEnd = searchParams.get('end')

  // * If period=custom but dates invalid, normalize to default period
  const period: Period =
    rawPeriod === 'custom' &&
    (!isValidDateString(rawStart) || !isValidDateString(rawEnd))
      ? DEFAULT_PERIOD
      : rawPeriod

  const dateRange = useMemo(
    () =>
      period === 'custom' && rawStart && rawEnd
        ? { start: rawStart, end: rawEnd }
        : periodToDateRange(period),
    [period, rawStart, rawEnd],
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
    (n: number) => {
      const clamped = Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, n))
      updateUrl({ depth: clamped })
    },
    [updateUrl],
  )
  const setDensity = useCallback(
    (n: number) => {
      const clamped = Math.max(DENSITY_MIN, Math.min(DENSITY_MAX, n))
      updateUrl({ density: clamped })
    },
    [updateUrl],
  )
  const setEntryPath = useCallback(
    (p: string) => updateUrl({ entry: p || null }),
    [updateUrl],
  )
  const setLens = useCallback(
    (path: string | null) => updateUrl({ lens: path || null }),
    [updateUrl],
  )
  const setDimensionFilters = useCallback(
    (filters: DimensionFilter[]) => updateUrl({ filters: serializeFilters(filters) || null }),
    [updateUrl],
  )
  const setViewMode = useCallback(
    (m: ViewMode) => updateUrl({ view: m }),
    [updateUrl],
  )
  const setPeriod = useCallback(
    (p: Period, range?: { start: string; end: string }) => {
      if (p === 'custom' && range) {
        updateUrl({ period: p, start: range.start, end: range.end })
      } else {
        // * Non-custom period: strip start/end
        updateUrl({ period: p, start: null, end: null })
      }
    },
    [updateUrl],
  )

  const resetFilters = useCallback(() => {
    updateUrl({
      depth: null,
      density: null,
      entry: null,
      lens: null,
      filters: null,
      view: null,
      period: null,
      start: null,
      end: null,
    })
  }, [updateUrl])

  const isDefault =
    depth === DEPTH_DEFAULT &&
    density === DENSITY_DEFAULT &&
    entryPath === '' &&
    lens === null &&
    dimensionFilters.length === 0 &&
    viewMode === DEFAULT_VIEW &&
    period === DEFAULT_PERIOD

  return {
    depth,
    committedDepth,
    density,
    committedDensity,
    entryPath,
    lens,
    dimensionFilters,
    filtersParam,
    viewMode,
    period,
    dateRange,
    setDepth,
    setDensity,
    setEntryPath,
    setLens,
    setDimensionFilters,
    setViewMode,
    setPeriod,
    resetFilters,
    isDefault,
  }
}
