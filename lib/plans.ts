/**
 * Shared plan and traffic tier definitions for pricing and billing (Change plan).
 * Backend supports plan_id solo, team, business and limit 10k–10M; month/year interval.
 */

export interface PlanPrices {
  [planId: string]: {
    [limit: number]: number // monthly price in EUR cents
  }
}

export const PLAN_ID_SOLO = 'solo'
export const PLAN_ID_TEAM = 'team'
export const PLAN_ID_BUSINESS = 'business'

/**
 * Monthly pageview allowance on the free (Hobby) tier. Single source of truth
 * for the free-tier limit shown in downgrade/expiry copy — do not re-hardcode
 * "5,000" at call sites.
 */
export const FREE_PAGEVIEW_LIMIT = 5000

/**
 * Display name for a subscription plan_id — the single source of truth.
 * Ad-hoc ternaries drift (the Privacy tab once recognised only 'pro' and
 * labelled a Pioneer org "Free").
 *
 * plan_id shapes seen in the wild: 'free' (marketing name: Hobby), legacy
 * Stripe 'price_…' ids (Pro), and plain ids like 'solo' / 'team' / 'pioneer'.
 */
export function formatPlanName(planId?: string | null): string {
  if (!planId || planId === 'free') return 'Hobby'
  if (planId.startsWith('price_')) return 'Pro'
  return planId.charAt(0).toUpperCase() + planId.slice(1)
}

/** Sites limit per plan. */
export function getSitesLimitForPlan(planId: string | null | undefined): number | null {
  if (!planId || planId === 'free') return 1
  switch (planId) {
    case 'solo': return 1
    case 'pioneer': return 3
    case 'team': return 5
    case 'business': return 10
    default: return null
  }
}

/**
 * Marketing copy for the purchasable plans — the single source of truth for
 * every in-app plan picker (/setup/plan, /switch). Duplicated literals in the
 * two pages drifted against each other and against the marketing site before
 * this existed; add new highlights HERE, not at the call sites.
 */
export interface PlanCatalogEntry {
  id: string
  name: string
  description: string
  popular?: boolean
  highlights: string[]
}

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    id: PLAN_ID_SOLO,
    name: 'Solo',
    description: 'For personal sites',
    highlights: ['1 site', 'Custom events', 'Email reports'],
  },
  {
    id: PLAN_ID_TEAM,
    name: 'Team',
    description: 'For startups & agencies',
    popular: true,
    highlights: ['Up to 5 sites', 'Funnels & journeys', 'Team dashboard', 'API access'],
  },
  {
    id: PLAN_ID_BUSINESS,
    name: 'Business',
    description: 'For larger organizations',
    highlights: ['Up to 10 sites', 'Uptime monitoring', 'Priority support', 'Everything in Team'],
  },
]

export interface PlanPricing {
  /** Price per month on monthly billing, in EUR (excl. VAT). */
  monthly: number
  /** Effective per-month price on yearly billing (11 months paid / 12). */
  effectiveMonthly: number
  /** Total billed per year on yearly billing (11 × monthly — 1 month free). */
  yearlyTotal: number
}

/**
 * Derive display pricing for a plan at a pageview tier from the
 * GET /api/billing/prices map. Yearly = 11 × monthly (1 month free) — the
 * same formula the backend uses; keep the two in sync.
 */
export function getPlanPricing(
  prices: Record<string, Record<number, number>> | undefined,
  planId: string,
  limit: number,
): PlanPricing | null {
  const baseCents = prices?.[planId]?.[limit]
  if (!baseCents) return null
  const monthly = baseCents / 100
  const yearlyTotal = Math.round(monthly * 11 * 100) / 100
  const effectiveMonthly = Math.round((yearlyTotal / 12) * 100) / 100
  return { monthly, effectiveMonthly, yearlyTotal }
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
    case 'team': case 'pioneer': return 24
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
    case 'team': case 'pioneer': return team
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

