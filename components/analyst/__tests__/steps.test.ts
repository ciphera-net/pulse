// "Figures behind this answer": what each of Analyst's lookups shows, fed the shapes pulse-backend's tools return
// (internal/api/barry_tools.go). The ranges are the site's calendar days as the server resolved them, so they must
// print the same in every timezone: this file also runs in the UTC+14 lane (npm run test:tz-positive).
import { describe, it, expect } from 'vitest'
import type { AnalystStep } from '@/lib/api/analyst'
import { COMPARE_ROWS_SHOWN, describeStep, formatRange, runningLookup } from '../steps'

const THIS_WEEK = { from: '2026-11-04', to: '2026-11-10' }
const LAST_WEEK = { from: '2026-10-28', to: '2026-11-03' }

const step = (tool: string, args: Record<string, unknown> | null, result?: unknown, error?: string): AnalystStep => ({
  tool,
  args,
  result,
  error,
  ms: 120,
})

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
      kind: 'line',
      text: 'Totals, 4 to 10 November',
      failed: false,
    })
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
    expect(view).toEqual({ kind: 'line', text: 'Totals for google.com, 4 to 10 November', failed: false })
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
    expect(describeStep(step('get_excluded_traffic', { filters: ['referrer==google.com'] }, { events_last_7_days: 30 }))).toMatchObject({
      text: 'Traffic kept out of your stats',
    })
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

  it('names the traffic kept out as the settings page does', () => {
    expect(describeStep(step('get_excluded_traffic', {}, { events_last_7_days: 30, by_kind: [] }))).toEqual({
      kind: 'line',
      text: 'Traffic kept out of your stats',
      failed: false,
    })
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
    expect(finished('get_goals', { filters }, { range: THIS_WEEK, filters, events: [] })).toMatchObject({
      text: 'Goals and events for google.com, 4 to 10 November',
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
    expect(finished('get_journeys', {}, { range: THIS_WEEK, visits: 120, first_pages: [], steps: [] })).toMatchObject({
      text: 'Journeys, 4 to 10 November',
    })
    const filters = ['country==BE']
    expect(finished('get_journeys', { entry_page: '/pricing', filters }, { range: THIS_WEEK, entry_page: '/pricing', filters, visits: 9 })).toMatchObject({
      text: 'Journeys from /pricing for Belgium, 4 to 10 November',
    })
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
