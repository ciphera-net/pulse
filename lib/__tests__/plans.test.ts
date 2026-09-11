import { describe, it, expect } from 'vitest'
import {
  formatPlanName,
  FREE_PAGEVIEW_LIMIT,
  PLAN_CATALOG,
  getSitesLimitForPlan,
  getMaxRetentionMonthsForPlan,
  getRetentionOptionsForPlan,
} from '@/lib/plans'

describe('formatPlanName', () => {
  it('maps free/empty ids to Personal', () => {
    expect(formatPlanName('free')).toBe('Personal')
    expect(formatPlanName('')).toBe('Personal')
    expect(formatPlanName(null)).toBe('Personal')
    expect(formatPlanName(undefined)).toBe('Personal')
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

describe('PLAN_CATALOG (11-09-2026: one purchasable plan)', () => {
  it('has exactly one entry: business, marked popular', () => {
    expect(PLAN_CATALOG).toHaveLength(1)
    expect(PLAN_CATALOG[0].id).toBe('business')
    expect(PLAN_CATALOG[0].popular).toBe(true)
  })
})

describe('business plan limits (inherits the former team tier)', () => {
  it('gets 5 sites, 24 months max retention, and retention options topping out at 24', () => {
    expect(getSitesLimitForPlan('business')).toBe(5)
    expect(getMaxRetentionMonthsForPlan('business')).toBe(24)
    const options = getRetentionOptionsForPlan('business')
    expect(Math.max(...options.map((o) => o.value))).toBe(24)
  })

  it('resolves startups like team: 5 sites, 24 months max retention', () => {
    expect(getSitesLimitForPlan('startups')).toBe(5)
    expect(getMaxRetentionMonthsForPlan('startups')).toBe(24)
  })
})
