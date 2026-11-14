// "Figures behind this answer": what each of Analyst's lookups shows, fed the shapes pulse-backend's tools return
// (internal/api/barry_tools.go). The ranges are the site's calendar days as the server resolved them, so they must
// print the same in every timezone: this file also runs in the UTC+14 lane (npm run test:tz-positive).
import { describe, it, expect } from 'vitest'
import type { AnalystStep } from '@/lib/api/analyst'
import { COMPARE_ROWS_SHOWN, describeStep, finishedLookup, formatRange, runningLookup, type StepView } from '../steps'

const THIS_WEEK = { from: '2026-11-04', to: '2026-11-10' }
const LAST_WEEK = { from: '2026-10-28', to: '2026-11-03' }

const step = (tool: string, args: Record<string, unknown> | null, result?: unknown, error?: string): AnalystStep => ({
  tool,
  args,
  result,
  error,
  ms: 120,
})

/** A figures view's blocks as [title, dates], or null when the lookup is one line. */
const titles = (view: StepView) => (view.kind === 'figures' ? view.blocks.map((b) => [b.title, b.range]) : null)

const row = (value: string, previous: number, current: number) => ({
  value,
  source: '',
  current_visitors: current,
  previous_visitors: previous,
  visitors_change: current - previous,
  current_pageviews: current * 2,
  previous_pageviews: previous * 2,
})

describe('formatRange', () => {
  it('names the month once when both days are in it', () => {
    expect(formatRange(THIS_WEEK)).toBe('4 to 10 November')
  })

  it('names both months when the range crosses one', () => {
    expect(formatRange(LAST_WEEK)).toBe('28 October to 3 November')
  })

  it('names both years when the range crosses one', () => {
    expect(formatRange({ from: '2025-12-30', to: '2026-01-05' })).toBe('30 December 2025 to 5 January 2026')
  })

  it('prints one day as one date', () => {
    expect(formatRange({ from: '2026-11-10', to: '2026-11-10' })).toBe('10 November')
  })

  it('prints a range it cannot read as the server sent it', () => {
    expect(formatRange({ from: 'last_7_days', to: 'today' })).toBe('last_7_days to today')
  })
})

describe('describeStep', () => {
  it('draws a comparison without a dimension as the two totals, earlier period first', () => {
    const view = describeStep(
      step('compare_periods', { period: 'last_7_days' }, {
        current: { range: THIS_WEEK, visitors: 56, pageviews: 131 },
        previous: { range: LAST_WEEK, visitors: 48, pageviews: 102 },
        change: { visitors: 8, visitors_percent: 16.7, pageviews: 29, pageviews_percent: 28.4 },
      }),
    )
    expect(view).toEqual({
      kind: 'compare',
      title: 'Visitors and pageviews',
      range: '4 to 10 November against 28 October to 3 November',
      rows: [
        { name: 'Visitors', before: 48, now: 56, logo: false },
        { name: 'Pageviews', before: 102, now: 131, logo: false },
      ],
      more: 0,
    })
  })

  it('leaves out a total the server could not give (null), never drawing it as zero', () => {
    const view = describeStep(
      step('compare_periods', {}, {
        current: { range: THIS_WEEK, visitors: 56, pageviews: null },
        previous: { range: LAST_WEEK, visitors: 48, pageviews: null },
      }),
    )
    expect(view.kind === 'compare' && view.rows.map((r) => r.name)).toEqual(['Visitors'])
  })

  it('draws a comparison of sources as rows with logos, and counts the rest', () => {
    const rows = [
      row('google.com', 5, 13),
      row('LinkedIn', 5, 10),
      row('Direct', 17, 10),
      row('duckduckgo.com', 1, 3),
      row('bing.com', 2, 1),
      row('github.com', 0, 1),
      row('news.ycombinator.com', 1, 0),
    ]
    const view = describeStep(
      step('compare_periods', { dimension: 'referrer' }, {
        current: { range: THIS_WEEK, visitors: 56, pageviews: 131 },
        previous: { range: LAST_WEEK, visitors: 48, pageviews: 102 },
        dimension: 'referrer',
        rows,
      }),
    )
    if (view.kind !== 'compare') throw new Error('expected a comparison')
    expect(view.title).toBe('Sources')
    expect(view.rows).toHaveLength(COMPARE_ROWS_SHOWN)
    expect(view.rows[0]).toEqual({ name: 'google.com', before: 5, now: 13, logo: true })
    expect(view.rows[2]).toEqual({ name: 'Direct', before: 17, now: 10, logo: true })
    expect(view.more).toBe(rows.length - COMPARE_ROWS_SHOWN)
  })

  it('draws no logos for a dimension that is not a source', () => {
    const view = describeStep(
      step('compare_periods', { dimension: 'page' }, {
        current: { range: THIS_WEEK },
        previous: { range: LAST_WEEK },
        dimension: 'page',
        rows: [row('/pricing', 4, 9)],
      }),
    )
    if (view.kind !== 'compare') throw new Error('expected a comparison')
    expect(view.title).toBe('Pages')
    expect(view.rows).toEqual([{ name: '/pricing', before: 4, now: 9, logo: false }])
  })

  it('prints an empty value (a blank campaign tag) as (none)', () => {
    const view = describeStep(
      step('compare_periods', { dimension: 'utm_campaign' }, {
        current: { range: THIS_WEEK },
        previous: { range: LAST_WEEK },
        dimension: 'utm_campaign',
        rows: [row('', 3, 7)],
      }),
    )
    if (view.kind !== 'compare') throw new Error('expected a comparison')
    expect(view.title).toBe('Campaigns')
    expect(view.rows).toEqual([{ name: '(none)', before: 3, now: 7, logo: false }])
  })

  it('names a breakdown by its dimension and its dates', () => {
    const view = describeStep(step('get_breakdown', { dimension: 'country', limit: 10 }, { range: THIS_WEEK, rows: [] }))
    expect(view).toEqual({ kind: 'line', text: 'Countries, 4 to 10 November', failed: false })
  })

  it('names the other lookups, with their dates when the result has them', () => {
    expect(describeStep(step('get_stats', {}, { range: THIS_WEEK, visitors: 56 }))).toEqual({
      kind: 'figures',
      blocks: [{ title: 'Totals', range: '4 to 10 November', rows: [{ name: 'Visitors', value: '56', note: '', mark: false, logo: false }], more: 0 }],
    })
    expect(finishedLookup(step('get_stats', {}, { range: THIS_WEEK, visitors: 56 }))).toEqual({ text: 'Totals, 4 to 10 November', failed: false })
    expect(describeStep(step('get_daily_series', {}, { range: LAST_WEEK, days: [] }))).toMatchObject({
      text: 'Day by day, 28 October to 3 November',
    })
    expect(describeStep(step('get_realtime', null, { visitors: 2 }))).toMatchObject({ text: 'Visitors right now' })
  })

  it('says a lookup failed, in a sentence naming what is missing, so a missing figure is never silent', () => {
    expect(describeStep(step('get_breakdown', { dimension: 'referrer' }, undefined, 'upstream timeout'))).toEqual({
      kind: 'line',
      text: 'Analyst could not read the sources',
      failed: true,
    })
    const failed = (tool: string, args: Record<string, unknown> = {}) => describeStep(step(tool, args, undefined, 'boom'))
    expect(failed('get_breakdown', { dimension: 'utm_campaign' })).toMatchObject({ text: 'Analyst could not read the campaigns' })
    expect(failed('get_stats')).toMatchObject({ text: 'Analyst could not read the totals' })
    expect(failed('get_daily_series')).toMatchObject({ text: "Analyst could not read each day's figures" })
    expect(failed('get_realtime')).toMatchObject({ text: 'Analyst could not read who is on the site right now' })
    expect(failed('compare_periods')).toMatchObject({ text: 'Analyst could not compare the two periods', failed: true })
    expect(failed('get_weather')).toMatchObject({ text: 'One of the lookups failed', failed: true })
  })

  it('names a lookup it does not know without guessing what it read', () => {
    expect(describeStep(step('get_weather', {}, { range: THIS_WEEK }))).toEqual({
      kind: 'line',
      text: 'Another lookup, 4 to 10 November',
      failed: false,
    })
  })
})

describe('lookups that name what they were narrowed to', () => {
  it('names a total by its filter, from the filters the server says it applied', () => {
    // * The result's echo is the server's cleaned copy, so it wins over what the model wrote.
    const view = describeStep(
      step('get_stats', { period: '7d', filters: ['referrer==google.com\u0007'] }, { range: THIS_WEEK, filters: ['referrer==google.com'], visitors: 48 }),
    )
    expect(titles(view)).toEqual([['Totals for google.com', '4 to 10 November']])
    expect(finishedLookup(step('get_stats', { filters: ['referrer==google.com'] }, { range: THIS_WEEK, filters: ['referrer==google.com'], visitors: 48 }))).toEqual({
      text: 'Totals for google.com, 4 to 10 November',
      failed: false,
    })
  })

  it('reads a country as its name, adds dimensions up and names an exclusion', () => {
    const filters = ['country==DE', 'device==mobile', 'referrer!=Direct']
    expect(describeStep(step('get_breakdown', { dimension: 'page', filters }, { range: THIS_WEEK, filters, rows: [] }))).toMatchObject({
      text: 'Pages for Germany and mobile, excluding Direct, 4 to 10 November',
    })
  })

  it('reads the values of one dimension as either one, as the server does', () => {
    const filters = ['referrer==google.com', 'referrer==bing.com']
    expect(describeStep(step('get_stats', { filters }, { range: THIS_WEEK, filters }))).toMatchObject({
      text: 'Totals for google.com or bing.com, 4 to 10 November',
    })
  })

  it('names a comparison by its filter, from the filters of the periods it compared', () => {
    const filters = ['page==/products/pulse']
    const view = describeStep(
      step('compare_periods', { dimension: 'referrer', filters }, {
        current: { range: THIS_WEEK, filters },
        previous: { range: LAST_WEEK, filters },
        dimension: 'referrer',
        rows: [row('Shared Link', 22, 4)],
      }),
    )
    expect(view.kind === 'compare' && view.title).toBe('Sources for /products/pulse')
  })

  it('names a running lookup by its filter, from what the model asked for', () => {
    expect(runningLookup('get_stats', { filters: ['referrer==google.com'] })).toBe('Reading the totals for google.com')
    expect(runningLookup('get_breakdown', { dimension: 'channel', filters: ['page==/pricing'] })).toBe('Reading the channels for /pricing')
    expect(runningLookup('compare_periods', { dimension: 'referrer', period: '30d', filters: ['page==/products/pulse'] })).toBe(
      'Comparing sources for /products/pulse with the 30 days before',
    )
    expect(runningLookup('get_stats', {})).toBe('Reading the totals')
  })

  it('names the filter of a lookup that failed', () => {
    expect(describeStep(step('get_stats', { filters: ['country==BE'] }, undefined, 'boom'))).toEqual({
      kind: 'line',
      text: 'Analyst could not read the totals for Belgium',
      failed: true,
    })
  })

  it('cuts a long value, shows a code it cannot name as written, and skips what is not a filter', () => {
    const long = `/blog/${'a'.repeat(60)}`
    const filters = [`page==${long}`, 'language==xx-??', 'nonsense', 7]
    expect(describeStep(step('get_stats', { filters }, { range: THIS_WEEK }))).toMatchObject({
      text: `Totals for ${long.slice(0, 47)}… and xx-??, 4 to 10 November`,
    })
  })

  it('never names a filter on a lookup that takes none, since the server ignored it', () => {
    expect(runningLookup('get_realtime', { filters: ['referrer==google.com'] })).toBe('Reading who is on the site right now')
    expect(titles(describeStep(step('get_excluded_traffic', { filters: ['referrer==google.com'] }, { events_last_7_days: 30 })))).toEqual([
      ['Traffic kept out of your stats', null],
    ])
  })
})

describe('the data lookups', () => {
  it("names a page's day series by its filter, the drop rule's lookup", () => {
    const filters = ['page==/pricing']
    expect(describeStep(step('get_daily_series', { filters }, { range: THIS_WEEK, filters, days: [] }))).toMatchObject({
      text: 'Day by day for /pricing, 4 to 10 November',
    })
    expect(runningLookup('get_daily_series', { filters })).toBe("Reading each day's figures for /pricing")
    expect(runningLookup('get_daily_series', {})).toBe("Reading each day's figures")
  })

  it('names an engagement lookup by what its rows are, with its filter and dates', () => {
    expect(describeStep(step('get_engagement', { dimension: 'referrer' }, { range: THIS_WEEK, dimension: 'referrer', filters: [], rows: [] }))).toMatchObject({
      text: 'Engagement by source, 4 to 10 November',
    })
    const filters = ['referrer==google.com']
    expect(describeStep(step('get_engagement', { dimension: 'page', filters }, { range: THIS_WEEK, dimension: 'page', filters, rows: [] }))).toMatchObject({
      text: 'Engagement by page for google.com, 4 to 10 November',
    })
    expect(runningLookup('get_engagement', { dimension: 'utm_campaign' })).toBe('Reading engagement by campaign')
    expect(describeStep(step('get_engagement', { dimension: 'country' }, undefined, 'boom'))).toEqual({
      kind: 'line',
      text: 'Analyst could not read engagement by country',
      failed: true,
    })
  })

  // * Plan §4c: a web search is named by its words, on one line and cut, while it runs, once it is done and when it
  // * failed. Its results have no figures block yet (that waits for an options round), so it stays one line.
  it('names a web search by its words, cut on one line, and says when one failed', () => {
    expect(runningLookup('search_web', { query: 'google core update november 2026' })).toBe('Searching the web for "google core update november 2026"')
    expect(runningLookup('search_web', { query: '  google\n core   update ' })).toBe('Searching the web for "google core update"')
    expect(runningLookup('search_web', {})).toBe('Searching the web')
    expect(runningLookup('search_web', { query: 'b'.repeat(70) })).toBe(`Searching the web for "${'b'.repeat(60)}…"`)
    const done = step('search_web', { query: 'google core update' }, {
      query: 'google core update',
      market: 'en-us',
      results: [{ title: 'Core update', url: 'https://news.example.org/story-1', site: 'news.example.org' }],
    })
    expect(describeStep(done)).toEqual({ kind: 'line', text: 'Web results for "google core update"', failed: false })
    expect(finishedLookup(done).text).toBe('Web results for "google core update"')
    expect(describeStep(step('search_web', { query: 'x' }, undefined, 'the web search failed: answer without it'))).toEqual({
      kind: 'line',
      text: 'Analyst could not search the web',
      failed: true,
    })
  })

  it('names the traffic kept out as the settings page does', () => {
    expect(describeStep(step('get_excluded_traffic', {}, { events_last_7_days: 30, by_kind: [] }))).toEqual({
      kind: 'figures',
      blocks: [{ title: 'Traffic kept out of your stats', range: null, rows: [{ name: 'Last 7 days', value: '30 events', note: '', mark: false, logo: false }], more: 0 }],
    })
    expect(finishedLookup(step('get_excluded_traffic', {}, { events_last_7_days: 30 })).text).toBe('Traffic kept out of your stats')
    expect(runningLookup('get_excluded_traffic', {})).toBe('Reading the traffic Pulse kept out')
    expect(describeStep(step('get_excluded_traffic', {}, undefined, 'boom'))).toMatchObject({
      text: 'Analyst could not read the traffic Pulse kept out',
      failed: true,
    })
  })
})

describe('the lookups of the other dashboard sections', () => {
  const finished = (tool: string, args: Record<string, unknown>, result: unknown) => describeStep(step(tool, args, result))

  it('names each one with its dates where the result has them', () => {
    expect(finished('get_search', {}, { range: THIS_WEEK, previous_range: LAST_WEEK, google: null, bing: null })).toMatchObject({
      text: 'Search figures, 4 to 10 November',
    })
    expect(finished('get_funnels', {}, { range: THIS_WEEK, filters: [], funnels: [] })).toMatchObject({ text: 'Funnels, 4 to 10 November' })
    expect(finished('get_uptime', {}, { range: THIS_WEEK, monitors: [], incidents: [] })).toMatchObject({ text: 'Uptime, 4 to 10 November' })
    expect(finished('get_performance', {}, { page: 'https://example.com/', checks: [] })).toMatchObject({ text: 'Performance checks' })
  })

  it('names goals and funnels by their filter', () => {
    const filters = ['referrer==google.com']
    // * No events at all is a finding, so it is said in the block rather than left out.
    expect(finished('get_goals', { filters }, { range: THIS_WEEK, filters, events: [] })).toEqual({
      kind: 'figures',
      blocks: [
        {
          title: 'Goals and events for google.com',
          range: '4 to 10 November',
          rows: [{ name: 'Pulse recorded no goals or events', value: '', note: '', mark: false, logo: false }],
          more: 0,
        },
      ],
    })
    expect(runningLookup('get_goals', { filters })).toBe('Reading the goals and events for google.com')
    expect(runningLookup('get_funnels', { filters: ['device==mobile'] })).toBe('Reading the funnels for mobile')
  })

  it('says what is missing when one fails, and what it is reading while it runs', () => {
    const failed = (tool: string) => describeStep(step(tool, {}, undefined, 'boom'))
    expect(failed('get_search')).toMatchObject({ text: 'Analyst could not read the search figures', failed: true })
    expect(failed('get_goals')).toMatchObject({ text: 'Analyst could not read the goals and events', failed: true })
    expect(failed('get_funnels')).toMatchObject({ text: 'Analyst could not read the funnels', failed: true })
    expect(failed('get_performance')).toMatchObject({ text: 'Analyst could not read the performance checks', failed: true })
    expect(failed('get_uptime')).toMatchObject({ text: 'Analyst could not read the uptime checks', failed: true })
    expect(runningLookup('get_search', {})).toBe('Reading the search figures')
    expect(runningLookup('get_performance', {})).toBe('Reading the performance checks')
    expect(runningLookup('get_uptime', {})).toBe('Reading the uptime checks')
  })
})

describe('journeys, hours and the CDN', () => {
  const finished = (tool: string, args: Record<string, unknown>, result: unknown) => describeStep(step(tool, args, result))

  it('names each one with its dates, a journey by the page it starts from and its filter', () => {
    expect(titles(finished('get_journeys', {}, { range: THIS_WEEK, visits: 120, first_pages: [], steps: [] }))).toEqual([['Journeys', '4 to 10 November']])
    const filters = ['country==BE']
    const pricing = step('get_journeys', { entry_page: '/pricing', filters }, { range: THIS_WEEK, entry_page: '/pricing', filters, visits: 9 })
    expect(titles(describeStep(pricing))).toEqual([['Journeys from /pricing for Belgium', '4 to 10 November']])
    expect(finishedLookup(pricing).text).toBe('Journeys from /pricing for Belgium, 4 to 10 November')
    expect(finished('get_hours', {}, { range: THIS_WEEK, days: 7, by_hour: [], by_weekday: [] })).toMatchObject({
      text: 'Hours and weekdays, 4 to 10 November',
    })
    expect(finished('get_cdn', {}, { range: THIS_WEEK, connection: 'active', days: [] })).toMatchObject({ text: 'CDN figures, 4 to 10 November' })
  })

  it('says what it is reading while it runs, and what is missing when one fails', () => {
    expect(runningLookup('get_journeys', {})).toBe('Reading the journeys')
    expect(runningLookup('get_journeys', { entry_page: '/pricing' })).toBe('Reading the journeys from /pricing')
    expect(runningLookup('get_hours', { filters: ['device==mobile'] })).toBe('Reading when visitors come for mobile')
    expect(runningLookup('get_cdn', {})).toBe('Reading the CDN figures')
    const failed = (tool: string) => describeStep(step(tool, {}, undefined, 'boom'))
    expect(failed('get_journeys')).toMatchObject({ text: 'Analyst could not read the journeys', failed: true })
    expect(failed('get_hours')).toMatchObject({ text: 'Analyst could not read when visitors come', failed: true })
    expect(failed('get_cdn')).toMatchObject({ text: 'Analyst could not read the CDN figures', failed: true })
  })
})

// * The figures round (pick A, 13-11-2026): every lookup drawn as the comparison is, a title, its dates and a row per
// * figure. The fixtures are the results Analyst read for ciphera.net on 12-11-2026 (Pulse/docs/data/
// * 11-11-2026-analyst-round7-build/runs/think-first.jsonl), cut to what each test reads.
describe('the figures behind each lookup', () => {
  const view = (tool: string, args: Record<string, unknown>, result: unknown) => describeStep(step(tool, args, result))
  const rows = (v: StepView, block = 0) => (v.kind === 'figures' ? v.blocks[block].rows.map((r) => [r.name, r.value, r.note]) : null)
  const marks = (v: StepView, block = 0) => (v.kind === 'figures' ? v.blocks[block].rows.filter((r) => r.mark).map((r) => r.name) : null)
  const OCT_NOV = { from: '2026-10-14', to: '2026-11-12' }
  const NOV = { from: '2026-11-01', to: '2026-11-12' }

  it('draws each funnel as its own block: every step, and the share of the step before that dropped off', () => {
    const v = view('get_funnels', { period: '30d' }, {
      range: OCT_NOV,
      filters: [],
      funnels: [
        { name: 'About', steps: [
          { name: 'Step 1', match: 'page /', visitors: 158, conversion: 100, drop_off: null },
          { name: 'Step 2', match: 'page /about', visitors: 17, conversion: 10.8, drop_off: 89.2 },
        ] },
        { name: 'Pulse Sign Up', steps: [
          { name: '/', match: 'page /', visitors: 158, conversion: 100, drop_off: null },
          { name: '/products/pulse', match: 'page /products/pulse', visitors: 4, conversion: 2.5, drop_off: 97.5 },
          { name: 'outbound_link', match: 'event outbound_link', visitors: 1, conversion: 0.6, drop_off: 75 },
        ] },
      ],
    })
    expect(titles(v)).toEqual([
      ['About funnel', '14 October to 12 November'],
      ['Pulse Sign Up funnel', '14 October to 12 November'],
    ])
    // * A step is named by what it matches, so "Step 2" reads as the page it is.
    expect(rows(v, 0)).toEqual([['/', '158', ''], ['/about', '17', '89.2% dropped off']])
    expect(rows(v, 1)).toEqual([['/', '158', ''], ['/products/pulse', '4', '97.5% dropped off'], ['outbound_link', '1', '75% dropped off']])
    expect(finishedLookup(step('get_funnels', { period: '30d' }, { range: OCT_NOV, funnels: [] })).text).toBe('Funnels, 14 October to 12 November')
  })

  it("draws search as Google's totals, the searches that brought a click, then Bing's totals", () => {
    const q = (value: string, clicks: number, position: number) => ({ value, source: 'visitor-supplied', clicks, impressions: 10, click_rate: 1, position })
    const v = view('get_search', { period: 'month' }, {
      range: NOV,
      previous_range: { from: '2026-10-01', to: '2026-10-12' },
      google: {
        connection: 'active',
        current: { clicks: 19, impressions: 3060, click_rate: 0.6, position: 37.7 },
        previous: { clicks: 27, impressions: 2129, click_rate: 1.3, position: 16.2 },
        top_queries: [q('ciphera', 10, 5.9), q('privacytools', 2, 42.3), q('data privacy compliance', 1, 86.4), q('cookieless analytics', 1, 29.9),
          q('privacy tools list', 1, 30.1), q('live website analytics', 0, 78.5), q('web analytics statistics', 0, 72)],
      },
      bing: { connection: 'active', current: { clicks: 1, impressions: 188, click_rate: 0.5 }, previous: { clicks: 8, impressions: 296, click_rate: 2.7 } },
    })
    expect(titles(v)).toEqual([['Search figures', '1 to 12 November']])
    expect(rows(v)).toEqual([
      ['Google, all searches', '19 clicks', 'position 37.7'],
      ['ciphera', '10 clicks', 'position 5.9'],
      ['privacytools', '2 clicks', 'position 42.3'],
      ['data privacy compliance', '1 click', 'position 86.4'],
      ['cookieless analytics', '1 click', 'position 29.9'],
      ['privacy tools list', '1 click', 'position 30.1'],
      ['Bing, all searches', '1 click', 'was 8'],
    ])
    expect(v.kind === 'figures' && v.blocks[0].more).toBe(2)
    // * Fewer than five searches with a click: the ones without a click stay out of the rows and count in "and N more".
    const few = view('get_search', {}, {
      range: NOV,
      google: { connection: 'active', current: { clicks: 3, position: 40.2 },
        top_queries: [q('ciphera', 2, 5.9), q('pulse analytics', 1, 12), q('live website analytics', 0, 78.5), q('web analytics statistics', 0, 72)] },
      bing: null,
    })
    expect(rows(few)).toEqual([
      ['Google, all searches', '3 clicks', 'position 40.2'],
      ['ciphera', '2 clicks', 'position 5.9'],
      ['pulse analytics', '1 click', 'position 12'],
    ])
    expect(few.kind === 'figures' && few.blocks[0].more).toBe(2)
    // * Neither engine connected: nothing to draw, so the lookup stays one line.
    expect(view('get_search', {}, { range: NOV, google: null, bing: null })).toMatchObject({ kind: 'line', text: 'Search figures, 1 to 12 November' })
  })

  it('draws speed per device as the Performance page prints and rates it, the poor figures marked', () => {
    const mobile = { device: 'mobile', checked_on: '2026-11-11', status: 'ok', performance_score: 78, largest_contentful_paint_ms: 4594,
      cumulative_layout_shift: 0, total_blocking_time_ms: 224, first_contentful_paint_ms: 1867, speed_index_ms: 2853 }
    const desktop = { device: 'desktop', checked_on: '2026-11-11', status: 'ok', performance_score: 87, largest_contentful_paint_ms: 1119,
      cumulative_layout_shift: 0, total_blocking_time_ms: 271, first_contentful_paint_ms: 531 }
    const v = view('get_performance', {}, { page: 'https://ciphera.net/', checks: [mobile, desktop] })
    expect(titles(v)).toEqual([['Homepage speed on mobile', '11 November'], ['Homepage speed on desktop', '11 November']])
    expect(rows(v, 0)).toEqual([
      ['Performance score', '78', ''],
      ['Largest Contentful Paint', '4.6s', 'poor'],
      ['Total Blocking Time', '224ms', ''],
      ['First Contentful Paint', '1.9s', ''],
      ['Cumulative Layout Shift', '0.000', ''],
    ])
    // * Only "poor" is marked (LCP past 4 s); "needs improvement" (224 ms, 1.9 s) is not.
    expect(marks(v, 0)).toEqual(['Largest Contentful Paint'])
    expect(marks(v, 1)).toEqual([])
    const other = view('get_performance', {}, { page: 'https://example.com/pricing', checks: [{ ...mobile, performance_score: 41 }] })
    expect(titles(other)).toEqual([['Speed of /pricing on mobile', '11 November']])
    expect(rows(other)?.[0]).toEqual(['Performance score', '41', 'poor'])
    const failed = view('get_performance', {}, { page: 'https://ciphera.net/', checks: [{ device: 'mobile', checked_on: '2026-11-11', status: 'error' }] })
    expect(rows(failed)).toEqual([['The check failed', '', '']])
    // * A check that does not say its device is titled without one, never "on this device".
    const noDevice: Record<string, unknown> = { ...mobile }
    delete noDevice.device
    expect(titles(view('get_performance', {}, { page: 'https://ciphera.net/', checks: [noDevice] }))).toEqual([['Homepage speed', '11 November']])
  })

  it('draws goals and events by their conversion rate and visits, five then "and N more"', () => {
    const e = (name: string, conversion_rate: number, visits: number) => ({ name, event: name, goal: false, count: visits, visits, conversion_rate })
    const v = view('get_goals', { period: 'month' }, {
      range: NOV,
      visitors: 123,
      events: [e('pulse_click', 30.9, 38), e('outbound_link', 16.3, 20), e('pulse_copy', 4.9, 6), e('pulse_form_submit', 2.4, 3),
        e('contact_captcha_verified', 2.4, 3), e('contact_form_submit_success', 2.4, 3), e('file_download', 0.8, 1)],
    })
    expect(titles(v)).toEqual([['Goals and events', '1 to 12 November']])
    expect(rows(v)?.slice(0, 2)).toEqual([['pulse_click', '30.9%', '38 visits'], ['outbound_link', '16.3%', '20 visits']])
    expect(v.kind === 'figures' && [v.blocks[0].rows.length, v.blocks[0].more]).toEqual([5, 2])
  })

  it("draws engagement as a page's time on page and entry bounce, any other row's visit duration and bounce", () => {
    const pages = view('get_engagement', { dimension: 'page' }, {
      range: NOV, dimension: 'page',
      rows: [{ value: '/', visitors: 63, avg_time_on_page: 30.6, entry_bounce_rate: 53.5 }, { value: '/about', visitors: 7, avg_time_on_page: 140, entry_bounce_rate: null }],
    })
    expect(titles(pages)).toEqual([['Engagement by page', '1 to 12 November']])
    expect(rows(pages)).toEqual([['/', '30s', '53.5% bounce'], ['/about', '2m 20s', '']])
    const sources = view('get_engagement', { dimension: 'referrer' }, {
      range: NOV, dimension: 'referrer', rows: [{ value: 'google.com', visitors: 23, pageviews: 46, bounce_rate: 48, avg_duration: 185.7 }],
    })
    expect(sources.kind === 'figures' && sources.blocks[0].rows[0]).toEqual({ name: 'google.com', value: '3m 5s', note: '48% bounce', mark: false, logo: true })
  })

  it('draws the traffic kept out by period, then by kind in a block of its own dated "All time"', () => {
    const v = view('get_excluded_traffic', {}, {
      events_last_24_hours: 53, events_last_7_days: 290, events_last_30_days: 889, events_all_kept: 3996,
      all_kept_by_kind: [{ kind: 'population_statistic', events: 3046 }, { kind: 'declared_crawler', events: 894 }, { kind: 'operator_decision', events: 56 }, { kind: 'new_kind', events: 1 }],
    })
    expect(titles(v)).toEqual([['Traffic kept out of your stats', null], ['Kept out, by kind', 'All time']])
    expect(rows(v, 0)).toEqual([['Last 24 hours', '53 events', ''], ['Last 7 days', '290 events', ''], ['Last 30 days', '889 events', ''], ['All time', '3,996 events', '']])
    expect(rows(v, 1)).toEqual([['Bot and spam patterns', '3,046 events', ''], ['Declared crawlers', '894 events', ''], ['Excluded by hand', '56 events', ''], ['new kind', '1 event', '']])
    // * Every kind the server can return has a name, so none reaches a person as its key.
    const families = ['constructive', 'self_reported', 'cross_tenant', 'physical'].map((kind) => ({ kind, events: 2 }))
    expect(rows(view('get_excluded_traffic', {}, { events_all_kept: 8, all_kept_by_kind: families }), 1)).toEqual([
      ['Made-up page addresses', '2 events', ''],
      ['Known bot screen sizes', '2 events', ''],
      ['Seen on unrelated sites', '2 events', ''],
      ['Impossible for one person', '2 events', ''],
    ])
    // * An answer stored before the key was renamed (by_kind) still shows its kinds, dated "All time" as they always were.
    const stored = view('get_excluded_traffic', {}, { events_all_kept: 946, by_kind: [{ kind: 'declared_crawler', events: 890 }, { kind: 'operator_decision', events: 56 }] })
    expect(titles(stored)).toEqual([['Traffic kept out of your stats', null], ['Kept out, by kind', 'All time']])
    expect(rows(stored, 1)).toEqual([['Declared crawlers', '890 events', ''], ['Excluded by hand', '56 events', '']])
  })

  it('draws the totals, rates and durations rounded as the dashboard prints them', () => {
    const v = view('get_stats', { period: '30d' }, {
      range: { from: '2026-10-13', to: '2026-11-11' }, filters: [], visitors: 278, pageviews: 721,
      bounce_rate: 69.96996996996997, avg_duration: 98.8772816970684, avg_scroll_depth: 68.95261550735756,
    })
    expect(rows(v)).toEqual([['Visitors', '278', ''], ['Pageviews', '721', ''], ['Bounce rate', '70%', ''], ['Visit duration', '1m 38s', ''], ['Scroll depth', '69%', '']])
  })

  it("draws a day series by the server's own counts: the busiest day, the quietest with visitors, the empty days", () => {
    const blog = view('get_daily_series', { filters: ['page==/blog'] }, {
      range: OCT_NOV, filters: ['page==/blog'], days: [],
      summary: { whole_days: 29, days_without_visitors: 12, running_day: '2026-11-12',
        busiest_day: { date: '2026-11-06', visitors: 3, days_with_that_many: 1 }, quietest_day: { date: '2026-10-14', visitors: 0, days_with_that_many: 12 } },
    })
    expect(titles(blog)).toEqual([['Day by day for /blog', '14 October to 12 November']])
    expect(rows(blog)).toEqual([['Busiest day', '6 November', '3 visitors'], ['Whole days without visitors', '12 of 29', '']])
    const site = view('get_daily_series', {}, {
      range: OCT_NOV, days: [],
      summary: { whole_days: 29, days_without_visitors: 0,
        busiest_day: { date: '2026-11-06', visitors: 19, days_with_that_many: 2 }, quietest_day: { date: '2026-10-28', visitors: 2, days_with_that_many: 1 } },
    })
    expect(rows(site)).toEqual([['Busiest day', '6 November and 1 more', '19 visitors'], ['Quietest day', '28 October', '2 visitors'], ['Whole days without visitors', '0 of 29', '']])
  })

  it('draws a breakdown as visitors with pageviews beside them, logos for sources, five then "and N more"', () => {
    const r = (value: string, visitors: number, pageviews: number) => ({ value, source: 'visitor-supplied', visitors, pageviews })
    const v = view('get_breakdown', { dimension: 'referrer', period: '30d' }, {
      range: OCT_NOV, dimension: 'referrer', filters: [],
      rows: [r('Direct', 111, 184), r('Shared Link', 107, 334), r('google.com', 48, 93), r('LinkedIn', 21, 25), r('duckduckgo.com', 11, 18), r('ChatGPT', 6, 18), r('', 1, 1)],
    })
    expect(titles(v)).toEqual([['Sources', '14 October to 12 November']])
    expect(v.kind === 'figures' && v.blocks[0].rows[0]).toEqual({ name: 'Direct', value: '111', note: '184 pageviews', mark: false, logo: true })
    expect(v.kind === 'figures' && v.blocks[0].more).toBe(2)
  })

  it('draws who is on the site now, with the pages they are on', () => {
    const v = view('get_realtime', {}, { window_minutes: 5, visitors_now: 2, top_pages: [{ path: '/pricing', visitors: 2 }] })
    expect(titles(v)).toEqual([['Visitors right now', null]])
    expect(rows(v)).toEqual([['Visitors now', '2', 'last 5 minutes'], ['/pricing', '2', '']])
  })

  it('draws uptime per monitor, a monitor down now marked, then the incidents', () => {
    const up = view('get_uptime', { period: 'month' }, {
      range: NOV, monitors: [{ name: 'ciphera.net', status_now: 'up', checks: 3198, failed_checks: 0, uptime: 100 }], incidents: [],
    })
    expect(rows(up)).toEqual([['ciphera.net', '100%', '0 failed checks'], ['Incidents', '0', '']])
    const down = view('get_uptime', {}, {
      range: NOV, monitors: [{ name: 'api', status_now: 'down', checks: 400, failed_checks: 3, uptime: 99.25 }, { name: 'new', status_now: 'unknown', checks: 0, failed_checks: 0, uptime: null }],
      incidents: [{ monitor: 'api' }],
    })
    expect(rows(down)).toEqual([['api', '99.3%', 'down now'], ['new', 'no checks', '0 failed checks'], ['Incidents', '1', '']])
    expect(marks(down)).toEqual(['api'])
  })

  it('draws journeys as the visits that went on, then where they went next with each share', () => {
    const moves: [string, string, number][] = [['/', '/about', 11], ['/', '/blog', 11], ['/', '/trust', 8], ['/', '/privacy', 3], ['/', '/glossary', 2], ['/', '/products/pulse', 2], ['/', '/contact', 1]]
    const v = view('get_journeys', { entry_page: '/', period: '30d', steps: 3 }, {
      range: { from: '2026-10-14', to: '2026-11-11' }, entry_page: '/', visits_of_two_pages_or_more: 46, first_pages: [['/', 46]],
      steps: [{ to_page: 2, visits: 46, moves }, { to_page: 3, visits: 34, moves: [] }],
    })
    expect(titles(v)).toEqual([['Journeys from /', '14 October to 11 November']])
    expect(rows(v)).toEqual([
      ['Went on to another page', '46 visits', ''],
      ['/about', '11', '23.9%'],
      ['/blog', '11', '23.9%'],
      ['/trust', '8', '17.4%'],
      ['/privacy', '3', '6.5%'],
      ['/glossary', '2', '4.3%'],
    ])
    expect(v.kind === 'figures' && v.blocks[0].more).toBe(2)
  })

  it('draws the weekdays by visitors a day, then the three busiest hours, an earlier hour first in a tie', () => {
    const v = view('get_hours', { period: '30d' }, {
      range: OCT_NOV, days: 30,
      by_hour: [[8, 0.6, 2.3], [9, 1.3, 1.6], [11, 0.8, 2.4], [12, 1, 2.3], [13, 0.8, 1.2]],
      by_weekday: [['Monday', 4, 9.5, 33.5], ['Tuesday', 4, 9, 24.3], ['Wednesday', 5, 9.4, 27.8], ['Thursday', 5, 11.8, 22.2],
        ['Friday', 4, 12.5, 37.5], ['Saturday', 4, 5.5, 9.8], ['Sunday', 4, 5, 6.8]],
    })
    expect(titles(v)).toEqual([
      ['Visitors a day, by weekday', '14 October to 12 November'],
      ['Peak hours, visitors an hour', '14 October to 12 November'],
    ])
    expect(rows(v, 0)?.[0]).toEqual(['Monday', '9.5', '33.5 pageviews'])
    expect(rows(v, 0)?.[1]).toEqual(['Tuesday', '9', '24.3 pageviews'])
    expect(rows(v, 1)).toEqual([['09:00', '1.3', '1.6 pageviews'], ['12:00', '1', '2.3 pageviews'], ['11:00', '0.8', '2.4 pageviews']])
  })

  it('draws the CDN against the period before, each figure with what it was', () => {
    const v = view('get_cdn', { period: 'month' }, {
      range: NOV, previous_range: { from: '2026-10-20', to: '2026-10-31' }, connection: 'active',
      current: { data_mb: 20563.8, requests: 207336, cache_hit_rate: 65.5, errors: 23778, origin_response_ms: 101.5 },
      previous: { data_mb: 21580.1, requests: 196155, cache_hit_rate: 68.9, errors: 17719, origin_response_ms: 190.5 },
    })
    expect(titles(v)).toEqual([['CDN figures', '1 to 12 November against 20 to 31 October']])
    expect(rows(v)).toEqual([
      ['Requests', '207,336', 'was 196,155'],
      ['Data served', '20,564 MB', 'was 21,580 MB'],
      ['Cache hit rate', '65.5%', 'was 68.9%'],
      ['Errors', '23,778', 'was 17,719'],
      ['Origin response', '102ms', 'was 191ms'],
    ])
  })
})
