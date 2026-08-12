import { describe, expect, it } from 'vitest'
import {
  parseActiveMetrics,
  serializeActiveMetrics,
  rollupSeries,
  parseGranularity,
} from '../searchMetrics'
import { parseSort, serializeSort, sortRows } from '../tableSort'
import type { GSCDailyTotal } from '@/lib/api/gsc'

const day = (date: string, clicks: number, impressions: number, position: number | null): GSCDailyTotal => ({
  date,
  clicks,
  impressions,
  ctr: impressions > 0 ? clicks / impressions : 0,
  position,
})

describe('parseActiveMetrics / serializeActiveMetrics', () => {
  it('defaults to clicks+impressions', () => {
    expect(parseActiveMetrics(null)).toEqual(['clicks', 'impressions'])
    expect(parseActiveMetrics('bogus,also-bogus')).toEqual(['clicks', 'impressions'])
  })

  it('normalizes order to the metric order', () => {
    expect(parseActiveMetrics('position,clicks')).toEqual(['clicks', 'position'])
  })

  it('keeps the default set out of the URL', () => {
    expect(serializeActiveMetrics(['impressions', 'clicks'])).toBeNull()
    expect(serializeActiveMetrics(['clicks', 'position'])).toBe('clicks,position')
  })
})

describe('parseGranularity', () => {
  it('accepts weekly/monthly, falls back to daily', () => {
    expect(parseGranularity('weekly')).toBe('weekly')
    expect(parseGranularity('monthly')).toBe('monthly')
    expect(parseGranularity('hourly')).toBe('daily')
    expect(parseGranularity(null)).toBe('daily')
  })
})

describe('rollupSeries', () => {
  // 2026-08-03 is a Monday; 08-09 a Sunday; 08-10 the next Monday.
  const daily = [
    day('2026-08-03', 2, 100, 4.0),
    day('2026-08-09', 1, 50, 10.0),
    day('2026-08-10', 3, 300, 8.0),
  ]

  it('daily is a passthrough with parsed dates', () => {
    const out = rollupSeries(daily, 'daily')
    expect(out).toHaveLength(3)
    expect(out[0].clicks).toBe(2)
    expect(out[0].position).toBe(4.0)
  })

  it('weekly buckets on Mondays and weights position by impressions', () => {
    const out = rollupSeries(daily, 'weekly')
    expect(out).toHaveLength(2)
    // Week of Mon 03-08: days 03 + 09
    expect(out[0].clicks).toBe(3)
    expect(out[0].impressions).toBe(150)
    expect(out[0].ctr).toBeCloseTo(3 / 150)
    // Weighted: (4*100 + 10*50) / 150 = 6.0 — a plain mean would say 7.0
    expect(out[0].position).toBeCloseTo(6.0)
    // Week of Mon 10-08
    expect(out[1].clicks).toBe(3)
  })

  it('monthly buckets on the 1st', () => {
    const out = rollupSeries([...daily, day('2026-07-30', 5, 500, 2.0)], 'monthly')
    expect(out).toHaveLength(2)
    expect(out[0].date.getMonth()).toBe(6) // July
    expect(out[1].clicks).toBe(6)
  })

  it('a bucket with no position days stays null — never 0', () => {
    const out = rollupSeries([day('2026-08-03', 2, 100, null), day('2026-08-04', 1, 50, null)], 'weekly')
    expect(out).toHaveLength(1)
    expect(out[0].position).toBeNull()
    expect(out[0].clicks).toBe(3)
  })

  it('mixed null/known position weights only the known days', () => {
    const out = rollupSeries([day('2026-08-03', 2, 100, null), day('2026-08-04', 1, 50, 8.0)], 'weekly')
    expect(out[0].position).toBeCloseTo(8.0)
  })
})

describe('sort grammar + sortRows', () => {
  it('parses and serializes the ?s= grammar', () => {
    expect(parseSort('clicks')).toEqual({ col: 'clicks', dir: 'desc' })
    expect(parseSort('position:asc')).toEqual({ col: 'position', dir: 'asc' })
    expect(parseSort('nope')).toBeNull()
    expect(serializeSort({ col: 'ctr', dir: 'desc' })).toBe('ctr')
    expect(serializeSort({ col: 'ctr', dir: 'asc' })).toBe('ctr:asc')
    expect(serializeSort(null)).toBeNull()
  })

  const rows = [
    { name: 'a', clicks: 1, impressions: 10, ctr: 0.1, position: 12.0 },
    { name: 'b', clicks: 3, impressions: 5, ctr: 0.6, position: null },
    { name: 'c', clicks: 2, impressions: 20, ctr: 0.1, position: 3.0 },
  ]

  it('sorts by the requested column and direction', () => {
    expect(sortRows(rows, { col: 'clicks', dir: 'desc' }).map((r) => r.name)).toEqual(['b', 'c', 'a'])
    expect(sortRows(rows, { col: 'impressions', dir: 'asc' }).map((r) => r.name)).toEqual(['b', 'a', 'c'])
  })

  it('null position sinks to the bottom in both directions', () => {
    expect(sortRows(rows, { col: 'position', dir: 'asc' }).map((r) => r.name)).toEqual(['c', 'a', 'b'])
    expect(sortRows(rows, { col: 'position', dir: 'desc' }).map((r) => r.name)).toEqual(['a', 'c', 'b'])
  })

  it('no sort returns the input untouched', () => {
    expect(sortRows(rows, null)).toBe(rows)
  })
})
