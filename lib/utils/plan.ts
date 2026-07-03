/**
 * Display name for a subscription plan_id.
 *
 * Single source of truth — ad-hoc ternaries drift (the Privacy tab once
 * recognised only 'pro' and labelled every other plan "Free", so a Pioneer
 * org read "Your Free plan…").
 *
 * plan_id shapes seen in the wild: 'free' (marketing name: Hobby), legacy
 * Stripe 'price_…' ids (Pro), and plain ids like 'solo' / 'team' / 'pioneer'.
 */
export function formatPlanName(planId?: string | null): string {
  if (!planId || planId === 'free') return 'Hobby'
  if (planId.startsWith('price_')) return 'Pro'
  return planId.charAt(0).toUpperCase() + planId.slice(1)
}
