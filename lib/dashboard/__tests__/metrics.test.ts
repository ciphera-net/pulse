import { describe, it, expect } from 'vitest'
import { blockRowDisplay, isMetricType, metricHasShare, shareValue, RATE_BASE_GUARD } from '@/lib/dashboard/metrics'

describe('blockRowDisplay', () => {
  const row = { pageviews: 40, visitors: 16, bounce_rate: 43.4, avg_duration: 103 }

  it('displays the selected count verbatim', () => {
    expect(blockRowDisplay('visitors', row)).toEqual({ text: '16', muted: false })
    expect(blockRowDisplay('pageviews', row)).toEqual({ text: '40', muted: false })
  })

  it('derives pages/visit client-side and guards zero visitors', () => {
    expect(blockRowDisplay('pages_per_visit', row)).toEqual({ text: '2.5', muted: false })
    expect(blockRowDisplay('pages_per_visit', { pageviews: 4, visitors: 0 })).toEqual({ text: '—', muted: true })
  })

  it('renders rates, rounded, with their units', () => {
    expect(blockRowDisplay('bounce_rate', row)).toEqual({ text: '43%', muted: false })
    expect(blockRowDisplay('avg_duration', row).muted).toBe(false)
  })

  it('guards rates below the session base — em dash, never a number', () => {
    const tiny = { pageviews: 6, visitors: RATE_BASE_GUARD - 1, bounce_rate: 100, avg_duration: 3 }
    expect(blockRowDisplay('bounce_rate', tiny)).toEqual({ text: '—', muted: true })
    expect(blockRowDisplay('avg_duration', tiny)).toEqual({ text: '—', muted: true })
  })

  it('renders unmeasured (null/missing) rates as a muted em dash, never 0', () => {
    const un = { pageviews: 40, visitors: 30, bounce_rate: null, avg_duration: null }
    expect(blockRowDisplay('bounce_rate', un)).toEqual({ text: '—', muted: true })
    expect(blockRowDisplay('avg_duration', un)).toEqual({ text: '—', muted: true })
    // mid-deploy payloads without the fields behave the same
    expect(blockRowDisplay('bounce_rate', { pageviews: 40, visitors: 30 })).toEqual({ text: '—', muted: true })
  })
})

describe('share math', () => {
  it('percent-of-total applies to counts only', () => {
    expect(metricHasShare('visitors')).toBe(true)
    expect(metricHasShare('pageviews')).toBe(true)
    expect(metricHasShare('bounce_rate')).toBe(false)
    expect(metricHasShare('avg_duration')).toBe(false)
    expect(metricHasShare('pages_per_visit')).toBe(false)
  })

  it('bars scale by the selected count, or the ranking count under a rate', () => {
    const row = { pageviews: 40, visitors: 16 }
    expect(shareValue('visitors', row, 'pageviews')).toBe(16)
    expect(shareValue('pageviews', row, 'pageviews')).toBe(40)
    expect(shareValue('bounce_rate', row, 'pageviews')).toBe(40)
    expect(shareValue('bounce_rate', row, 'visitors')).toBe(16)
  })
})

describe('isMetricType (the ?metric= URL guard)', () => {
  it('accepts exactly the six rail keys', () => {
    for (const k of ['visitors', 'pageviews', 'pages_per_visit', 'bounce_rate', 'avg_duration', 'engagement']) {
      expect(isMetricType(k)).toBe(true)
    }
    expect(isMetricType('realtime')).toBe(false)
    expect(isMetricType('')).toBe(false)
    expect(isMetricType(null)).toBe(false)
  })
})
