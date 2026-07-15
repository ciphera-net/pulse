import { supportTierLabels, type SupportTier } from '@/lib/integrations'

// * Mono micro-label per support tier (§7.1: 0px, border-driven, orange scarce,
// * pos-green for verified). Pure presentational — safe in server components.
const TIER_STYLES: Record<SupportTier, string> = {
  verified: 'text-[#3ECF8E] border-[#3ECF8E]/30 bg-[#3ECF8E]/10',
  'standard-snippet': 'text-neutral-400 border-neutral-700 bg-neutral-800/40',
  'plan-gated': 'text-amber-400/90 border-amber-500/25 bg-amber-500/10',
  'special-handling': 'text-amber-400 border-amber-500/30 bg-amber-500/10',
}

export function TierBadge({ tier, className = '' }: { tier: SupportTier; className?: string }) {
  return (
    <span
      className={`inline-flex items-center border px-1.5 py-0.5 rounded-none font-mono text-[10px] uppercase tracking-[0.08em] ${TIER_STYLES[tier]} ${className}`}
    >
      {supportTierLabels[tier]}
    </span>
  )
}
