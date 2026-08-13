import { describe, it, expect } from 'vitest'
import {
  parseUptimeMetrics,
  serializeUptimeMetrics,
  toUptimeSeries,
  seriesUptimePct,
  incidentDurationSeconds,
  totalDowntimeSeconds,
  fmtMs,
  fmtUptimePct,
  fmtDurationSeconds,
  bucketLabelUTC,
  UPTIME_DEFAULT_ACTIVE,
} from '../uptimeMetrics'
import type { UptimeIncident, UptimeResponseTimeBucket } from '@/lib/api/uptime'

describe('?m= grammar', () => {
  it('defaults on null/empty/garbage and stays out of the URL for the default set', () => {
    expect(parseUptimeMetrics(null)).toEqual(UPTIME_DEFAULT_ACTIVE)
    expect(parseUptimeMetrics('nonsense,also-bad')).toEqual(UPTIME_DEFAULT_ACTIVE)
    expect(serializeUptimeMetrics([...UPTIME_DEFAULT_ACTIVE])).toBeNull()
  })

  it('orders keys canonically regardless of input order', () => {
    expect(parseUptimeMetrics('checks,availability')).toEqual(['availability', 'checks'])
    expect(serializeUptimeMetrics(['checks', 'availability'])).toBe('availability,checks')
  })
})

const bucket = (over: Partial<UptimeResponseTimeBucket>): UptimeResponseTimeBucket => ({
  bucket_start: '2026-08-10T08:00:00Z',
  samples: 12,
  avg_response_time_ms: 50,
  p50_response_time_ms: 45,
  p95_response_time_ms: 120,
  min_response_time_ms: 10,
  max_response_time_ms: 400,
  failed_checks: 0,
  degraded_checks: 0,
  ...over,
})

describe('series math', () => {
  it('derives up counts and range availability with degraded counting AGAINST availability', () => {
    const series = toUptimeSeries([
      bucket({ samples: 10, failed_checks: 0, degraded_checks: 0 }),
      bucket({ bucket_start: '2026-08-10T09:00:00Z', samples: 10, failed_checks: 2, degraded_checks: 1 }),
    ])
    expect(series[1].up).toBe(7)
    // * 17 up / 20 total — matches the server's uptime_percentage semantics
    // * (successful = 'up' only; degraded is not success).
    expect(seriesUptimePct(series)).toBeCloseTo(85.0, 9)
  })

  it('returns null availability for an empty range instead of fabricating 100', () => {
    expect(seriesUptimePct([])).toBeNull()
    expect(seriesUptimePct(toUptimeSeries([bucket({ samples: 0 })]))).toBeNull()
  })

  it('parses naive bucket timestamps as UTC', () => {
    const [p] = toUptimeSeries([bucket({ bucket_start: '2026-08-10T08:00:00' })])
    expect(p.date.toISOString()).toBe('2026-08-10T08:00:00.000Z')
    expect(bucketLabelUTC(p.date, 'hour')).toBe('08:00')
    expect(bucketLabelUTC(p.date, 'day')).toBe('10/08')
  })
})

describe('incident math', () => {
  const closed: UptimeIncident = {
    id: 'a', monitor_id: 'm', status: 'down',
    started_at: '2026-07-27T09:20:00Z', ended_at: '2026-07-27T09:52:00Z',
    first_error_message: null, first_status_code: null, failed_checks: 6,
  }
  it('computes closed durations from the episode, ongoing from now', () => {
    expect(incidentDurationSeconds(closed)).toBe(32 * 60)
    const ongoing = { ...closed, id: 'b', ended_at: null }
    const now = new Date('2026-07-27T10:00:00Z').getTime()
    expect(incidentDurationSeconds(ongoing, now)).toBe(40 * 60)
    expect(totalDowntimeSeconds([closed, ongoing], now)).toBe(72 * 60)
  })
})

describe('formatters', () => {
  it('formats ms with the s breakpoint and honest uptime percentages', () => {
    expect(fmtMs(47)).toBe('47 ms')
    expect(fmtMs(30001)).toBe('30.00 s')
    expect(fmtUptimePct(100)).toBe('100%')
    expect(fmtUptimePct(97.694)).toBe('97.69%')
  })
  it('formats durations across the s/m/h breakpoints', () => {
    expect(fmtDurationSeconds(45)).toBe('45 s')
    expect(fmtDurationSeconds(32 * 60)).toBe('32 m')
    expect(fmtDurationSeconds(3 * 3600 + 5 * 60)).toBe('3 h 05 m')
  })
})
