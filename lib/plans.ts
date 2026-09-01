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
  // Grant-only tier: the generic capitalize fallback would render "Opensource".
  if (planId === 'opensource') return 'Open Source'
  return planId.charAt(0).toUpperCase() + planId.slice(1)
}

/** Sites limit per plan. */
export function getSitesLimitForPlan(planId: string | null | undefined): number | null {
  if (!planId || planId === 'free') return 1
  switch (planId) {
    case 'solo': return 1
    case 'pioneer': return 3
    case 'team': case 'opensource': return 5
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

/**
 * The free (Hobby) tier's card, kept beside PLAN_CATALOG so the marketing
 * pricing page renders every tier from this module. Not part of PLAN_CATALOG
 * because the in-app pickers (/setup/plan, /switch) only offer paid plans.
 */
// Plans differ on SCALE, never on features: every plan runs the full product,
// and the only real dimensions are sites, pageviews and data retention (the
// enforced limits below) plus Business's priority-support commitment. Do not
// reintroduce feature-gate lines here — there are no feature gates.
export const FREE_PLAN: PlanCatalogEntry = {
  id: 'free',
  name: 'Hobby',
  description: 'For side projects and exploration',
  highlights: [
    '1 site',
    `${FREE_PAGEVIEW_LIMIT.toLocaleString('en-US')} pageviews/mo`,
    '6-month data retention',
    'Every feature included',
  ],
}

// Retention highlights mirror getMaxRetentionMonthsForPlan below. Keep in sync.
export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    id: PLAN_ID_SOLO,
    name: 'Solo',
    description: 'For personal sites and freelancers',
    highlights: ['1 site', 'Your pageview tier', '1-year data retention', 'Every feature included'],
  },
  {
    id: PLAN_ID_TEAM,
    name: 'Team',
    description: 'For startups and growing agencies',
    popular: true,
    highlights: [
      'Up to 5 sites',
      'Your pageview tier',
      '2-year data retention',
      'Every feature included',
    ],
  },
  {
    id: PLAN_ID_BUSINESS,
    name: 'Business',
    description: 'For larger organizations',
    highlights: [
      'Up to 10 sites',
      'Your pageview tier',
      '3-year data retention',
      'Priority support',
      'Every feature included',
    ],
  },
]

/* ── Plan feature matrix ─────────────────────────────────────────────────
 * The detailed plan-comparison table on /pricing. Sites and retention are
 * derived from the enforced limits above; the remaining rows are the same
 * packaging PLAN_CATALOG sells. One structure, so the cards, the table and
 * any future enforcement can never drift apart.
 */

/** String renders as text, boolean as included/not; the object form renders
 *  the text in the primary accent (used for slider-linked "selected" cells). */
export type PlanFeatureValue = string | boolean | { text: string; accent: true }

export interface PlanFeatureRow {
  label: string
  /** Value per plan id — string renders as text, boolean as included/not. */
  values: Record<string, PlanFeatureValue>
}

export interface PlanFeatureGroup {
  label: string
  rows: PlanFeatureRow[]
}

const MATRIX_PLAN_IDS = ['free', PLAN_ID_SOLO, PLAN_ID_TEAM, PLAN_ID_BUSINESS] as const

function acrossPlans(value: PlanFeatureValue): Record<string, PlanFeatureValue> {
  return Object.fromEntries(MATRIX_PLAN_IDS.map((id) => [id, value]))
}

function fromPlan(firstPlanWithIt: string): Record<string, PlanFeatureValue> {
  const start = MATRIX_PLAN_IDS.indexOf(firstPlanWithIt as (typeof MATRIX_PLAN_IDS)[number])
  return Object.fromEntries(MATRIX_PLAN_IDS.map((id, i) => [id, i >= start]))
}

export const PLAN_FEATURE_MATRIX: PlanFeatureGroup[] = [
  {
    label: 'Usage',
    rows: [
      // The pricing page injects a "Monthly pageviews" row after Sites — its
      // paid-plan cells read the live tier slider, so it can't be static here.
      {
        label: 'Sites',
        values: { free: '1', solo: '1', team: 'Up to 5', business: 'Up to 10' },
      },
      {
        label: 'Data retention',
        values: Object.fromEntries(
          MATRIX_PLAN_IDS.map((id) => [id, formatRetentionMonths(getMaxRetentionMonthsForPlan(id))]),
        ),
      },
    ],
  },
  {
    label: 'Support',
    rows: [{ label: 'Priority support', values: fromPlan(PLAN_ID_BUSINESS) }],
  },
  // Deliberately the longest group: there are no feature gates, and this wall
  // of identical checks is the claim. Plans scale (Usage above) — the product
  // never shrinks.
  {
    label: 'Included in every plan',
    rows: [
      { label: 'Custom events', values: acrossPlans(true) },
      { label: 'Funnels & journeys', values: acrossPlans(true) },
      { label: 'Uptime monitoring', values: acrossPlans(true) },
      { label: 'Team dashboard', values: acrossPlans(true) },
      { label: 'Shared dashboard links', values: acrossPlans(true) },
      { label: 'API access', values: acrossPlans(true) },
      { label: 'Data export (CSV, JSON, Excel)', values: acrossPlans(true) },
      { label: 'Cookie-free tracking', values: acrossPlans(true) },
      { label: 'GDPR compliant', values: acrossPlans(true) },
      { label: 'Swiss infrastructure', values: acrossPlans(true) },
      { label: '100% data ownership', values: acrossPlans(true) },
    ],
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
    case 'team': case 'pioneer': case 'opensource': return 24
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
    case 'team': case 'pioneer': case 'opensource': return team
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

