'use client'

import { Slider } from '@/components/ui/slider'
import Select from '@/components/ui/select'
import { cn } from '@/lib/cn'
import { TRAFFIC_TIERS, getTierIndexForLimit } from '@/lib/plans'

interface TierSliderProps {
  /** Selected pageview limit (a TRAFFIC_TIERS value). */
  value: number
  onChange: (limit: number) => void
  className?: string
}

/**
 * Pageview-tier picker shared by /setup/plan and /switch — the same
 * labels-above-slider composition the marketing pricing page uses, so the
 * in-app plan flows keep the grammar a converting visitor already saw.
 * Falls back to the app Select below `sm`, where nine tick labels don't fit.
 */
export default function TierSlider({ value, onChange, className }: TierSliderProps) {
  const index = getTierIndexForLimit(value)

  return (
    <div className={className}>
      <div className="hidden sm:block">
        <div className="mb-3 flex items-end justify-between px-0.5">
          {TRAFFIC_TIERS.map((tier, i) => (
            <button
              key={tier.label}
              type="button"
              onClick={() => onChange(tier.value)}
              aria-label={`Select ${tier.label} pageviews per month`}
              className={cn(
                'whitespace-nowrap px-1 py-0.5 text-xs tabular-nums transition-colors duration-fast ease-apple focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
                i === index ? 'text-brand-orange' : 'text-neutral-500 hover:text-white',
              )}
            >
              {tier.label}
            </button>
          ))}
        </div>
        <Slider
          value={[index]}
          onValueChange={([v]) => onChange(TRAFFIC_TIERS[v]?.value ?? TRAFFIC_TIERS[0].value)}
          min={0}
          max={TRAFFIC_TIERS.length - 1}
          step={1}
          aria-label={`${TRAFFIC_TIERS[index]?.label} pageviews per month`}
        />
      </div>

      <div className="sm:hidden">
        <Select
          variant="input"
          fullWidth
          value={String(value)}
          onChange={(v) => onChange(Number(v))}
          options={TRAFFIC_TIERS.map((tier) => ({
            value: String(tier.value),
            label: `${tier.label} pageviews/month`,
          }))}
        />
      </div>
    </div>
  )
}
