// ---------------------------------------------------------------------------
// Column sorting for the Search Console tables — pure functions, no React.
// The API caps limit at 200 and only orders by clicks, so an active sort
// re-ranks the top SORT_FETCH rows client-side.
// ---------------------------------------------------------------------------

export const SORT_FETCH = 200

export type SortCol = 'clicks' | 'impressions' | 'ctr' | 'position'

export interface SortState {
  col: SortCol
  dir: 'desc' | 'asc'
}

// * ?s= grammar: "clicks" (desc) or "clicks:asc". Anything else → no sort.
export function parseSort(raw: string | null): SortState | null {
  if (!raw) return null
  const [col, dir] = raw.split(':')
  if (!['clicks', 'impressions', 'ctr', 'position'].includes(col)) return null
  return { col: col as SortCol, dir: dir === 'asc' ? 'asc' : 'desc' }
}

export function serializeSort(sort: SortState | null): string | null {
  if (!sort) return null
  return sort.dir === 'asc' ? `${sort.col}:asc` : sort.col
}

// * Stable sort; rows without a position always sink to the bottom regardless
// * of direction — "unknown" is not a rank.
export function sortRows<T extends { clicks: number; impressions: number; ctr: number; position: number | null }>(
  rows: T[],
  sort: SortState | null,
): T[] {
  if (!sort) return rows
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = a[sort.col]
    const bv = b[sort.col]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return (av - bv) * sign
  })
}
