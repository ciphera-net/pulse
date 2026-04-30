export type PctChangeResult =
  | { type: 'pct'; value: number }
  | { type: 'new' }
  | null

export function pctChange(current: number, previous: number): PctChangeResult {
  if (previous === 0 && current === 0) return null
  if (previous === 0) return { type: 'new' }
  return { type: 'pct', value: Math.round(((current - previous) / previous) * 100) }
}
