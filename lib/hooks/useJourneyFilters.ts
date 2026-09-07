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

// ---------------------------------------------------------------------------
// Journeys page state (07-09-2026 simplification).
//
// One view (Flow); Depth and Paths are Switchers over a short ladder; the
// entry point is a FILTER — the `entry_path` dimension in the same popover
// and pill row as country/device/referrer — and Depth, Paths and the period
// REMEMBER their last values the way every other page's timeframe does
// (`useUrlDateRange`'s `pulse_last_period:<pageKey>` scheme, applied here).
// The URL stays authoritative when it carries a value; memory only fills in
// when it does not, and it is read post-mount so the server and the first
// client render agree.
// ---------------------------------------------------------------------------

/** The entry page is the API's own `entry_path` parameter, carried as a dimension filter. */
export const ENTRY_DIMENSION = 'entry_path'

/** Journeys filters: the entry page plus the session_flows dimensions (design §8). */
export const JOURNEY_FILTER_DIMENSIONS = [ENTRY_DIMENSION, 'country', 'device', 'referrer'] as const

// ─── Constants ──────────────────────────────────────────────────────

export const DEPTH_MIN = 2
export const DEPTH_MAX = 6
export const DEPTH_DEFAULT = 4
export const DEPTH_OPTIONS = [2, 3, 4, 5, 6] as const

export const DENSITY_MIN = 5
export const DENSITY_MAX = 50
export const DENSITY_DEFAULT = 20
/** The Paths ladder: four values the Switcher offers (a 5-step ladder of ten was a spinner's shape, not a choice). */
export const DENSITY_OPTIONS = [5, 10, 20, 50] as const

const PAGE_KEY = 'journeys'
const PERIOD_KEY = `pulse_last_period:${PAGE_KEY}`
const DEPTH_KEY = `pulse_last_${PAGE_KEY}:depth`
const DENSITY_KEY = `pulse_last_${PAGE_KEY}:density`

// ─── Helpers ────────────────────────────────────────────────────────

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (raw === null) return fallback
  const n = parseInt(raw, 10)
  if (Number.isNaN(n)) return fallback
  if (n < min) return min
  if (n > max) return max
  return n
}

/** Snap a density to the ladder (a shared link may carry a legacy value such as 30). */
export function snapDensity(n: number): number {
  let best: number = DENSITY_OPTIONS[0]
  for (const o of DENSITY_OPTIONS) if (Math.abs(o - n) < Math.abs(best - n)) best = o
  return best
}

function readStoredInt(key: string, min: number, max: number): number | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return null
    const n = parseInt(raw, 10)
    if (!Number.isInteger(n) || n < min || n > max) return null
    return n
  } catch {
    return null
  }
}

function readStoredPeriod(): Period | null {
  try {
    const raw = window.localStorage.getItem(PERIOD_KEY)
    if (!raw) return null
    const p = parsePeriod(raw)
    // parsePeriod maps unknown values to the default — honour only an exact,
    // non-custom echo so garbage in storage cannot masquerade as a choice.
    return raw === p && p !== 'custom' ? p : null
  } catch {
    return null
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable (private mode) — memory is best-effort.
  }
}

interface Remembered {
  depth: number | null
  density: number | null
  period: Period | null
}

// ─── Hook ───────────────────────────────────────────────────────────

export interface JourneyFilters {
  depth: number
  committedDepth: number
  density: number
  committedDensity: number
  /** The entry page filter's value, or '' — the API's `entry_path`. */
  entryPath: string
  /** Pinned chain path; null = no lens. */
  lens: string | null
  /** Every dimension filter, the entry page included — what the pills and the builder show. */
  dimensionFilters: DimensionFilter[]
  /** Serialized `filters=` for the API — WITHOUT the entry page (that travels as `entry_path`). */
  filtersParam: string
  period: Period
  dateRange: { start: string; end: string }
  /** False for the one render before memory is read; callers hold their fetch until true. */
  ready: boolean

  setDepth: (n: number) => void
  setDensity: (n: number) => void
  setLens: (path: string | null) => void
  setDimensionFilters: (filters: DimensionFilter[]) => void
  setPeriod: (p: Period, customRange?: { start: string; end: string }) => void
}

export function useJourneyFilters(): JourneyFilters {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Memory, read once after mount (never during render — SSR and the first
  // client render must agree; see useUrlDateRange for the incident).
  const [remembered, setRemembered] = useState<Remembered | null>(null)
  useEffect(() => {
    setRemembered({
      depth: readStoredInt(DEPTH_KEY, DEPTH_MIN, DEPTH_MAX),
      density: readStoredInt(DENSITY_KEY, DENSITY_MIN, DENSITY_MAX),
      period: readStoredPeriod(),
    })
  }, [])
  const ready = remembered !== null

  const urlHasDepth = searchParams.has('depth')
  const urlHasDensity = searchParams.has('density')
  const urlHasPeriod = searchParams.has('period')

  const depth = urlHasDepth
    ? clampInt(searchParams.get('depth'), DEPTH_MIN, DEPTH_MAX, DEPTH_DEFAULT)
    : (remembered?.depth ?? DEPTH_DEFAULT)
  const density = snapDensity(
    urlHasDensity
      ? clampInt(searchParams.get('density'), DENSITY_MIN, DENSITY_MAX, DENSITY_DEFAULT)
      : (remembered?.density ?? DENSITY_DEFAULT),
  )
  const lens = searchParams.get('lens') || null

  // Filters. A pre-07-09 link carries `entry=` on its own; it is read as an
  // entry filter and rewritten into `filters=` on the next write.
  const rawFilters = searchParams.get('filters')
  const legacyEntry = searchParams.get('entry') ?? ''
  const dimensionFilters = useMemo(() => {
    const parsed = rawFilters ? parseFiltersFromURL(rawFilters) : []
    if (legacyEntry && !parsed.some((f) => f.dimension === ENTRY_DIMENSION)) {
      return [{ dimension: ENTRY_DIMENSION, operator: 'is' as const, values: [legacyEntry] }, ...parsed]
    }
    return parsed
  }, [rawFilters, legacyEntry])
  const entryPath = useMemo(() => {
    const f = dimensionFilters.find((x) => x.dimension === ENTRY_DIMENSION && x.operator === 'is')
    return f?.values[0] ?? ''
  }, [dimensionFilters])
  const filtersParam = useMemo(
    () => serializeFilters(dimensionFilters.filter((f) => f.dimension !== ENTRY_DIMENSION)),
    [dimensionFilters],
  )

  // Period: URL, else memory, else the default.
  const rawPeriod = parsePeriod(searchParams.get('period'))
  const rawStart = searchParams.get('start')
  const rawEnd = searchParams.get('end')
  const urlPeriod: Period =
    rawPeriod === 'custom' && (!isValidDateString(rawStart) || !isValidDateString(rawEnd))
      ? DEFAULT_PERIOD
      : rawPeriod
  const period: Period = urlHasPeriod ? urlPeriod : (remembered?.period ?? urlPeriod)

  const dateRange = useMemo(
    () =>
      period === 'custom' && rawStart && rawEnd
        ? { start: rawStart, end: rawEnd }
        : periodToDateRange(period),
    [period, rawStart, rawEnd],
  )

  // Debounce what the canvas is asked to draw: a click on the ladder should
  // not fire a request per intermediate value.
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
        if (value === null || value === '') params.delete(key)
        else params.set(key, String(value))
      }
      if (params.get('depth') === String(DEPTH_DEFAULT)) params.delete('depth')
      if (params.get('density') === String(DENSITY_DEFAULT)) params.delete('density')
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
      setRemembered((r) => ({ ...(r ?? { depth: null, density: null, period: null }), depth: clamped }))
      store(DEPTH_KEY, String(clamped))
    },
    [updateUrl],
  )
  const setDensity = useCallback(
    (n: number) => {
      const snapped = snapDensity(Math.max(DENSITY_MIN, Math.min(DENSITY_MAX, n)))
      updateUrl({ density: snapped })
      setRemembered((r) => ({ ...(r ?? { depth: null, density: null, period: null }), density: snapped }))
      store(DENSITY_KEY, String(snapped))
    },
    [updateUrl],
  )
  const setLens = useCallback((path: string | null) => updateUrl({ lens: path || null }), [updateUrl])
  const setDimensionFilters = useCallback(
    (filters: DimensionFilter[]) => updateUrl({ filters: serializeFilters(filters) || null, entry: null }),
    [updateUrl],
  )
  const setPeriod = useCallback(
    (p: Period, range?: { start: string; end: string }) => {
      if (p === 'custom' && range) updateUrl({ period: p, start: range.start, end: range.end })
      else updateUrl({ period: p, start: null, end: null })
      // Presets are remembered; a custom span is not (a frozen date range as
      // the default is the F12 bug — see useUrlDateRange).
      if (p !== 'custom') {
        setRemembered((r) => ({ ...(r ?? { depth: null, density: null, period: null }), period: p }))
        store(PERIOD_KEY, p)
      }
    },
    [updateUrl],
  )

  return {
    depth,
    committedDepth,
    density,
    committedDensity,
    entryPath,
    lens,
    dimensionFilters,
    filtersParam,
    period,
    dateRange,
    ready,
    setDepth,
    setDensity,
    setLens,
    setDimensionFilters,
    setPeriod,
  }
}
