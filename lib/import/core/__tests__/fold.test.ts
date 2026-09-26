// @vitest-environment node
//
// The raw fold, gate 5 (§3.12b): day bucketing in the SITE's zone across DST
// changes, the zone resolved once per UTC hour, distinct counts, entry and exit
// pages from visit ids, the cardinality cap into a real `(other)` row, and the
// memory budget that counts every Set insertion.
//
// Mutations these kill:
//   - memoising the DAY per UTC hour (Kolkata's midnight is at :30 past);
//   - dropping the "offset changed inside this hour" check (Adelaide changes at
//     :30 past);
//   - keying the memo by anything finer than the hour (the call count);
//   - counting buckets instead of insertions against the budget.

import { describe, expect, it } from 'vitest'
import { ImportError } from '../../errors'
import { OTHER } from '../cap'
import { DayResolver, FOLD_BUDGET, RawFolder, intlOffsetResolver, type RawPageview } from '../fold'
import { SkipLedger } from '../skipped'

const T = (iso: string) => Date.parse(iso)
const HOUR = 3_600_000

function exactDay(timeZone: string, at: number): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
  const get = (t: string) => p.find((x) => x.type === t)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

describe('DayResolver', () => {
  it.each([
    // Europe/Brussels springs forward at 01:00Z on 29-03-2026 (+1 → +2).
    ['Europe/Brussels', '2026-03-28T22:59:59Z', '2026-03-28'],
    ['Europe/Brussels', '2026-03-28T23:00:00Z', '2026-03-29'],
    ['Europe/Brussels', '2026-03-29T00:59:59Z', '2026-03-29'],
    ['Europe/Brussels', '2026-03-29T01:00:00Z', '2026-03-29'],
    ['Europe/Brussels', '2026-03-29T21:59:59Z', '2026-03-29'],
    ['Europe/Brussels', '2026-03-29T22:00:00Z', '2026-03-30'],
    // …and falls back at 01:00Z on 25-10-2026 (+2 → +1): a 25-hour day.
    ['Europe/Brussels', '2026-10-24T21:59:59Z', '2026-10-24'],
    ['Europe/Brussels', '2026-10-24T22:00:00Z', '2026-10-25'],
    ['Europe/Brussels', '2026-10-25T22:59:59Z', '2026-10-25'],
    ['Europe/Brussels', '2026-10-25T23:00:00Z', '2026-10-26'],
    // America/New_York springs forward at 07:00Z on 08-03-2026 (−5 → −4).
    ['America/New_York', '2026-03-08T04:59:59Z', '2026-03-07'],
    ['America/New_York', '2026-03-08T05:00:00Z', '2026-03-08'],
    ['America/New_York', '2026-03-09T03:59:59Z', '2026-03-08'],
    ['America/New_York', '2026-03-09T04:00:00Z', '2026-03-09'],
    // Asia/Kolkata is +05:30: its midnight falls at HALF PAST a UTC hour.
    ['Asia/Kolkata', '2026-01-01T18:29:59Z', '2026-01-01'],
    ['Asia/Kolkata', '2026-01-01T18:30:00Z', '2026-01-02'],
    // Asia/Kathmandu is +05:45.
    ['Asia/Kathmandu', '2026-01-01T18:14:59Z', '2026-01-01'],
    ['Asia/Kathmandu', '2026-01-01T18:15:00Z', '2026-01-02'],
    ['UTC', '2026-06-30T23:59:59.999Z', '2026-06-30'],
    ['UTC', '2026-07-01T00:00:00Z', '2026-07-01'],
  ])('%s: %s is %s', (zone, iso, day) => {
    expect(DayResolver.forZone(zone).dayOf(T(iso))).toBe(day)
  })

  it('resolves an offset change at HALF PAST a UTC hour exactly (Adelaide, 03-10-2026 16:30Z)', () => {
    const r = DayResolver.forZone('Australia/Adelaide')
    expect(r.offsetAt(T('2026-10-03T16:29:00Z'))).toBe(9.5 * HOUR)
    expect(r.offsetAt(T('2026-10-03T16:45:00Z'))).toBe(10.5 * HOUR)
    expect(r.offsetAt(T('2026-10-03T17:15:00Z'))).toBe(10.5 * HOUR)
  })

  it('agrees with a per-instant Intl lookup on 20,000 random instants across awkward zones', () => {
    const zones = [
      'Europe/Brussels',
      'America/New_York',
      'America/St_Johns',
      'Asia/Kolkata',
      'Asia/Kathmandu',
      'Australia/Adelaide',
      'Australia/Lord_Howe',
      'Pacific/Chatham',
      'Pacific/Kiritimati',
      'America/Santiago',
    ]
    let x = 12345
    const next = () => {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0
      return x / 4294967296
    }
    const from = T('2025-12-01T00:00:00Z')
    const span = 400 * 24 * HOUR
    for (const zone of zones) {
      const r = DayResolver.forZone(zone)
      for (let i = 0; i < 2000; i++) {
        const at = from + Math.floor(next() * span)
        expect(r.dayOf(at), `${zone} ${new Date(at).toISOString()}`).toBe(exactDay(zone, at))
      }
    }
  })

  it('asks the zone once per UTC hour, not once per row', () => {
    let calls = 0
    const real = intlOffsetResolver('Europe/Brussels')
    const r = new DayResolver((at) => {
      calls++
      return real(at)
    })
    const start = T('2026-05-01T10:00:00Z')
    // 10,000 rows spread over five whole UTC hours.
    for (let i = 0; i < 10_000; i++) r.dayOf(start + Math.floor((i / 10_000) * 5 * HOUR))
    // Five hour starts, plus the start of the hour after the last one.
    expect(calls).toBe(6)
  })
})

// ─── The fold ────────────────────────────────────────────────────────────

let line = 1
function pv(over: Partial<RawPageview> & Pick<RawPageview, 'at' | 'visitor' | 'visit' | 'page'>): RawPageview {
  return { acquisition: null, dimensions: {}, file: 'events.csv', line: ++line, ...over }
}

const google = {
  referrer: 'google.com',
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  src_source: 'google.com',
  src_medium: '',
  src_campaign: '',
  src_channel_group: '',
}

describe('RawFolder', () => {
  it('counts distinct visitors and visits and every pageview, per site-local day', () => {
    const skipped = new SkipLedger()
    const f = new RawFolder({ timeZone: 'Europe/Brussels', clip: null, skipped })
    // Day 1 (Brussels): visitor A, one visit, two pages; visitor B, one visit.
    f.add(pv({ at: T('2026-03-10T09:00:00Z'), visitor: 'A', visit: 'a1', page: '/', acquisition: google, dimensions: { country: 'BE', device: 'Desktop' } }))
    f.add(pv({ at: T('2026-03-10T09:05:00Z'), visitor: 'A', visit: 'a1', page: '/pricing', acquisition: google, dimensions: { country: 'BE', device: 'Desktop' } }))
    f.add(pv({ at: T('2026-03-10T10:00:00Z'), visitor: 'B', visit: 'b1', page: '/', dimensions: { country: 'DE', device: 'Mobile' } }))
    // 23:30Z on the 10th is 00:30 on the 11th in Brussels: day 2. A comes back.
    f.add(pv({ at: T('2026-03-10T23:30:00Z'), visitor: 'A', visit: 'a2', page: '/pricing', dimensions: { country: 'BE', device: 'Desktop' } }))
    const rows = f.finish()

    expect(rows.daily).toEqual([
      { date: '2026-03-10', visitors: 2, visits: 2, pageviews: 3, src_bounces: null, src_engagement_seconds: null },
      { date: '2026-03-11', visitors: 1, visits: 1, pageviews: 1, src_bounces: null, src_engagement_seconds: null },
    ])
    const d10 = rows.dimensions.filter((r) => r.date === '2026-03-10')
    expect(d10).toEqual([
      { date: '2026-03-10', dimension: 'country', parent: '', value: 'BE', visitors: 1, visits: 1, pageviews: 2 },
      { date: '2026-03-10', dimension: 'country', parent: '', value: 'DE', visitors: 1, visits: 1, pageviews: 1 },
      { date: '2026-03-10', dimension: 'device', parent: '', value: 'Desktop', visitors: 1, visits: 1, pageviews: 2 },
      { date: '2026-03-10', dimension: 'device', parent: '', value: 'Mobile', visitors: 1, visits: 1, pageviews: 1 },
      // Entrances: a1 entered on /, b1 entered on /. Pageviews are the visits' pageviews.
      { date: '2026-03-10', dimension: 'entry_page', parent: '', value: '/', visitors: 2, visits: 2, pageviews: 3 },
      { date: '2026-03-10', dimension: 'exit_page', parent: '', value: '/', visitors: 1, visits: 1, pageviews: 1 },
      { date: '2026-03-10', dimension: 'exit_page', parent: '', value: '/pricing', visitors: 1, visits: 1, pageviews: 2 },
      { date: '2026-03-10', dimension: 'page', parent: '', value: '/', visitors: 2, visits: 2, pageviews: 2 },
      { date: '2026-03-10', dimension: 'page', parent: '', value: '/pricing', visitors: 1, visits: 1, pageviews: 1 },
    ])
    // Acquisition is the visit's first pageview's origin; b1 had none.
    expect(rows.acquisition).toEqual([
      { date: '2026-03-10', ...google, visitors: 1, visits: 1, pageviews: 2 },
    ])
    expect(skipped.total()).toBe(0)
  })

  it('takes a visit\'s entrance and exit by time, whatever order the file is in', () => {
    const f = new RawFolder({ timeZone: 'UTC', clip: null, skipped: new SkipLedger() })
    f.add(pv({ at: T('2026-03-10T09:10:00Z'), visitor: 'A', visit: 'v', page: '/third' }))
    f.add(pv({ at: T('2026-03-10T09:00:00Z'), visitor: 'A', visit: 'v', page: '/first' }))
    f.add(pv({ at: T('2026-03-10T09:05:00Z'), visitor: 'A', visit: 'v', page: '/second' }))
    const rows = f.finish()
    const byDim = (d: string) => rows.dimensions.filter((r) => r.dimension === d).map((r) => [r.value, r.visits, r.pageviews])
    expect(byDim('entry_page')).toEqual([['/first', 1, 3]])
    expect(byDim('exit_page')).toEqual([['/third', 1, 3]])
  })

  it('keys region and city under their country', () => {
    const f = new RawFolder({ timeZone: 'UTC', clip: null, skipped: new SkipLedger() })
    f.add(pv({ at: T('2026-03-10T09:00:00Z'), visitor: 'A', visit: 'v', page: '/', dimensions: { country: 'BE', region: 'Flanders', city: 'Ghent' } }))
    const rows = f.finish()
    expect(rows.dimensions.filter((r) => r.dimension === 'region' || r.dimension === 'city').map((r) => [r.dimension, r.parent, r.value])).toEqual([
      ['city', 'BE', 'Ghent'],
      ['region', 'BE', 'Flanders'],
    ])
  })

  it('drops days outside the clip, counted by reason with line samples', () => {
    const skipped = new SkipLedger()
    const f = new RawFolder({
      timeZone: 'Europe/Brussels',
      clip: { from: '2026-03-10', through: '2026-03-11', before: 'outside_history_window', after: 'pulse_measured' },
      skipped,
    })
    line = 100
    f.add(pv({ at: T('2026-03-09T22:59:00Z'), visitor: 'A', visit: 'x', page: '/' })) // 101: 9th, before
    f.add(pv({ at: T('2026-03-09T23:00:00Z'), visitor: 'A', visit: 'y', page: '/' })) // 102: 10th, kept
    f.add(pv({ at: T('2026-03-11T23:00:00Z'), visitor: 'A', visit: 'z', page: '/' })) // 103: 12th, after
    const rows = f.finish()
    expect(rows.daily.map((r) => r.date)).toEqual(['2026-03-10'])
    expect(skipped.toCounts()).toEqual({ outside_history_window: 1, pulse_measured: 1 })
    expect(skipped.toSamples()).toEqual({
      outside_history_window: [{ file: 'events.csv', line: 101 }],
      pulse_measured: [{ file: 'events.csv', line: 103 }],
    })
  })

  it('caps a day at 1,000 page values, the rest a real (other) row with DISTINCT visitors', () => {
    const f = new RawFolder({ timeZone: 'UTC', clip: null, skipped: new SkipLedger() })
    const at = T('2026-03-10T12:00:00Z')
    // 999 popular pages with 3 visitors each; then 300 pages all seen by the
    // SAME one visitor. Their (other) row must count that visitor once.
    for (let p = 0; p < 999; p++) {
      for (const v of ['a', 'b', 'c']) f.add(pv({ at, visitor: `${v}${p}`, visit: `${v}${p}`, page: `/popular/${p}` }))
    }
    for (let p = 0; p < 300; p++) f.add(pv({ at, visitor: 'loner', visit: 'loner-visit', page: `/tail/${p}` }))
    const pages = f.finish().dimensions.filter((r) => r.dimension === 'page')
    expect(pages).toHaveLength(1000)
    const other = pages.find((r) => r.value === OTHER)
    expect(other).toEqual({ date: '2026-03-10', dimension: 'page', parent: '', value: OTHER, visitors: 1, visits: 1, pageviews: 300 })
    expect(pages.filter((r) => r.value.startsWith('/popular/'))).toHaveLength(999)
  })

  it('does not cap a day at exactly 1,000 values', () => {
    const f = new RawFolder({ timeZone: 'UTC', clip: null, skipped: new SkipLedger() })
    for (let p = 0; p < 1000; p++) f.add(pv({ at: T('2026-03-10T12:00:00Z'), visitor: 'v', visit: 'v', page: `/p/${p}` }))
    const pages = f.finish().dimensions.filter((r) => r.dimension === 'page')
    expect(pages).toHaveLength(1000)
    expect(pages.some((r) => r.value === OTHER)).toBe(false)
  })

  it('stops with file_too_large_for_browser once Set insertions pass the budget', () => {
    expect(FOLD_BUDGET).toBe(20_000_000)
    const f = new RawFolder({ timeZone: 'UTC', clip: null, skipped: new SkipLedger(), budget: 500 })
    // ONE page, ONE day — two buckets, however many visitors. Counting buckets
    // would never stop this; counting insertions does.
    let error: unknown
    try {
      for (let i = 0; i < 1000; i++) f.add(pv({ at: T('2026-03-10T12:00:00Z'), visitor: `v${i}`, visit: `v${i}`, page: '/' }))
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ImportError)
    expect((error as ImportError).code).toBe('file_too_large_for_browser')
    expect((error as ImportError).detail.limit).toBe(500)
    expect(f.insertions).toBeGreaterThan(500)
  })

  it('counts each new id, visit record and Set member exactly once', () => {
    const f = new RawFolder({ timeZone: 'UTC', clip: null, skipped: new SkipLedger() })
    f.add(pv({ at: T('2026-03-10T12:00:00Z'), visitor: 'v', visit: 'v1', page: '/' }))
    // 2 interned ids + 1 visit record + daily(visitor, visit) + page(visitor, visit)
    expect(f.insertions).toBe(7)
    f.add(pv({ at: T('2026-03-10T12:01:00Z'), visitor: 'v', visit: 'v1', page: '/' }))
    expect(f.insertions).toBe(7)
  })
})

// ─── Throughput ──────────────────────────────────────────────────────────
//
// M2-n: under about 2 s per million rows. Wall time on a shared CI pod is not
// a measurement of the code (the house lesson: benchmark against a canary of
// constant work), so the budget is 2 s/M on hardware as fast as the reference
// machine and SCALES with how much slower this machine runs the canary. What
// the assertion then catches is the fold getting slower relative to plain Map
// and Set work — resolving the zone per row, say, which costs several times
// the whole budget — and never a busy runner.

/** The canary: Map and Set work of the fold's own shape, identical on every run. */
function canary(): number {
  const t = performance.now()
  const m = new Map<string, Set<number>>()
  for (let i = 0; i < 300_000; i++) {
    const k = 'key-' + (i % 4000)
    let s = m.get(k)
    if (!s) m.set(k, (s = new Set()))
    s.add(i % 997)
    s.add(i % 1009)
  }
  return performance.now() - t
}

/**
 * The canary's time on the reference machine: an Apple-silicon laptop, measured
 * 27-09-2026 under vitest at 33.9–35.5 ms with the machine busy (load average
 * 4–7) and taken as 30. Recalibrate whenever the canary changes.
 */
const CANARY_REFERENCE_MS = 30
const BUDGET_MS_PER_MILLION = 2000

/** Realistic rows: visits of 1–5 pageviews a minute apart, in time order, 40% returning visitors. */
function realisticRows(n: number): () => Iterable<RawPageview> {
  let x = 11
  const r = () => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0
    return x / 4294967296
  }
  const cols = { at: new Float64Array(n), visitor: new Int32Array(n), visit: new Int32Array(n), page: new Int32Array(n), country: new Int32Array(n), device: new Int32Array(n), browser: new Int32Array(n), ref: new Int32Array(n) }
  const start = T('2026-01-01T00:00:00Z')
  let i = 0
  let visitors = 0
  let visits = 0
  while (i < n) {
    const t0 = start + Math.floor((i / n) * 180 * 24 * HOUR)
    const visitor = visitors > 0 && r() < 0.4 ? Math.floor(r() * visitors) : visitors++
    const visit = visits++
    const len = 1 + Math.floor(r() * 5)
    const country = Math.floor(r() * r() * 80)
    const device = Math.floor(r() * 3)
    const browser = Math.floor(r() * r() * 12)
    const ref = Math.floor(r() * r() * 200)
    for (let k = 0; k < len && i < n; k++, i++) {
      cols.at[i] = t0 + k * 60_000
      cols.visitor[i] = visitor
      cols.visit[i] = visit
      cols.page[i] = Math.floor(r() * r() * 2000)
      cols.country[i] = country
      cols.device[i] = device
      cols.browser[i] = browser
      cols.ref[i] = ref
    }
  }
  const devices = ['Desktop', 'Mobile', 'Tablet']
  return function* () {
    for (let j = 0; j < n; j++) {
      // Fresh strings on every row, as the CSV parser produces them.
      const ref = 'ref' + cols.ref[j] + '.com'
      yield {
        at: cols.at[j],
        visitor: 'visitor-' + cols.visitor[j],
        visit: 'visit-' + cols.visit[j],
        page: '/page/' + cols.page[j],
        acquisition: { ...google, referrer: ref, src_source: ref },
        dimensions: { country: 'C' + cols.country[j], device: devices[cols.device[j]] + '', browser: 'B' + cols.browser[j] },
        file: 'events.csv',
        line: j + 2,
      }
    }
  }
}

describe('RawFolder throughput', () => {
  it('folds a million realistic rows in about 2 s, scaled by this machine\'s speed', () => {
    const n = 250_000
    const rows = realisticRows(n)
    const fold = () => {
      const t = performance.now()
      const f = new RawFolder({ timeZone: 'Europe/Brussels', clip: null, skipped: new SkipLedger() })
      for (const row of rows()) f.add(row)
      f.finish()
      return performance.now() - t
    }
    // Three canary/fold PAIRS, each canary run immediately before its fold,
    // and the best pair decides: a burst of contention on a shared runner has
    // to hit every fold and miss every canary to fail this, while a fold that
    // got several times slower fails every pair.
    const pairs: { perMillion: number; canaryMs: number; budget: number }[] = []
    for (let i = 0; i < 3; i++) {
      const canaryMs = canary()
      const perMillion = (fold() * 1_000_000) / n
      pairs.push({ perMillion, canaryMs, budget: BUDGET_MS_PER_MILLION * Math.max(1, canaryMs / CANARY_REFERENCE_MS) })
    }
    const best = pairs.reduce((a, b) => (b.perMillion / b.budget < a.perMillion / a.budget ? b : a))
    console.info(
      `[fold] ${best.perMillion.toFixed(0)} ms per million rows; canary ${best.canaryMs.toFixed(1)} ms; budget ${best.budget.toFixed(0)} ms`,
    )
    expect(best.perMillion).toBeLessThan(best.budget)
  }, 60_000)
})
