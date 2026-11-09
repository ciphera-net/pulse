import { describe, it, expect } from 'vitest'
import type { PriceCatalog } from '@/lib/api/billing'
import {
  formatPlanName,
  FREE_EVENT_LIMIT,
  PLAN_CATALOG,
  getPeriodPriceCents,
  getPlanPricing,
  getSitesLimitForPlan,
  getMaxRetentionMonthsForPlan,
  getRetentionOptionsForPlan,
  eventMeterView,
  formatEventTier,
} from '@/lib/plans'

// Two tiers of the catalog as GET /api/billing/catalog sends them (list A+, 07-11-2026): prices with VAT, the business
// price without, and the yearly prices as the server's own figures.
const CATALOG: PriceCatalog = {
  currency: 'EUR',
  vat_rate: 21,
  yearly_months: 10,
  plans: {
    business: [
      { limit: 10000, month: { price: 900, business_price: 744 }, year: { price: 9000, business_price: 7438 } },
      { limit: 10000000, month: { price: 24900, business_price: 20579 }, year: { price: 249000, business_price: 205785 } },
    ],
  },
}

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

describe('FREE_EVENT_LIMIT', () => {
  it('is the free-tier monthly allowance (10,000 events since 07-11-2026) and formats with separators', () => {
    expect(FREE_EVENT_LIMIT).toBe(10000)
    expect(FREE_EVENT_LIMIT.toLocaleString('en-US')).toBe('10,000')
  })
})

describe('getPlanPricing (the catalog, 07-11-2026)', () => {
  it('reads every price from the catalog, the yearly ones included', () => {
    expect(getPlanPricing(CATALOG, 'business', 10000)).toEqual({
      monthly: 9,
      monthlyBusiness: 7.44,
      yearlyTotal: 90,
      // The server's figure: €90 a year is €74.38 without VAT, never 10 × €7.44 = €74.40.
      yearlyBusiness: 74.38,
      effectiveMonthly: 7.5,
    })
    expect(getPlanPricing(CATALOG, 'business', 10000000)).toMatchObject({ monthly: 249, yearlyTotal: 2490, yearlyBusiness: 2057.85 })
  })

  it('is null for a tier, a plan or a catalog it does not have', () => {
    expect(getPlanPricing(CATALOG, 'business', 12345)).toBeNull()
    expect(getPlanPricing(CATALOG, 'team', 10000)).toBeNull()
    expect(getPlanPricing(undefined, 'business', 10000)).toBeNull()
  })
})

describe('getPeriodPriceCents', () => {
  it('is one billing period with VAT, the year as the server prices it', () => {
    expect(getPeriodPriceCents(CATALOG, 'business', 10000, 'month')).toBe(900)
    expect(getPeriodPriceCents(CATALOG, 'business', 10000, 'year')).toBe(9000)
    expect(getPeriodPriceCents(CATALOG, 'business', 50000, 'month')).toBeNull()
    expect(getPeriodPriceCents(undefined, 'business', 10000, 'year')).toBeNull()
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

describe('formatEventTier (plan sizes as the pricing page names them)', () => {
  it('uses the tier labels, and the same form for a size that is no tier', () => {
    expect(formatEventTier(50000)).toBe('50k')
    expect(formatEventTier(2500000)).toBe('2.5M')
    expect(formatEventTier(100000)).toBe('100k')
    expect(formatEventTier(20000000)).toBe('20M')
    expect(formatEventTier(75000)).toBe('75k')
    expect(formatEventTier(12500)).toBe('12.5k')
    expect(formatEventTier(900)).toBe('900')
  })
})

describe('eventMeterView (the sidebar events card, 09-11-2026)', () => {
  const meter = (usage: number | null, ceiling: number | null = 100000) => ({ limit: 50000, usage, ceiling })

  it('says the count, the plan in its tier form and the share', () => {
    expect(eventMeterView(meter(31200))).toEqual({
      progress: 62.4,
      share: '62%',
      level: 'normal',
      line: '31,200 of 50k this month',
      label: 'Events this month: 31,200 of 50k (62%)',
    })
  })

  it('shows "<1%" once anything is counted, and 0% for nothing yet', () => {
    expect(eventMeterView(meter(41))).toMatchObject({ share: '<1%', level: 'normal', line: '41 of 50k this month' })
    expect(eventMeterView(meter(0))).toMatchObject({ share: '0%', progress: 0, level: 'normal' })
  })

  it('turns high from 80% of the plan as shown, so "80%" is never grey', () => {
    expect(eventMeterView(meter(39700))?.level).toBe('normal') // 79%
    expect(eventMeterView(meter(39800))).toMatchObject({ share: '80%', level: 'high' }) // 79.6% shows as 80%
    expect(eventMeterView(meter(43600))).toMatchObject({ share: '87%', level: 'high' })
  })

  it('stays high over the plan, with the ring full and the share past 100%', () => {
    expect(eventMeterView(meter(52340))).toMatchObject({ share: '105%', level: 'high', progress: 100, line: '52,340 of 50k this month' })
  })

  it('says Pulse stopped counting at the ceiling', () => {
    const view = eventMeterView(meter(100000))
    expect(view).toMatchObject({ share: '200%', level: 'stopped', progress: 100, line: 'Pulse stopped counting at 100k' })
    expect(view?.label).toBe('Pulse stopped counting at 100k')
  })

  it('never calls a month stopped without a ceiling from the server', () => {
    expect(eventMeterView(meter(150000, null))?.level).toBe('high')
  })

  it('shows nothing when there is no count or no plan limit (unknown is never 0)', () => {
    expect(eventMeterView(meter(null))).toBeNull()
    expect(eventMeterView({ limit: 0, usage: 10, ceiling: null })).toBeNull()
  })
})
