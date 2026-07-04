// ---------------------------------------------------------------------------
// BunnyCDN datacenter string parsing ("EU: Zurich, CH", "NA: Chicago, IL").
// The trailing token is a US state or Canadian province ONLY on North American
// datacenters; everywhere else it is an ISO country code — interpreting "DE"
// as Delaware or "NL" as Newfoundland outside NA misflags Frankfurt and
// Amsterdam as US/CA traffic.
// ---------------------------------------------------------------------------

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
])

const CA_PROVINCES = new Set(['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'])

// * Bunny's Canadian PoPs can carry a ", CA" country suffix, which collides
// * with California inside the NA region — the city breaks the tie.
const CANADIAN_CITIES = new Set(['TORONTO', 'VANCOUVER', 'MONTREAL', 'CALGARY', 'OTTAWA'])

/** ISO country code for a Bunny datacenter string, '' when unparseable. */
export function extractCountryCode(datacenter: string): string {
  const parts = datacenter.split(', ')
  const code = parts[parts.length - 1]?.trim().toUpperCase()
  if (!code || code.length !== 2) return ''

  const region = datacenter.includes(':') ? datacenter.split(':')[0].trim().toUpperCase() : ''
  if (region === 'NA') {
    if (code === 'CA') {
      return CANADIAN_CITIES.has(extractCity(datacenter).toUpperCase()) ? 'CA' : 'US'
    }
    if (US_STATES.has(code)) return 'US'
    if (CA_PROVINCES.has(code)) return 'CA'
  }
  return code
}

/** City name from a Bunny datacenter string, e.g. "EU: Zurich, CH" → "Zurich". */
export function extractCity(datacenter: string): string {
  const afterColon = datacenter.split(': ')[1] || datacenter
  return afterColon.split(',')[0]?.trim() || datacenter
}
