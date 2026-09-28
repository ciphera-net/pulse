// A SYNTHETIC self-hosted Umami export (design §3.12m8, gate 3), built from
// the published schema AS THE SPEC WRITES IT — M8-b's column list, with
// `event_name` added by §3.12c amendment 6 — and NOT from the parser's own
// column constant, so a parser that drifted from the spec fails against it.
// The columns are also written in a different order from the published query
// (`event_name` last, where the amendment appended it), which the parser must
// not care about: it reads the header by name (M8-b).
//
// Small enough to fold by hand, and every row is there for a reason: three
// timestamp shapes (M8-d), a visit that crosses midnight, a visit whose rows
// are out of time order in the file, Direct vs Shared Link and a tagged link
// with no referrer (M8-g), two visits from one referrer with different
// campaigns, a quoted city with a comma, UTF-8 place names, blank region and
// city, every non-pageview event type Umami writes (M8-f), and one row per
// skip reason. The expected fold is written out, by hand, in
// lib/import/sources/__tests__/umami.test.ts.
//
// Real ids never appear: session and visit ids here are plain labels.

/** M8-b's column list as the spec prints it, then `event_name` (§3.12c amendment 6). */
export const UMAMI_FIXTURE_HEADER =
  'created_at,session_id,visit_id,event_type,hostname,url_path,referrer_domain,' +
  'utm_source,utm_medium,utm_campaign,browser,os,device,screen,language,country,region,city,event_name'

export const UMAMI_FIXTURE_RANGE = { from: '2026-03-01', through: '2026-03-03' } as const
export const UMAMI_FIXTURE_NAME = 'umami-export.csv'

interface Visitor {
  session: string
  browser: string
  os: string
  device: string
  screen: string
  language: string
  country: string
  region: string
  city: string
}

const A: Visitor = { session: 'sA', browser: 'chrome', os: 'Windows 10', device: 'desktop', screen: '2560x1440', language: 'en-US', country: 'US', region: 'US-OH', city: 'Cleveland' }
const B: Visitor = { session: 'sB', browser: 'ios', os: 'iOS', device: 'mobile', screen: '375x812', language: 'de-DE', country: 'GB', region: 'GB-ENG', city: 'East Finchley' }
const C: Visitor = { session: 'sC', browser: 'firefox', os: 'Linux', device: 'desktop', screen: '1920x1080', language: 'en-GB', country: 'SE', region: 'SE-S', city: 'Säffle' }
const D: Visitor = { session: 'sD', browser: 'safari', os: 'Mac OS', device: 'laptop', screen: '1440x900', language: 'fr-FR', country: 'US', region: 'US-DC', city: 'Washington, D.C.' }
const E: Visitor = { session: 'sE', browser: 'edge-chromium', os: 'Windows 10', device: 'laptop', screen: '1920x1080', language: 'es-ES', country: 'BR', region: 'BR-SP', city: 'São Paulo' }
const F: Visitor = { session: 'sF', browser: 'samsung', os: 'Android OS', device: 'mobile', screen: '384x854', language: 'en-US', country: 'JP', region: 'JP-13', city: 'Koishikawa' }
// Country only: the geo database resolved no subdivision (a real export has these, §1).
const G: Visitor = { session: 'sG', browser: 'chrome', os: 'Chrome OS', device: 'laptop', screen: '1920x1080', language: 'de-DE', country: 'DE', region: '', city: '' }

interface Event {
  created_at: string
  who: Visitor
  visit: string
  type: string
  name?: string
  path: string
  referrer?: string
  utm?: [source: string, medium: string, campaign: string]
}

const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

function row(e: Event): string {
  const [source, medium, campaign] = e.utm ?? ['', '', '']
  const w = e.who
  // In UMAMI_FIXTURE_HEADER's order.
  return [
    e.created_at,
    w.session,
    e.visit,
    e.type,
    // A performance row has no hostname (§0.3); every other row has one.
    e.type === '5' ? '' : 'example.com',
    e.path,
    e.referrer ?? '',
    source,
    medium,
    campaign,
    w.browser,
    w.os,
    w.device,
    w.screen,
    w.language,
    w.country,
    w.region,
    w.city,
    e.name ?? '',
  ]
    .map(q)
    .join(',')
}

/** The file's rows in file order; line = index + 2. */
const EVENTS: readonly (Event | string)[] = [
  // line 2, 3: visit A1 from google.com; line 4: a custom event in it.
  { created_at: '2026-03-01T09:00:00Z', who: A, visit: 'vA1', type: '1', path: '/', referrer: 'google.com' },
  { created_at: '2026-03-01T09:05:00Z', who: A, visit: 'vA1', type: '1', path: '/pricing' },
  { created_at: '2026-03-01T09:06:00Z', who: A, visit: 'vA1', type: '2', name: 'signup', path: '/pricing' },
  // line 5, 6: visit A2, no referrer, landing off the root: Shared Link.
  // Postgres's own timestamptz text (shape 2): 15:00 at +01 is 14:00Z.
  { created_at: '2026-03-01 15:00:00+01', who: A, visit: 'vA2', type: '1', path: '/blog/' },
  { created_at: '2026-03-01T14:10:00Z', who: A, visit: 'vA2', type: '1', path: '/blog/post' },
  // line 7, 8: visit B1 lands on the root's hash route (Direct) and crosses
  // midnight UTC. 05:40:00.250 at +05:30 is 00:10:00.250Z.
  { created_at: '2026-03-01T23:50:00Z', who: B, visit: 'vB1', type: '1', path: '/#features' },
  { created_at: '2026-03-02 05:40:00.250+05:30', who: B, visit: 'vB1', type: '1', path: '/features' },
  // line 9, 10: visit C1 from a tagged link with no referrer. Shape 3 (bare,
  // read as UTC and counted in the plan's notes).
  { created_at: '2026-03-02 08:00:00', who: C, visit: 'vC1', type: '1', path: '/', utm: ['newsletter', 'email', 'spring'] },
  { created_at: '2026-03-02T08:03:00Z', who: C, visit: 'vC1', type: '1', path: '/pricing' },
  // line 11, 12: visit D1's rows are OUT OF ORDER in the file: its earliest
  // pageview (and so its entrance and its origin) is the second one.
  { created_at: '2026-03-02T12:05:00Z', who: D, visit: 'vD1', type: '1', path: '/about' },
  { created_at: '2026-03-02T12:00:00Z', who: D, visit: 'vD1', type: '1', path: '/', referrer: 'news.ycombinator.com', utm: ['hn', 'social', 'launch'] },
  // line 13, 14: two visits from google.com on one day, one tagged and one
  // not: two acquisition rows, never one carrying either visit's tags.
  { created_at: '2026-03-02T16:00:00Z', who: E, visit: 'vE1', type: '1', path: '/', referrer: 'google.com', utm: ['google', 'cpc', 'spring'] },
  { created_at: '2026-03-02T17:00:00Z', who: F, visit: 'vF1', type: '1', path: '/docs/', referrer: 'google.com' },
  // line 15, 16: not pageviews: a performance event and a link event.
  { created_at: '2026-03-03T10:00:00Z', who: G, visit: 'vG0', type: '5', path: '/' },
  { created_at: '2026-03-03T10:01:00Z', who: G, visit: 'vG0', type: '3', path: '/' },
  // line 17, 18: timestamps no published query writes.
  { created_at: '2026-03-03T25:00:00Z', who: G, visit: 'vG0', type: '1', path: '/' },
  { created_at: '03/03/2026 10:00', who: G, visit: 'vG0', type: '1', path: '/' },
  // line 19: a row cut short.
  '2026-03-03T10:05:00Z,sG,vG0,1,example.com,/',
  // line 20, 21: a pageview with no session id; a row with no event type.
  { created_at: '2026-03-03T10:06:00Z', who: { ...G, session: '' }, visit: 'vG0', type: '1', path: '/' },
  { created_at: '2026-03-03T10:07:00Z', who: G, visit: 'vG0', type: '', path: '/' },
  // line 22: visit G1, Direct, country only.
  { created_at: '2026-03-03T11:00:00Z', who: G, visit: 'vG1', type: '1', path: '/' },
]

/** The synthetic export's CSV text. */
export function umamiFixtureCsv(): string {
  const lines = [UMAMI_FIXTURE_HEADER]
  for (const e of EVENTS) lines.push(typeof e === 'string' ? e : row(e))
  return lines.join('\n') + '\n'
}

/** The synthetic export as the File a customer would choose. */
export function umamiFixtureFile(name = UMAMI_FIXTURE_NAME): File {
  return new File([umamiFixtureCsv()], name, { type: 'text/csv' })
}
