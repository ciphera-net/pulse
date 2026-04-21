// * Dimension filter types and utilities for dashboard filtering

export interface DimensionFilter {
  dimension: string
  operator: 'is' | 'is_not' | 'contains' | 'not_contains'
  values: string[]
}

export const DIMENSION_LABELS: Record<string, string> = {
  page: 'Page',
  referrer: 'Referrer',
  country: 'Country',
  city: 'City',
  region: 'Region',
  browser: 'Browser',
  os: 'OS',
  device: 'Device',
  utm_source: 'UTM Source',
  utm_medium: 'UTM Medium',
  utm_campaign: 'UTM Campaign',
}

export const OPERATOR_LABELS: Record<string, string> = {
  is: 'is',
  is_not: 'is not',
  contains: 'contains',
  not_contains: 'does not contain',
}

export const DIMENSIONS = Object.keys(DIMENSION_LABELS)
export const OPERATORS = Object.keys(OPERATOR_LABELS) as DimensionFilter['operator'][]

export const DIMENSION_CATEGORIES = [
  { label: 'URL', dimensions: ['page'] },
  { label: 'Acquisition', dimensions: ['referrer', 'utm_source', 'utm_medium', 'utm_campaign'] },
  { label: 'Device', dimensions: ['browser', 'os', 'device'] },
  { label: 'Audience', dimensions: ['country', 'region', 'city'] },
] as const

/** Serialize filters to query param format: "browser|is|Chrome,country|is|US" */
export function serializeFilters(filters: DimensionFilter[]): string {
  if (!filters.length) return ''
  return filters
    .map(f => `${f.dimension}|${f.operator}|${f.values.join(';')}`)
    .join(',')
}

/** Parse filters from URL search param string */
export function parseFiltersFromURL(raw: string): DimensionFilter[] {
  if (!raw) return []
  return raw.split(',').map(part => {
    const [dimension, operator, valuesRaw] = part.split('|')
    return {
      dimension,
      operator: operator as DimensionFilter['operator'],
      values: valuesRaw?.split(';') ?? [],
    }
  }).filter(f => f.dimension && f.operator && f.values.length > 0)
}

/** Build display label for a filter pill */
export function filterLabel(f: DimensionFilter): string {
  const dim = DIMENSION_LABELS[f.dimension] || f.dimension
  const op = OPERATOR_LABELS[f.operator] || f.operator
  const val = f.values.length > 1 ? `${f.values[0]} +${f.values.length - 1}` : f.values[0]
  return `${dim} ${op} ${val}`
}
