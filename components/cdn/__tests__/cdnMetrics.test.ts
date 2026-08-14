import { describe, expect, it } from 'vitest'
import { toCdnSeries, statusMix, fmtBytes, fmtHitRate, fmtOriginMs, cdnDayLabel, deriveLiveCard, CDN_PICKER_PRESETS } from '../cdnMetrics'
import type { BunnyDailyRow } from '@/lib/api/bunny'

function row(overrides: Partial<BunnyDailyRow> = {}): BunnyDailyRow {
  return {
    date: '2026-08-10',
    bandwidth_used: 1000,
    bandwidth_cached: 400,
    requests_served: 100,
    requests_cached: 60,
    error_3xx: 5,
    error_4xx: 3,
    error_5xx: 1,
    origin_response_time_avg: 80,
    ...overrides,
  }
}

describe('toCdnSeries', () => {
  it('derives origin bandwidth as total minus cached, clamped at zero', () => {
    const [p] = toCdnSeries([row()])
    expect(p.bandwidthOrigin).toBe(600)
    const [q] = toCdnSeries([row({ bandwidth_cached: 2000 })])
    expect(q.bandwidthOrigin).toBe(0)
  })

  it('a zero-request day has NO hit rate — null, never a fabricated 0%', () => {
    const [p] = toCdnSeries([row({ requests_served: 0, requests_cached: 0 })])
    expect(p.hitRate).toBeNull()
  })

  it('a day with no origin measurement has null latency, not 0 ms', () => {
    const [p] = toCdnSeries([row({ origin_response_time_avg: 0 })])
    expect(p.originMs).toBeNull()
  })

  it('parses the date as a UTC day', () => {
    const [p] = toCdnSeries([row({ date: '2026-08-10' })])
    expect(p.date.getUTCDate()).toBe(10)
    expect(p.date.getUTCHours()).toBe(0)
  })
})

describe('statusMix', () => {
  it('derives 2xx as the remainder and never goes negative', () => {
    const mix = statusMix(toCdnSeries([row(), row({ date: '2026-08-11' })]))
    expect(mix.total).toBe(200)
    expect(mix.c3xx).toBe(10)
    expect(mix.c4xx).toBe(6)
    expect(mix.c5xx).toBe(2)
    expect(mix.c2xx).toBe(182)

    const weird = statusMix(toCdnSeries([row({ requests_served: 2, error_3xx: 5, error_4xx: 3, error_5xx: 1 })]))
    expect(weird.c2xx).toBe(0)
  })
})

describe('formatters', () => {
  it('renders absent values as em dashes, never zeros', () => {
    expect(fmtHitRate(null)).toBe('—')
    expect(fmtOriginMs(null)).toBe('—')
  })
  it('formats bytes with one decimal above bytes', () => {
    expect(fmtBytes(0)).toBe('0 B')
    expect(fmtBytes(1024 ** 3 * 1.5)).toBe('1.5 GB')
  })
  it('is total for sub-1 positives (axis headroom on an all-zero strip)', () => {
    expect(fmtBytes(1.12e-9)).toBe('0 B')
    expect(fmtBytes(0.5)).toBe('0 B')
  })
  it('labels days in UTC regardless of local timezone', () => {
    const [p] = toCdnSeries([row({ date: '2026-08-01' })])
    expect(cdnDayLabel(p.date)).toBe('01/08')
  })
})

describe('CDN_PICKER_PRESETS', () => {
  it('is exclusive and anchors preset ends to the current UTC day', () => {
    expect(CDN_PICKER_PRESETS.exclusive).toBe(true)
    const todayUtc = new Date().toISOString().slice(0, 10)
    for (const preset of CDN_PICKER_PRESETS.presets) {
      expect(preset.resolve().end).toBe(todayUtc)
    }
  })
  it('offers no Today/24h shortcut — the source is daily-granular', () => {
    const keys = CDN_PICKER_PRESETS.presets.map((p) => p.key)
    expect(keys).not.toContain('today')
    expect(keys).not.toContain('24h')
    expect(keys).not.toContain('1h')
  })
})

describe('deriveLiveCard', () => {
  const hour = (requests: number, cached = 0): import('@/lib/api/bunny').BunnyLiveHour => ({
    hour: '2026-08-14T05:00:00Z',
    bandwidth: 0,
    bandwidth_cached: 0,
    requests,
    requests_cached: cached,
    error_3xx: 0,
    error_4xx: 0,
    error_5xx: 0,
    origin_response_ms: null,
  })
  const base = {
    in_progress: null,
    range: { start: '2026-08-13T06:00:00Z', end: '2026-08-14T06:00:00Z' },
  }

  it('returns null while data is absent — the card ghosts, never zeros', () => {
    expect(deriveLiveCard(undefined)).toBeNull()
  })

  it('returns null for an empty hours array (upstream anomaly shape)', () => {
    expect(
      deriveLiveCard({ ...base, hours: [], totals: { requests: 0, requests_cached: 0, bandwidth: 0, bandwidth_cached: 0, error_4xx: 0, error_5xx: 0 } })
    ).toBeNull()
  })

  it('derives rails from totals and bars from the complete hours only', () => {
    const model = deriveLiveCard({
      ...base,
      hours: [hour(100), hour(300)],
      totals: { requests: 400, requests_cached: 300, bandwidth: 9, bandwidth_cached: 8, error_4xx: 5, error_5xx: 2 },
    })
    expect(model).toEqual({ requests: 400, hitRate: 75, errors: 7, bars: [100, 300] })
  })

  it('hitRate is null when the window served no requests — em dash, not 0%', () => {
    const model = deriveLiveCard({
      ...base,
      hours: [hour(0)],
      totals: { requests: 0, requests_cached: 0, bandwidth: 0, bandwidth_cached: 0, error_4xx: 0, error_5xx: 0 },
    })
    expect(model?.hitRate).toBeNull()
    expect(model?.requests).toBe(0)
  })
})
