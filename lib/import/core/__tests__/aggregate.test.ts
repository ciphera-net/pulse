// @vitest-environment node
//
// The keyed fold for aggregate sources (M2-d, M2-k): one row per client key,
// the window clip with its reasons, and the cardinality caps into a real
// `(other)` row — 1,000 named values per day and dimension, 1,000 named
// acquisition tuples per day, and the `(other)` row on top (the server's
// reading, §3.12b "Build amendments").

import { describe, expect, it } from 'vitest'
import { ImportError } from '../../errors'
import type { AcquisitionRow, DimensionRow } from '../../types'
import { AggregateBuilder, MAX_COUNT } from '../aggregate'
import { DIMENSION_VALUE_CAP, OTHER, capGroup, type Clip } from '../cap'
import { SkipLedger } from '../skipped'

const at = (line: number) => ({ file: 'f.csv', line })

function dim(over: Partial<DimensionRow>): DimensionRow {
  return { date: '2026-03-01', dimension: 'page', parent: '', value: '/', visitors: 1, visits: 1, pageviews: 1, ...over }
}

function acq(over: Partial<AcquisitionRow>): AcquisitionRow {
  return {
    date: '2026-03-01',
    referrer: 'Google',
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    src_source: 'Google',
    src_medium: '',
    src_campaign: '',
    src_channel_group: '',
    visitors: 1,
    visits: 1,
    pageviews: 1,
    ...over,
  }
}

describe('AggregateBuilder: one row per client key', () => {
  it('sums rows that share a dimension key, and keeps null only where every row was null', () => {
    const b = new AggregateBuilder(null, new SkipLedger())
    b.addDimension(dim({ visitors: 2, visits: 3, pageviews: 4 }), at(2))
    b.addDimension(dim({ visitors: 5, visits: null, pageviews: 6 }), at(3))
    b.addDimension(dim({ value: '/other-page', visits: null, pageviews: null }), at(4))
    expect(b.build().dimensions).toEqual([
      dim({ visitors: 7, visits: 3, pageviews: 10 }),
      dim({ value: '/other-page', visits: null, pageviews: null }),
    ])
  })

  it('sums daily rows for the same date, src_* included', () => {
    const b = new AggregateBuilder(null, new SkipLedger())
    b.addDaily({ date: '2026-03-01', visitors: 1, visits: 2, pageviews: 3, src_bounces: 1, src_engagement_seconds: null }, at(2))
    b.addDaily({ date: '2026-03-01', visitors: 1, visits: 1, pageviews: 1, src_bounces: 2, src_engagement_seconds: 60 }, at(3))
    expect(b.build().daily).toEqual([
      { date: '2026-03-01', visitors: 2, visits: 3, pageviews: 4, src_bounces: 3, src_engagement_seconds: 60 },
    ])
  })

  it('folds acquisition rows on (date, referrer, src_source, src_medium, src_campaign)', () => {
    const b = new AggregateBuilder(null, new SkipLedger())
    b.addAcquisition(acq({ utm_source: 'google', visitors: 2 }), at(2))
    b.addAcquisition(acq({ utm_source: 'google', visitors: 3 }), at(3))
    b.addAcquisition(acq({ src_campaign: 'spring', utm_campaign: 'spring' }), at(4))
    expect(b.build().acquisition).toEqual([
      acq({ utm_source: 'google', visitors: 5, visits: 2, pageviews: 2 }),
      acq({ src_campaign: 'spring', utm_campaign: 'spring' }),
    ])
  })

  it('makes a field outside the key null when the folded rows disagree on it', () => {
    const b = new AggregateBuilder(null, new SkipLedger())
    b.addAcquisition(acq({ utm_source: 'google' }), at(2))
    b.addAcquisition(acq({ utm_source: null }), at(3))
    b.addAcquisition(acq({ utm_source: 'google' }), at(4))
    const [row] = b.build().acquisition
    expect(row.utm_source).toBeNull()
    expect(row.visitors).toBe(3)
  })

  it('returns rows sorted by client key whatever order they arrived in', () => {
    const forward = new AggregateBuilder(null, new SkipLedger())
    const backward = new AggregateBuilder(null, new SkipLedger())
    const rows = [
      dim({ date: '2026-03-02', value: '/b' }),
      dim({ date: '2026-03-01', dimension: 'country', value: 'BE' }),
      dim({ date: '2026-03-01', value: '/a' }),
    ]
    rows.forEach((r, i) => forward.addDimension(r, at(i)))
    ;[...rows].reverse().forEach((r, i) => backward.addDimension(r, at(i)))
    const f = forward.build().dimensions
    expect(backward.build().dimensions).toEqual(f)
    expect(f.map((r) => `${r.date} ${r.dimension} ${r.value}`)).toEqual([
      '2026-03-01 country BE',
      '2026-03-01 page /a',
      '2026-03-02 page /b',
    ])
  })
})

describe('AggregateBuilder: the window clip', () => {
  const clip: Clip = { from: '2026-03-02', through: '2026-03-03', before: 'outside_history_window', after: 'pulse_measured' }

  it('drops rows outside the clip, by side, and says so', () => {
    const skipped = new SkipLedger()
    const b = new AggregateBuilder(clip, skipped)
    expect(b.addDimension(dim({ date: '2026-03-01' }), at(2))).toBe(false)
    expect(b.addDimension(dim({ date: '2026-03-02' }), at(3))).toBe(true)
    expect(b.addAcquisition(acq({ date: '2026-03-04' }), at(4))).toBe(false)
    expect(b.addDaily({ date: '2026-03-03', visitors: 1, visits: 1, pageviews: 1, src_bounces: null, src_engagement_seconds: null }, at(5))).toBe(true)
    expect(skipped.toCounts()).toEqual({ outside_history_window: 1, pulse_measured: 1 })
    expect(skipped.toSamples()).toEqual({
      outside_history_window: [{ file: 'f.csv', line: 2 }],
      pulse_measured: [{ file: 'f.csv', line: 4 }],
    })
    const rows = b.build()
    expect(rows.dimensions.map((r) => r.date)).toEqual(['2026-03-02'])
    expect(rows.acquisition).toEqual([])
  })

  it('drops a month that reaches outside the clip, since its unique count no longer describes the days kept', () => {
    const skipped = new SkipLedger()
    const wide: Clip = { from: '2026-02-15', through: '2026-04-30', before: 'outside_history_window', after: 'pulse_measured' }
    const b = new AggregateBuilder(wide, skipped)
    expect(b.addMonthly({ month: '2026-02-01', visitors: 10, full_month: true }, at(2))).toBe(false)
    expect(b.addMonthly({ month: '2026-03-01', visitors: 10, full_month: true }, at(3))).toBe(true)
    expect(skipped.toCounts()).toEqual({ outside_history_window: 1 })
    expect(b.build().monthly).toEqual([{ month: '2026-03-01', visitors: 10, full_month: true }])
  })
})

describe('AggregateBuilder: the cardinality caps', () => {
  it('keeps the 1,000 biggest page values of a day and folds the rest into one real (other) row on top', () => {
    const b = new AggregateBuilder(null, new SkipLedger())
    // 1,500 values: /v0 has the most visitors, /v1499 the fewest.
    for (let i = 0; i < 1500; i++) b.addDimension(dim({ value: `/v${i}`, visitors: 2000 - i, visits: 1, pageviews: 1 }), at(i + 2))
    const pages = b.build().dimensions
    // 1,000 named values and the (other) row: the server's cap, so it never folds again.
    expect(pages).toHaveLength(1001)
    expect(pages.filter((r) => r.value !== OTHER)).toHaveLength(1000)
    const other = pages.find((r) => r.value === OTHER) as DimensionRow
    // The 500 smallest, summed.
    let visitors = 0
    for (let i = 1000; i < 1500; i++) visitors += 2000 - i
    expect(other).toEqual(dim({ value: OTHER, visitors, visits: 500, pageviews: 500 }))
    expect(pages.some((r) => r.value === '/v999')).toBe(true)
    expect(pages.some((r) => r.value === '/v1000')).toBe(false)
  })

  it('folds one value past the cap into (other), rather than leaving a day at 1,001 named values', () => {
    const b = new AggregateBuilder(null, new SkipLedger())
    for (let i = 0; i < 1001; i++) b.addDimension(dim({ value: `/v${i}`, visitors: 2000 - i }), at(i + 2))
    const pages = b.build().dimensions
    expect(pages.filter((r) => r.value !== OTHER)).toHaveLength(1000)
    expect(pages.filter((r) => r.value === OTHER)).toEqual([dim({ value: OTHER, visitors: 2000 - 1000 })])
  })

  it('folds the source\'s own (other) into the one (other) row, so there are never two', () => {
    const b = new AggregateBuilder(null, new SkipLedger())
    for (let i = 0; i < 1001; i++) b.addDimension(dim({ value: `/v${i}`, visitors: 5 }), at(i + 2))
    b.addDimension(dim({ value: OTHER, visitors: 1000 }), at(9999))
    const pages = b.build().dimensions
    // 1,001 named values and the source's (other): 1,000 kept, the 1,001st and
    // the source's (other) summed into one row.
    expect(pages).toHaveLength(1001)
    expect(pages.filter((r) => r.value === OTHER)).toEqual([dim({ value: OTHER, visitors: 1000 + 5, visits: 2, pageviews: 2 })])
  })

  it('keeps the source\'s own (other) as it is beside 1,000 named values: it is not a named value', () => {
    const b = new AggregateBuilder(null, new SkipLedger())
    for (let i = 0; i < 1000; i++) b.addDimension(dim({ value: `/v${i}`, visitors: 5 }), at(i + 2))
    b.addDimension(dim({ value: OTHER, visitors: 1000 }), at(9999))
    const pages = b.build().dimensions
    expect(pages).toHaveLength(1001)
    expect(pages.filter((r) => r.value === OTHER)).toEqual([dim({ value: OTHER, visitors: 1000 })])
  })

  it('leaves a day with exactly 1,000 values alone', () => {
    const b = new AggregateBuilder(null, new SkipLedger())
    for (let i = 0; i < 1000; i++) b.addDimension(dim({ value: `/v${i}` }), at(i + 2))
    expect(b.build().dimensions.some((r) => r.value === OTHER)).toBe(false)
  })

  it('caps each (day, dimension) on its own', () => {
    const b = new AggregateBuilder(null, new SkipLedger())
    for (let i = 0; i < 1001; i++) {
      b.addDimension(dim({ value: `/v${i}` }), at(i))
      b.addDimension(dim({ dimension: 'browser', value: `B${i}` }), at(i))
      b.addDimension(dim({ date: '2026-03-02', value: `/v${i}` }), at(i))
    }
    const rows = b.build().dimensions
    const count = (date: string, d: string) => rows.filter((r) => r.date === date && r.dimension === d).length
    // Each group: 1,000 named values and its own (other).
    expect([count('2026-03-01', 'page'), count('2026-03-01', 'browser'), count('2026-03-02', 'page')]).toEqual([1001, 1001, 1001])
  })

  it('keeps the 1,000 biggest acquisition tuples of a day and folds the rest into referrer (other) on top', () => {
    const b = new AggregateBuilder(null, new SkipLedger())
    for (let i = 0; i < 1200; i++) {
      b.addAcquisition(acq({ referrer: `r${i}.example`, src_source: `r${i}.example`, visitors: 5000 - i, utm_source: 'x' }), at(i))
    }
    const rows = b.build().acquisition
    expect(rows).toHaveLength(1001)
    expect(rows.filter((r) => r.referrer !== OTHER)).toHaveLength(1000)
    expect(rows.some((r) => r.referrer === 'r999.example')).toBe(true)
    expect(rows.some((r) => r.referrer === 'r1000.example')).toBe(false)
    const other = rows.find((r) => r.referrer === OTHER) as AcquisitionRow
    expect(other).toMatchObject({
      referrer: OTHER,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      src_source: '',
      src_medium: '',
      src_campaign: '',
      src_channel_group: '',
      visits: 200,
      pageviews: 200,
    })
  })

  it('counts only named values against the cap, as the server does (capGroup)', () => {
    const rank = (v: string) => ({ visitors: 1, pageviews: 1, visits: 1, tiebreak: v })
    const isOther = (v: string) => v === OTHER
    const named = (n: number) => Array.from({ length: n }, (_, i) => `/v${String(i).padStart(5, '0')}`)
    expect(DIMENSION_VALUE_CAP).toBe(1000)
    // 1,000 named values and a source's (other): within the cap, nothing to fold.
    expect(capGroup([...named(1000), OTHER], 1000, rank, isOther)).toBeNull()
    // 1,001 named values: 1,000 kept, one folded.
    const one = capGroup(named(1001), 1000, rank, isOther)
    expect(one?.kept).toHaveLength(1000)
    expect(one?.folded).toEqual(['/v01000'])
    // Past the cap, the source's (other) is folded with the rest.
    const both = capGroup([OTHER, ...named(1001)], 1000, rank, isOther)
    expect(both?.kept).toHaveLength(1000)
    expect(both?.kept).not.toContain(OTHER)
    expect(both?.folded).toEqual(['/v01000', OTHER])
  })

  it('breaks ties by key so the kept set is the same every time', () => {
    const run = () => {
      const b = new AggregateBuilder(null, new SkipLedger())
      for (let i = 1200; i > 0; i--) b.addDimension(dim({ value: `/tie${i}`, visitors: 7 }), at(i))
      return b.build().dimensions.map((r) => r.value)
    }
    expect(run()).toEqual(run())
    expect(run()).toContain('/tie1')
  })
})

describe('AggregateBuilder: limits', () => {
  it('stops with file_too_large_for_browser past its row limit', () => {
    const b = new AggregateBuilder(null, new SkipLedger(), 3)
    for (let i = 0; i < 3; i++) b.addDimension(dim({ value: `/v${i}` }), at(i))
    let error: unknown
    try {
      b.addDimension(dim({ value: '/one-too-many' }), at(9))
    } catch (e) {
      error = e
    }
    expect((error as ImportError).code).toBe('file_too_large_for_browser')
  })

  it('names a sum that overflows the wire\'s count range as the wrong file', () => {
    const b = new AggregateBuilder(null, new SkipLedger())
    b.addDimension(dim({ visitors: MAX_COUNT }), at(2))
    b.addDimension(dim({ visitors: 1 }), at(3))
    let error: unknown
    try {
      b.build()
    } catch (e) {
      error = e
    }
    expect((error as ImportError).code).toBe('wrong_file')
    expect((error as ImportError).detail.reason).toBe('value_out_of_range')
  })
})
