import { describe, it, expect } from 'vitest'
import {
  axisTicks,
  changeText,
  comparePhrase,
  formatHeadline,
  formatShare,
  growthSubtitle,
  growthTitle,
  presetSpan,
  siteDay,
  siteDayTime,
  spanLabel,
  tickLabel,
} from '@/lib/reports/format'

// The words and numbers every report surface shares (PULSE-133/134). Pure, so
// the clock is always passed in: `today` is the SITE's day, and instants are
// shown in the site's zone whatever zone the test runner is in.

describe('presetSpan', () => {
  it('ends the trailing presets on the last complete day, and resolves the calendar ones', () => {
    expect(presetSpan('last_30_days', '2026-09-28')).toEqual({ start: '2026-08-29', end: '2026-09-27' })
    expect(presetSpan('last_90_days', '2026-09-28')).toEqual({ start: '2026-06-30', end: '2026-09-27' })
    expect(presetSpan('last_month', '2026-09-28')).toEqual({ start: '2026-08-01', end: '2026-08-31' })
    expect(presetSpan('last_quarter', '2026-09-28')).toEqual({ start: '2026-04-01', end: '2026-06-30' })
    expect(presetSpan('year_to_date', '2026-09-28')).toEqual({ start: '2026-01-01', end: '2026-09-27' })
  })

  it('crosses the year boundary', () => {
    expect(presetSpan('last_month', '2026-01-15')).toEqual({ start: '2025-12-01', end: '2025-12-31' })
    expect(presetSpan('last_quarter', '2026-02-10')).toEqual({ start: '2025-10-01', end: '2025-12-31' })
    expect(presetSpan('year_to_date', '2026-01-01')).toEqual({ start: '2026-01-01', end: '2026-01-01' })
    expect(presetSpan('last_month', '2028-03-01')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })
})

describe('comparePhrase', () => {
  it('names the comparison by its shape', () => {
    expect(comparePhrase('2026-06-30', '2026-09-27', 'previous')).toBe('the 90 days before')
    expect(comparePhrase('2026-08-01', '2026-08-31', 'previous')).toBe('the month before')
    expect(comparePhrase('2026-04-01', '2026-06-30', 'previous')).toBe('the quarter before')
    expect(comparePhrase('2026-09-27', '2026-09-27', 'previous')).toBe('the day before')
    expect(comparePhrase('2026-06-30', '2026-09-27', 'year')).toBe('the same days last year')
    expect(comparePhrase('2026-06-30', '2026-09-27', 'none')).toBeNull()
  })
})

describe('numbers', () => {
  it('writes changes with the arrow of the number', () => {
    expect(changeText({ value: 38, unit: '%' })).toBe('↑ 38%')
    expect(changeText({ value: -4, unit: 'pp' })).toBe('↓ 4pp')
    expect(changeText({ value: 2.5, unit: '%' })).toBe('↑ 2.5%')
  })

  it('writes headline values as the dashboard does, and null as an em dash', () => {
    expect(formatHeadline('visitors', 17240)).toBe('17,240')
    expect(formatHeadline('bounce_rate', 58.4)).toBe('58%')
    expect(formatHeadline('visit_duration', 112)).toBe('1m 52s')
    expect(formatHeadline('pageviews', null)).toBe('—')
  })

  it('reads shares as fractions of one', () => {
    expect(formatShare(41.3)).toBe('41%')
    expect(formatShare(0.4)).toBe('<1%')
    expect(formatShare(0)).toBe('0%')
    expect(formatShare(null)).toBe('—')
  })

  it('draws round-number axes', () => {
    expect(axisTicks(6480)).toEqual([0, 2000, 4000, 6000, 8000])
    expect(axisTicks(90)).toEqual([0, 25, 50, 75, 100])
    expect(axisTicks(0)).toEqual([0, 1, 2, 3, 4])
    expect([2500, 8000, 1_200_000, 400].map(tickLabel)).toEqual(['2.5k', '8k', '1.2M', '400'])
  })
})

describe('growth words', () => {
  it('says which way visitors went against what', () => {
    expect(growthTitle({ value: 38, unit: '%' }, 'the 90 days before')).toBe('Visitors are up 38% on the 90 days before')
    expect(growthTitle({ value: -12, unit: '%' }, 'the month before')).toBe('Visitors are down 12% on the month before')
    expect(growthTitle({ value: 0, unit: '%' }, 'the month before')).toBe('Visitors held level on the month before')
    expect(growthTitle(null, 'the month before')).toBe('Visitors per month')
    expect(growthTitle({ value: 38, unit: '%' }, null)).toBe('Visitors per month')
  })

  it('names the last month, "so far" while it runs', () => {
    const months = [{ month: '2026-08', partial: false }, { month: '2026-09', partial: true }]
    expect(growthSubtitle(months, { value: 9, unit: '%' })).toBe('Visitors per month, last 2 months. September so far is up 9% on August.')
    expect(growthSubtitle([{ month: '2026-07', partial: false }, { month: '2026-08', partial: false }], { value: -3, unit: '%' })).toBe(
      'Visitors per month, last 2 months. August is down 3% on July.',
    )
    expect(growthSubtitle(months, null)).toBe('Visitors per month, last 2 months.')
  })
})

describe('dates', () => {
  it('writes spans with the year, always', () => {
    expect(spanLabel('2026-06-30', '2026-09-27')).toBe('30 Jun – 27 Sep 2026')
    expect(spanLabel('2025-12-01', '2026-02-28')).toBe('1 Dec 2025 – 28 Feb 2026')
  })

  it("shows instants in the site's zone, not the runner's", () => {
    // 22:00 UTC on 30 Sep is midnight on 1 Oct in Brussels.
    expect(siteDay('2026-09-30T22:00:00Z', 'Europe/Brussels', 2026)).toBe('1 Oct')
    expect(siteDay('2026-09-30T22:00:00Z', 'UTC', 2026)).toBe('30 Sep')
    expect(siteDay('2027-01-05T12:00:00Z', 'Europe/Brussels', 2026)).toBe('5 Jan 2027')
    expect(siteDayTime('2026-09-28T12:02:00Z', 'Europe/Brussels')).toBe('28 Sep 2026, 14:02')
  })
})
