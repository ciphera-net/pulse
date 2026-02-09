/**
 * Shared plan and traffic tier definitions for pricing and billing (Change plan).
 * Backend supports plan_id "solo" and limit 10k–10M; month/year interval.
 */

export const PLAN_ID_SOLO = 'solo'

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
  return idx >= 0 ? idx : 2
}

export function getLimitForTierIndex(index: number): number {
  if (index < 0 || index >= TRAFFIC_TIERS.length) return 100000
  return TRAFFIC_TIERS[index].value
}
