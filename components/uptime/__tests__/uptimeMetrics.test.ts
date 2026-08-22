import { describe, it, expect } from 'vitest'
import {
  humanizeCause,
  parseUptimeMetrics,
  serializeUptimeMetrics,
  toUptimeSeries,
  seriesUptimePct,
  seriesSpansMultipleDays,
  incidentDurationSeconds,
  clippedDurationSeconds,
  totalDowntimeSeconds,
  presetUtcRange,
  rangeWindowMs,
  fmtMs,
  fmtUptimePct,
  fmtDurationSeconds,
  fmtCheckTime,
  bucketLabel,
  presetZoneRange,
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

  it('parses naive bucket timestamps as UTC instants', () => {
    const [p] = toUptimeSeries([bucket({ bucket_start: '2026-08-10T08:00:00' })])
    expect(p.date.toISOString()).toBe('2026-08-10T08:00:00.000Z')
    expect(bucketLabel(p.date, 'hour', 'UTC')).toBe('08:00')
    expect(bucketLabel(p.date, 'day', 'UTC')).toBe('10/08')
  })
})

describe('incident math', () => {
  const closed: UptimeIncident = {
    id: 'a', monitor_id: 'm', status: 'down',
    started_at: '2026-07-27T09:20:00Z', ended_at: '2026-07-27T09:52:00Z',
    first_error_message: null, first_status_code: null, failed_checks: 6,
  }
  const now = new Date('2026-07-27T10:00:00Z').getTime()

  it('computes closed durations from the episode, ongoing from now', () => {
    expect(incidentDurationSeconds(closed)).toBe(32 * 60)
    const ongoing = { ...closed, id: 'b', ended_at: null }
    expect(incidentDurationSeconds(ongoing, now)).toBe(40 * 60)
  })

  it('clips range downtime to the window — an old long outage cannot charge a short range more time than it contains', () => {
    const wideStart = Date.parse('2026-07-20T00:00:00Z')
    const wideEnd = Date.parse('2026-07-28T00:00:00Z')
    expect(totalDowntimeSeconds([closed], wideStart, wideEnd, now)).toBe(32 * 60)

    // * Window opens mid-episode: only the overlap counts.
    const midStart = Date.parse('2026-07-27T09:30:00Z')
    expect(clippedDurationSeconds(closed, midStart, wideEnd, now)).toBe(22 * 60)

    // * Episode entirely before the window: zero, never negative.
    const lateStart = Date.parse('2026-07-27T09:55:00Z')
    expect(clippedDurationSeconds(closed, lateStart, wideEnd, now)).toBe(0)

    // * Ongoing episode clips at the window end (= now for a live range).
    const ongoing = { ...closed, id: 'b', ended_at: null }
    expect(clippedDurationSeconds(ongoing, midStart, now, now)).toBe(30 * 60)
  })

  it('derives the range window from SITE-day strings, capped at now', () => {
    const { startMs, endMs } = rangeWindowMs({ start: '2026-07-26', end: '2026-07-27' }, 'UTC', now)
    expect(startMs).toBe(Date.parse('2026-07-26T00:00:00Z'))
    expect(endMs).toBe(now) // 27 Jul 24:00Z is in the future at 10:00Z
  })

  it("the window opens at the SITE's midnight, not UTC's — the 22-08 conversion", () => {
    // Brussels midnight of 26 Jul is 22:00Z on the 25th; a UTC-window clip
    // would charge the range two extra hours of a midnight-straddling outage.
    const { startMs } = rangeWindowMs({ start: '2026-07-26', end: '2026-07-27' }, 'Europe/Brussels', now)
    expect(startMs).toBe(Date.parse('2026-07-25T22:00:00Z'))
  })
})

describe('presetUtcRange', () => {
  it('re-anchors a preset window to the CURRENT UTC day, keeping its length', () => {
    // * 21:00 New York on 12 Aug = 01:00 UTC on 13 Aug: local strings say
    // * 14 Jul – 12 Aug; the UTC-anchored range must end on the 13th.
    const nowUtc = new Date('2026-08-13T01:00:00Z')
    const local30d = { start: '2026-07-14', end: '2026-08-12' }
    expect(presetUtcRange(local30d, nowUtc)).toEqual({ start: '2026-07-15', end: '2026-08-13' })
  })
  it('is a no-op when local and UTC agree on today', () => {
    const nowUtc = new Date('2026-08-13T12:00:00Z')
    expect(presetUtcRange({ start: '2026-08-07', end: '2026-08-13' }, nowUtc))
      .toEqual({ start: '2026-08-07', end: '2026-08-13' })
  })
})

describe('presetZoneRange', () => {
  it("re-anchors a preset window to the SITE's current day, keeping its length", () => {
    // 22:30Z on 12 Aug is already 13 Aug in Brussels: the site's "last 30
    // days" must end on the 13th even though UTC (and the viewer) say the
    // 12th.
    const now = new Date('2026-08-12T22:30:00Z')
    const local30d = { start: '2026-07-13', end: '2026-08-12' }
    expect(presetZoneRange(local30d, 'Europe/Brussels', now)).toEqual({ start: '2026-07-14', end: '2026-08-13' })
  })
  it('is a no-op when the anchor already agrees', () => {
    const now = new Date('2026-08-13T12:00:00Z')
    expect(presetZoneRange({ start: '2026-08-07', end: '2026-08-13' }, 'UTC', now))
      .toEqual({ start: '2026-08-07', end: '2026-08-13' })
  })
})

describe('humanizeCause', () => {
  it('maps the real failure modes to human copy', () => {
    expect(humanizeCause('request failed: Get "https://x": context deadline exceeded', null, 30)).toBe('Timed out after 30 s')
    expect(humanizeCause('request failed: context deadline exceeded', null, undefined)).toBe('Timed out')
    expect(humanizeCause('request failed: dial tcp: connection refused', null, 30)).toBe('Connection refused')
    expect(humanizeCause('request failed: dial tcp: lookup x: no such host', null, 30)).toBe('DNS lookup failed')
    expect(humanizeCause('request failed: x509: certificate has expired', null, 30)).toBe('TLS handshake failed')
    expect(humanizeCause('slow response: 6000ms', null, 30)).toBe('Slow response (6.00 s)')
    expect(humanizeCause('unexpected status code: 502 (expected 200)', 502, 30)).toBe('Status 502 (expected 200)')
  })
  it('falls back honestly', () => {
    expect(humanizeCause('something novel went wrong', null, 30)).toBe('something novel went wrong')
    expect(humanizeCause(null, 503, 30)).toBe('Status 503')
    expect(humanizeCause(null, null, 30)).toBeNull()
  })
})

describe('formatters', () => {
  it('formats ms with the s breakpoint and honest uptime percentages', () => {
    expect(fmtMs(47)).toBe('47 ms')
    expect(fmtMs(30001)).toBe('30.00 s')
    expect(fmtUptimePct(100)).toBe('100%')
    expect(fmtUptimePct(97.694)).toBe('97.69%')
    // * FLOORS: a range with real failures must never present as 100%.
    expect(fmtUptimePct(99.9996)).toBe('99.99%')
  })
  it("labels buckets and check times in the SITE's zone — never the viewer's", () => {
    // The suite runs under TZ=UTC, so the Brussels expectations passing
    // proves the formatters follow the site.
    const d = new Date('2026-08-10T14:00:00Z')
    expect(bucketLabel(d, 'hour', 'UTC')).toBe('14:00')
    expect(bucketLabel(d, 'hour', 'Europe/Brussels')).toBe('16:00')
    expect(bucketLabel(d, 'hour', 'Europe/Brussels', true)).toBe('10/08 16:00')
    expect(fmtCheckTime('2026-08-13T12:43:18Z', 'UTC')).toBe('13/08 12:43')
    expect(fmtCheckTime('2026-08-13T12:43:18Z', 'Europe/Brussels')).toBe('13/08 14:43')
  })

  it('day-span detection follows the site calendar — the discriminating case', () => {
    // 22:00Z on the 10th and 02:00Z on the 11th are TWO UTC days but ONE
    // Brussels day (00:00 and 04:00 CEST on the 11th) — so the hourly axis
    // needs day labels for a UTC site and must not for a Brussels one.
    const series = toUptimeSeries([
      bucket({ bucket_start: '2026-08-10T22:00:00Z' }),
      bucket({ bucket_start: '2026-08-11T02:00:00Z' }),
    ])
    expect(seriesSpansMultipleDays(series, 'UTC')).toBe(true)
    expect(seriesSpansMultipleDays(series, 'Europe/Brussels')).toBe(false)
  })
  it('formats durations across the s/m/h breakpoints', () => {
    expect(fmtDurationSeconds(45)).toBe('45 s')
    expect(fmtDurationSeconds(32 * 60)).toBe('32 m')
    expect(fmtDurationSeconds(3 * 3600 + 5 * 60)).toBe('3 h 05 m')
  })
})
