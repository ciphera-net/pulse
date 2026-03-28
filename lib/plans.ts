/**
 * Shared plan and traffic tier definitions for pricing and billing (Change plan).
 * Backend supports plan_id solo, team, business and limit 10k–10M; month/year interval.
 */

export const PLAN_ID_SOLO = 'solo'
export const PLAN_ID_TEAM = 'team'
export const PLAN_ID_BUSINESS = 'business'

/** Sites limit per plan. */
export function getSitesLimitForPlan(planId: string | null | undefined): number | null {
  if (!planId || planId === 'free') return 1
  switch (planId) {
    case 'solo': return 1
    case 'team': return 5
    case 'business': return 10
    default: return null
  }
}

/** Traffic tiers available for Solo plan (pageview limits). */
export const TRAFFIC_TIERS = [
  { label: '10k', value: 10000 },
  { label: '50k', value: 50000 },
  { label: '100k', value: 100000 },
  { label: '250k', value: 250000 },
  { label: '500k', value: 500000 },
  { label: '1M', value: 1000000 },
  { label: '2.5M', value: 2500000 },
  { label: '5M', value: 5000000 },
  { label: '10M', value: 10000000 },
] as const

export function getTierIndexForLimit(limit: number): number {
  const idx = TRAFFIC_TIERS.findIndex((t) => t.value === limit)
  return idx >= 0 ? idx : 0
}

export function getLimitForTierIndex(index: number): number {
  if (index < 0 || index >= TRAFFIC_TIERS.length) return 10000
  return TRAFFIC_TIERS[index].value
}

/** Maximum data retention (months) allowed per plan. */
export function getMaxRetentionMonthsForPlan(planId: string | null | undefined): number {
  switch (planId) {
    case 'business': return 36
    case 'team': return 24
    case 'solo': return 12
    default: return 6
  }
}

/** Selectable retention options (months) for the given plan. */
export function getRetentionOptionsForPlan(planId: string | null | undefined): { label: string; value: number }[] {
  const base = [
    { label: '1 month', value: 1 },
    { label: '3 months', value: 3 },
    { label: '6 months', value: 6 },
  ]
  const solo = [...base, { label: '1 year', value: 12 }]
  const team = [...solo, { label: '2 years', value: 24 }]
  const business = [...team, { label: '3 years', value: 36 }]

  switch (planId) {
    case 'business': return business
    case 'team': return team
    case 'solo': return solo
    default: return base
  }
}

/** Human-readable label for a retention value in months. */
export function formatRetentionMonths(months: number): string {
  if (months === 0) return 'Forever'
  if (months === 1) return '1 month'
  if (months < 12) return `${months} months`
  const years = months / 12
  if (Number.isInteger(years)) return years === 1 ? '1 year' : `${years} years`
  return `${months} months`
}

/**
 * Monthly prices in EUR cents per plan and traffic tier.
 * IMPORTANT: Must stay in sync with backend GetSubscriptionAmount() in internal/billing/mollie.go
 * Yearly = monthly * 11 (1 month free)
 */
export const PLAN_PRICES: Record<string, Record<number, number>> = {
  solo:     { 10000: 700, 50000: 1100, 100000: 1500, 250000: 2500, 500000: 3900, 1000000: 5500, 2500000: 7900, 5000000: 10300, 10000000: 13500 },
  team:     { 10000: 1100, 50000: 1900, 100000: 2300, 250000: 3900, 500000: 5900, 1000000: 7900, 2500000: 11900, 5000000: 15500, 10000000: 19900 },
  business: { 10000: 1500, 50000: 2700, 100000: 3100, 250000: 5900, 500000: 7900, 1000000: 11100, 2500000: 16900, 5000000: 20700, 10000000: 26900 },
}
