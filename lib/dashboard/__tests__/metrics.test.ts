import { describe, it, expect } from 'vitest'
import { isMetricType, METRIC_TYPES } from '@/lib/dashboard/metrics'
import { rowBarWidth } from '@/components/dashboard/MetricRowStat'

describe('isMetricType (the ?metric= URL guard)', () => {
  it('accepts exactly the five rail keys', () => {
    for (const k of ['visitors', 'pageviews', 'pages_per_visit', 'bounce_rate', 'avg_duration']) {
      expect(isMetricType(k)).toBe(true)
    }
    expect(METRIC_TYPES).toHaveLength(5)
  })

  it('rejects engagement — removed 01-09-2026; old shared links fall back to visitors', () => {
    expect(isMetricType('engagement')).toBe(false)
    expect(isMetricType('realtime')).toBe(false)
    expect(isMetricType('')).toBe(false)
    expect(isMetricType(null)).toBe(false)
  })
})

describe('rowBarWidth (bars follow visitors, the ranking field)', () => {
  const rows = [
    { pageviews: 134, visitors: 61 },
    { pageviews: 9, visitors: 3 },
  ]

  it('scales by visitors so bar order always matches row order', () => {
    expect(rowBarWidth(rows[0], rows)).toBe(75)
    expect(rowBarWidth(rows[1], rows)).toBeCloseTo((3 / 61) * 75)
  })

  it('returns 0 when no row carries visitors — never NaN', () => {
    const empty = [{ pageviews: 5 }, { pageviews: 2 }]
    expect(rowBarWidth(empty[0], empty)).toBe(0)
  })
})
