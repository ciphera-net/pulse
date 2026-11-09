/**
 * Shared plan and traffic tier definitions for pricing and billing (Change plan).
 * Two plans are sold since 11-09-2026: free (Personal) and business (Business).
 * business inherits the former team plan's entitlements (5 sites, 24 months). solo and
 * team are retired as purchasable but stay valid ids for existing rows; their constants
 * remain exported for the legacy switch arms below. limit 10k–10M; month/year interval.
 */

import type { PriceCatalog, SubscriptionDetails } from '@/lib/api/billing'

/** Retired 11-09-2026 — no longer sold, still valid ids on existing rows. */
export const PLAN_ID_SOLO = 'solo'
export const PLAN_ID_TEAM = 'team'
export const PLAN_ID_BUSINESS = 'business'

/**
 * Monthly event allowance on the free (Personal) tier: every event counts, not only pageviews (since 07-11-2026;
 * 5,000 pageviews before). Single source of truth for the free-tier limit shown in downgrade/expiry copy — do not
 * re-hardcode "10,000" at call sites.
 */
export const FREE_EVENT_LIMIT = 10000

/**
 * Display name for a subscription plan_id — the single source of truth.
 * Ad-hoc ternaries drift (the Privacy tab once recognised only 'pro' and
 * labelled a Pioneer org "Free").
 *
 * plan_id shapes seen in the wild: 'free' (marketing name: Personal), legacy
 * Stripe 'price_…' ids (Pro), and plain ids like 'solo' / 'team' / 'pioneer'.
 */
export function formatPlanName(planId?: string | null): string {
  if (!planId || planId === 'free') return 'Personal'
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
    // business inherits team's 5-site cap (11-09-2026). Each grant tier gets its
    // own arm so a future edit to one can't silently move the others.
    case 'business': return 5
    case 'team': return 5
    case 'opensource': return 5
    case 'startups': return 5
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
 * The free (Personal) tier's card, kept beside PLAN_CATALOG so the marketing
 * pricing page renders every tier from this module. Not part of PLAN_CATALOG
 * because the in-app pickers (/setup/plan, /switch) only offer paid plans.
 */
// Plans differ on SCALE, never on features: every plan runs the full product,
// and the only real dimensions are sites, events and data retention (the
// enforced limits below) plus Business's reply within one working day. Do not
// reintroduce feature-gate lines here — there are no feature gates.
export const FREE_PLAN: PlanCatalogEntry = {
  id: 'free',
  name: 'Personal',
  description: 'For personal sites and side projects',
  highlights: [
    '1 site',
    `${FREE_EVENT_LIMIT.toLocaleString('en-US')} events/mo`,
    '6-month data retention',
    'Every feature included',
  ],
}

// Retention highlights mirror getMaxRetentionMonthsForPlan below. Keep in sync.
// ONE purchasable plan since 11-09-2026. Solo and Team were retired (their ids
// stay valid for existing rows — see the switch arms above); Business inherits
// Team's numbers and Team's price column. `popular` is what the pricing page,
// /switch and /setup/plan render as the accent + "Recommended" (owner pick C,
// 11-09-2026): with one paid plan the word "popular" would be a claim.
export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    id: PLAN_ID_BUSINESS,
    name: 'Business',
    description: 'For larger organizations',
    popular: true,
    highlights: [
      'Up to 5 sites',
      'Your event tier',
      '2-year data retention',
      'Email replies within one working day',
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

const MATRIX_PLAN_IDS = ['free', PLAN_ID_BUSINESS] as const

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
      // The pricing page injects a "Monthly events" row after Sites — its
      // paid-plan cells read the live tier slider, so it can't be static here.
      {
        label: 'Sites',
        values: { free: '1', business: 'Up to 5' },
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
    rows: [{ label: 'A reply within one working day', values: fromPlan(PLAN_ID_BUSINESS) }],
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
      { label: 'Sets no cookies', values: acrossPlans(true) },
      { label: 'Swiss infrastructure', values: acrossPlans(true) },
      { label: '100% data ownership', values: acrossPlans(true) },
    ],
  },
]

export interface PlanPricing {
  /** Price per month on monthly billing, in EUR, VAT included. */
  monthly: number
  /** The monthly price without VAT (the business price). */
  monthlyBusiness: number
  /** Total billed per year on yearly billing, VAT included (ten months' price: two months free). */
  yearlyTotal: number
  /** The yearly price without VAT, the server's own figure (never 10 × monthlyBusiness: €90 a year is €74.38 without
   *  VAT, not €74.40). */
  yearlyBusiness: number
  /** yearlyTotal over twelve months, VAT included. */
  effectiveMonthly: number
}

/**
 * Display pricing for a plan at an event tier, read from GET /api/billing/catalog. Every number is the server's; the
 * one division here (a year's price over twelve months) only labels a price, it never sets one.
 */
export function getPlanPricing(catalog: PriceCatalog | undefined, planId: string, limit: number): PlanPricing | null {
  const tier = catalog?.plans?.[planId]?.find((t) => t.limit === limit)
  if (!tier || tier.month.price <= 0 || tier.year.price <= 0) return null
  return {
    monthly: tier.month.price / 100,
    monthlyBusiness: tier.month.business_price / 100,
    yearlyTotal: tier.year.price / 100,
    yearlyBusiness: tier.year.business_price / 100,
    effectiveMonthly: Math.round(tier.year.price / 12) / 100,
  }
}

export interface EventMeter {
  /** The plan's monthly events. */
  limit: number
  /** Events counted this month; null when the server sent no count (unknown, never 0). */
  usage: number | null
  /** Where counting stops; null when the server sent none (unknown, never 0, which would read as "already over"). */
  ceiling: number | null
}

/**
 * A subscription's meter, read under the event_* names first and under pageview_* from a backend from before
 * 07-11-2026: one place decides the fallback, so no screen reads one name and another screen the other. Kept here, not
 * beside the wire type, so a test that stands in for the API module keeps it.
 */
export function eventMeter(sub: SubscriptionDetails): EventMeter {
  const limit = typeof sub.event_limit === 'number' ? sub.event_limit : sub.pageview_limit
  const usage = typeof sub.event_usage === 'number' ? sub.event_usage : typeof sub.pageview_usage === 'number' ? sub.pageview_usage : null
  const rawCeiling = typeof sub.event_hard_ceiling === 'number' ? sub.event_hard_ceiling : sub.pageview_hard_ceiling
  const ceiling = typeof rawCeiling === 'number' && rawCeiling > 0 ? rawCeiling : null
  return { limit, usage, ceiling }
}

/** What one billing period of a plan costs in cents, VAT included, from the catalog; null when it is not sold. */
export function getPeriodPriceCents(catalog: PriceCatalog | undefined, planId: string, limit: number, interval: string): number | null {
  const tier = catalog?.plans?.[planId]?.find((t) => t.limit === limit)
  if (!tier) return null
  const cents = interval === 'year' ? tier.year.price : tier.month.price
  return cents > 0 ? cents : null
}

/** The nine event tiers the paid plan is priced at (owner ruling 11-09-2026: keep nine; events since 07-11-2026). */
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
  if (index < 0 || index >= TRAFFIC_TIERS.length) return TRAFFIC_TIERS[0].value
  return TRAFFIC_TIERS[index].value
}

/** An event count as the pricing page names plan sizes ("50k", "2.5M"); a size that is no tier keeps the same form. */
export function formatEventTier(n: number): string {
  const tier = TRAFFIC_TIERS.find((t) => t.value === n)
  if (tier) return tier.label
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`
  if (n >= 1_000) return `${Number((n / 1_000).toFixed(1))}k`
  return String(n)
}

/** What the sidebar's events card shows (owner pick 09-11-2026, Pulse/docs/plans/08-11-2026-sidebar-events-meter.md). */
export interface EventMeterView {
  /** The ring's fill, 0 to 100; a month over the plan fills it. */
  progress: number
  /** The share of the plan as people read it: "62%", "<1%" once anything is counted, "105%" over the plan. */
  share: string
  /** `high` from 80% of the plan and over it (Pulse keeps counting up to the ceiling); `stopped` once it stops. */
  level: 'normal' | 'high' | 'stopped'
  /** "31,200 of 50k this month", or "Pulse stopped counting at 100k". */
  line: string
  /** The collapsed sidebar's tooltip and the ring's accessible name. */
  label: string
}

/**
 * The sidebar card's words and colours from a subscription's meter. Null when there is nothing true to show: no count
 * from the server (unknown is never 0) or no plan limit. The share is rounded once and the level follows the rounded
 * figure, so "80%" is never grey.
 */
export function eventMeterView({ usage, limit, ceiling }: EventMeter): EventMeterView | null {
  if (usage === null || !(limit > 0)) return null
  const percent = Math.round((usage / limit) * 100)
  const share = usage > 0 && percent < 1 ? '<1%' : `${percent}%`
  const stopped = ceiling !== null && usage >= ceiling
  const count = `${usage.toLocaleString('en-GB')} of ${formatEventTier(limit)}`
  const line = stopped ? `Pulse stopped counting at ${formatEventTier(ceiling)}` : `${count} this month`
  return {
    progress: Math.min(100, (usage / limit) * 100),
    share,
    level: stopped ? 'stopped' : percent >= 80 ? 'high' : 'normal',
    line,
    label: stopped ? line : `Events this month: ${count} (${share})`,
  }
}

/** Maximum data retention (months) allowed per plan. */
export function getMaxRetentionMonthsForPlan(planId: string | null | undefined): number {
  switch (planId) {
    // business inherits team's 24-month retention (11-09-2026).
    case 'business': return 24
    case 'team': return 24
    case 'pioneer': return 24
    case 'opensource': return 24
    case 'startups': return 24
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

  switch (planId) {
    // business now tops out at 2 years, same as team (11-09-2026); the old
    // 3-year (36mo) option is gone with the 10-site business tier.
    case 'business': return team
    case 'team': return team
    case 'pioneer': return team
    case 'opensource': return team
    case 'startups': return team
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

