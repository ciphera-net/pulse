import { describe, it, expect } from 'vitest'
import { formatPlanName, FREE_PAGEVIEW_LIMIT } from '@/lib/plans'

describe('formatPlanName', () => {
  it('maps free/empty ids to Hobby', () => {
    expect(formatPlanName('free')).toBe('Hobby')
    expect(formatPlanName('')).toBe('Hobby')
    expect(formatPlanName(null)).toBe('Hobby')
    expect(formatPlanName(undefined)).toBe('Hobby')
  })

  it('maps legacy Stripe price_ ids to Pro', () => {
    expect(formatPlanName('price_1PabcXYZ')).toBe('Pro')
  })

  it('capitalizes plain plan ids', () => {
    expect(formatPlanName('solo')).toBe('Solo')
    expect(formatPlanName('team')).toBe('Team')
    expect(formatPlanName('business')).toBe('Business')
    expect(formatPlanName('pioneer')).toBe('Pioneer')
  })
})

describe('FREE_PAGEVIEW_LIMIT', () => {
  it('is the free-tier monthly allowance and formats with separators', () => {
    expect(FREE_PAGEVIEW_LIMIT).toBe(5000)
    expect(FREE_PAGEVIEW_LIMIT.toLocaleString('en-US')).toBe('5,000')
  })
})
