// "Figures behind this answer": what each of Analyst's lookups shows, fed the shapes pulse-backend's tools return
// (internal/api/barry_tools.go). The ranges are the site's calendar days as the server resolved them, so they must
// print the same in every timezone: this file also runs in the UTC+14 lane (npm run test:tz-positive).
import { describe, it, expect } from 'vitest'
import type { AnalystStep } from '@/lib/api/analyst'
import { COMPARE_ROWS_SHOWN, describeStep, formatRange } from '../steps'

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
    expect(failed('get_daily_series')).toMatchObject({ text: 'Analyst could not read the figures for each day' })
    expect(failed('get_realtime')).toMatchObject({ text: 'Analyst could not read who is on the site right now' })
    expect(failed('compare_periods')).toMatchObject({ text: 'Analyst could not compare the two periods', failed: true })
    expect(failed('get_goals')).toMatchObject({ text: 'One of the lookups failed', failed: true })
  })

  it('names a lookup it does not know without guessing what it read', () => {
    expect(describeStep(step('get_goals', {}, { range: THIS_WEEK }))).toEqual({
      kind: 'line',
      text: 'Another lookup, 4 to 10 November',
      failed: false,
    })
  })
})
