export type PctChangeResult =
  | { type: 'pct'; value: number }
  | { type: 'new' }
  | null

export function pctChange(current: number, previous: number): PctChangeResult {
  if (previous === 0 && current === 0) return null
  if (previous === 0) return { type: 'new' }
  return { type: 'pct', value: Math.round(((current - previous) / previous) * 100) }
}

/**
 * pctChange, but null (no badge) when the comparison base is too small to be
 * meaningful — a 1→3 visitor week is "↑200%" only in the least useful sense.
 * Mirrors the dashboard KPI rule (Chart.tsx: previous-window visitors < 10).
 */
export function guardedPctChange(
  current: number,
  previous: number,
  previousBase: number,
  minBase = 10,
): PctChangeResult {
  if (previousBase < minBase) return null
  return pctChange(current, previous)
}
