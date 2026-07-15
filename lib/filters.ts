// * Dimension filter types and utilities for dashboard filtering

export interface DimensionFilter {
  dimension: string
  operator: 'is' | 'is_not' | 'contains' | 'not_contains'
  values: string[]
}

/** A suggested value for a dimension, sourced from the breakdown endpoints. */
export interface FilterSuggestion {
  value: string
  label: string
  count?: number
}

export const DIMENSION_LABELS: Record<string, string> = {
  page: 'Page',
  referrer: 'Referrer',
  channel: 'Channel',
  country: 'Country',
  city: 'City',
  region: 'Region',
  browser: 'Browser',
  os: 'OS',
  device: 'Device',
  screen_resolution: 'Screen Resolution',
  utm_source: 'UTM Source',
  utm_medium: 'UTM Medium',
  utm_campaign: 'UTM Campaign',
  utm_term: 'UTM Term',
  utm_content: 'UTM Content',
  event_name: 'Event',
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
  { label: 'Pages', dimensions: ['page'] },
  { label: 'Sources', dimensions: ['referrer', 'channel'] },
  { label: 'Campaigns', dimensions: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] },
  { label: 'Device', dimensions: ['browser', 'os', 'device', 'screen_resolution'] },
  { label: 'Audience', dimensions: ['country', 'region', 'city'] },
  { label: 'Events', dimensions: ['event_name'] },
] as const

// * Values may legitimately contain the format's structural delimiters
// * (`,` between filters, `|` between fields, `;` between values), so the v2
// * format percent-escapes each value on serialize and unescapes on parse.
// * Only the delimiters and `%` itself are escaped.
// *
// * The format is VERSIONED via the "v2:" prefix because escaping is ambiguous
// * in-band: stored page paths routinely contain literal %2C/%7C/%3B/%25 (the
// * ingest pipeline re-encodes retained query strings), so a legacy URL like
// * "page|is|/search?q=a%2Cb" must NOT be unescaped. Unprefixed (legacy) input
// * is parsed exactly as before — raw values, byte-for-byte. No legacy string
// * can collide with the prefix: dimensions are allowlisted and "v2:page" is
// * not one. The backend mirrors all of this in ParseFilters
// * (internal/api/stats.go).
export const FILTERS_V2_PREFIX = 'v2:'

const VALUE_ESCAPES: ReadonlyArray<readonly [RegExp, string]> = [
  [/%/g, '%25'], // must run first: escapes the escape character
  [/,/g, '%2C'],
  [/\|/g, '%7C'],
  [/;/g, '%3B'],
]

export function escapeFilterValue(value: string): string {
  return VALUE_ESCAPES.reduce((v, [re, code]) => v.replace(re, code), value)
}

export function unescapeFilterValue(value: string): string {
  // * Decodes exactly the four sequences the escaper produces (uppercase only),
  // * with %25 last so a decoded "%" can never be re-consumed.
  return value
    .replaceAll('%2C', ',')
    .replaceAll('%7C', '|')
    .replaceAll('%3B', ';')
    .replaceAll('%25', '%')
}

/** Serialize filters to query param format: "v2:browser|is|Chrome,country|is|US" */
export function serializeFilters(filters: DimensionFilter[]): string {
  if (!filters.length) return ''
  const body = filters
    .map(f => `${f.dimension}|${f.operator}|${f.values.map(escapeFilterValue).join(';')}`)
    .join(',')
  return FILTERS_V2_PREFIX + body
}

/** Parse filters from URL search param string (v2-prefixed or legacy). */
export function parseFiltersFromURL(raw: string): DimensionFilter[] {
  if (!raw) return []
  const isV2 = raw.startsWith(FILTERS_V2_PREFIX)
  const body = isV2 ? raw.slice(FILTERS_V2_PREFIX.length) : raw
  if (!body) return []
  return body.split(',').map(part => {
    const [dimension, operator, valuesRaw] = part.split('|')
    return {
      dimension,
      operator: operator as DimensionFilter['operator'],
      // * Drop empty / whitespace-only values. An empty valuesRaw splits to ['']
      // * (length 1), which used to slip past the length check below and send an
      // * empty filter value the backend rejects with a 400 on every request.
      values: (valuesRaw?.split(';') ?? [])
        .map(v => (isV2 ? unescapeFilterValue(v.trim()) : v.trim()))
        .filter(v => v !== ''),
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
