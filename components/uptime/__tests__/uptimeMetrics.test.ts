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
  rangeWindowMs,
  fmtMs,
  fmtUptimePct,
  fmtDurationSeconds,
  fmtCheckTime,
  bucketLabel,
  bucketState,
  bucketFill,
  isOutage,
  refusesTheMonitor,
  UPTIME_DEFAULT_ACTIVE,
  UPTIME_NEG,
  UPTIME_POS,
  UPTIME_UNSEEN,
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
  // The rule of 23-11-2026: availability is the checks that found the site up over the checks that found it up or
  // down. MUST FAIL ON: dividing by every check again (a bot check or a slow answer of before would count against).
  it('counts only what a check learned: up over up plus down', () => {
    const series = toUptimeSeries([
      bucket({ samples: 10, failed_checks: 0, degraded_checks: 0 }),
      bucket({ bucket_start: '2026-08-10T09:00:00Z', samples: 10, failed_checks: 2, degraded_checks: 1, inconclusive_checks: 3 }),
    ])
    expect(series[1].up).toBe(4)
    expect(series[1].unseen).toBe(3)
    // 14 up of the 16 checks that saw the site: 87.5. By the old rule (up over all 20) it read 70.
    expect(seriesUptimePct(series)).toBeCloseTo(87.5, 9)
  })

  it('reads the day of 23-11-2026 as it was: five hours of bot checks beside a healthy site is 100%', () => {
    const day = toUptimeSeries([bucket({ samples: 185, inconclusive_checks: 62 })])
    expect(day[0].up).toBe(123)
    expect(seriesUptimePct(day)).toBe(100)
  })

  it('reads a server of before the rule, which sends no inconclusive count', () => {
    const [p] = toUptimeSeries([bucket({ samples: 10, failed_checks: 1 })])
    expect(p.unseen).toBe(0)
    expect(p.up).toBe(9)
  })

  it('returns null availability for an empty range instead of fabricating 100', () => {
    expect(seriesUptimePct([])).toBeNull()
    expect(seriesUptimePct(toUptimeSeries([bucket({ samples: 0 })]))).toBeNull()
  })

  it('returns null, never 100, for a range in which no check saw the site', () => {
    expect(seriesUptimePct(toUptimeSeries([bucket({ samples: 12, inconclusive_checks: 12 })]))).toBeNull()
  })

  // MUST FAIL ON: an outage hidden by a majority of anything; a slow answer colouring a day; a day the monitor
  // mostly could not see drawn green.
  it('gives every bar one state: an outage first, then the larger of seen and could not check', () => {
    const state = (over: Partial<UptimeResponseTimeBucket>) => bucketState(toUptimeSeries([bucket(over)])[0])
    expect(state({ samples: 0 })).toBe('none')
    expect(state({ samples: 12 })).toBe('up')
    expect(state({ samples: 12, failed_checks: 1, inconclusive_checks: 11 })).toBe('down')
    expect(state({ samples: 12, inconclusive_checks: 12 })).toBe('unseen')
    expect(state({ samples: 12, inconclusive_checks: 7 })).toBe('unseen')
    expect(state({ samples: 12, inconclusive_checks: 6 })).toBe('up') // a tie is not "mostly"
    expect(state({ samples: 12, degraded_checks: 12 })).toBe('up') // slow answers of before the rule: the site answered
    expect(bucketFill('down')).toBe(UPTIME_NEG)
    expect(bucketFill('up')).toBe(UPTIME_POS)
    expect(bucketFill('unseen')).toBe(UPTIME_UNSEEN)
    expect(bucketFill('none')).toBe('var(--chart-grid)')
  })

  it('parses naive bucket timestamps as UTC instants', () => {
    const [p] = toUptimeSeries([bucket({ bucket_start: '2026-08-10T08:00:00' })])
    expect(p.date.toISOString()).toBe('2026-08-10T08:00:00.000Z')
    expect(bucketLabel(p.date, 'hour', 'UTC')).toBe('08:00')
    expect(bucketLabel(p.date, 'day', 'UTC')).toBe('10/08')
  })

  it('parses OFFSET-carrying bucket timestamps without corrupting them', () => {
    // 🔴 MEASURED ON PROD 22-08-2026: the site-tz hourly buckets serialize
    // with the site's offset ("+02:00"); the naive-string shim appended 'Z'
    // to them, minting "…+02:00Z" — an Invalid Date whose first Intl format
    // threw RangeError and took the whole 7d uptime view to its error
    // boundary. A zone-carrying string must parse AS-IS.
    const [p] = toUptimeSeries([bucket({ bucket_start: '2026-08-22T03:00:00+02:00' })])
    expect(p.date.toISOString()).toBe('2026-08-22T01:00:00.000Z')
    const [z] = toUptimeSeries([bucket({ bucket_start: '2026-08-22T03:00:00Z' })])
    expect(z.date.toISOString()).toBe('2026-08-22T03:00:00.000Z')
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

  // MUST FAIL ON: time the monitor could not see the site, or a slow stretch of before the rule, charged as downtime.
  it('charges the range only for outages', () => {
    const wideStart = Date.parse('2026-07-20T00:00:00Z')
    const wideEnd = Date.parse('2026-07-28T00:00:00Z')
    const unseen: UptimeIncident = { ...closed, id: 'u', status: 'inconclusive', started_at: '2026-07-26T09:42:00Z', ended_at: '2026-07-26T15:07:00Z' }
    const slow: UptimeIncident = { ...closed, id: 's', status: 'degraded', started_at: '2026-07-25T09:00:00Z', ended_at: '2026-07-25T09:25:00Z' }
    expect(isOutage(closed)).toBe(true)
    expect(isOutage(unseen)).toBe(false)
    expect(isOutage(slow)).toBe(false)
    expect(totalDowntimeSeconds([closed, unseen, slow], wideStart, wideEnd, now)).toBe(32 * 60)
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



describe('humanizeCause', () => {
  it('maps the real failure modes to human copy', () => {
    expect(humanizeCause('request failed: Get "https://x": context deadline exceeded', null, 30)).toBe('Timed out after 30 s')
    expect(humanizeCause('request failed: context deadline exceeded', null, undefined)).toBe('Timed out')
    expect(humanizeCause('request failed: dial tcp: connection refused', null, 30)).toBe('Connection refused')
    expect(humanizeCause('request failed: dial tcp: lookup x: no such host', null, 30)).toBe('DNS lookup failed')
    expect(humanizeCause('request failed: x509: certificate has expired', null, 30)).toBe('TLS handshake failed')
    expect(humanizeCause('slow response: 6000ms', null, 30)).toBe('Slow response (6.00 s)')
    expect(humanizeCause('unexpected status code: 502 (expected 200)', 502, 30)).toBe('Status 502 (expected 200)')
    expect(humanizeCause('unexpected status code: 402 (expected 200)', 402, 30)).toBe('Status 402 (expected 200)')
  })
  // The checker's forms of 23-11-2026 (pulse-backend internal/uptime/classify.go). MUST FAIL ON: a form the page
  // shows verbatim, or a refusal worded as if the site were broken.
  it('words what kept the monitor from seeing the site', () => {
    expect(humanizeCause('bot check: cloudflare (status 403)', 403, 30)).toBe("Cloudflare's bot check answered")
    expect(humanizeCause('bot check: aws waf (status 202)', 202, 30)).toBe("AWS WAF's bot check answered")
    expect(humanizeCause('bot check: something new (status 403)', 403, 30)).toBe("A firewall's bot check answered")
    expect(humanizeCause('unexpected status code: 403 (expected 200)', 403, 30)).toBe('Refused our monitor (403)')
    expect(humanizeCause('unexpected status code: 401 (expected 200)', 401, 30)).toBe('Refused our monitor (401)')
    expect(humanizeCause('unexpected status code: 429 (expected 200)', 429, 30)).toBe('Rate-limited our monitor (429)')
    expect(humanizeCause(null, 429, 30)).toBe('Rate-limited our monitor (429)')
    expect(humanizeCause('redirect not followed: 301 to shop.elsewhere.test', 301, 30)).toBe('Redirects to shop.elsewhere.test')
    expect(humanizeCause('redirect not followed: 302', 302, 30)).toBe('Redirects to another address')
    expect(humanizeCause('too many redirects: 5 followed, then another 308', 308, 30)).toBe('Too many redirects')
    expect([401, 403, 407, 429].every((c) => refusesTheMonitor(c))).toBe(true)
    expect([200, 400, 402, 404, 410, 451, 500, 503, null, undefined].some((c) => refusesTheMonitor(c))).toBe(false)
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
