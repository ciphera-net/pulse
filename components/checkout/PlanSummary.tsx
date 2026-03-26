'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check } from '@phosphor-icons/react'
import {
  TRAFFIC_TIERS,
  getSitesLimitForPlan,
  getMaxRetentionMonthsForPlan,
  PLAN_PRICES,
} from '@/lib/plans'

interface PlanSummaryProps {
  plan: string
  interval: string
  limit: number
}

export default function PlanSummary({ plan, interval, limit }: PlanSummaryProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentInterval, setCurrentInterval] = useState(interval)

  const monthlyCents = PLAN_PRICES[plan]?.[limit] || 0
  const isYearly = currentInterval === 'year'
  const displayPrice = isYearly ? (monthlyCents * 11) / 100 : monthlyCents / 100
  const monthlyEquivalent = isYearly ? displayPrice / 12 : displayPrice

  const tierLabel =
    TRAFFIC_TIERS.find((t) => t.value === limit)?.label ||
    `${(limit / 1000).toFixed(0)}k`
  const sitesLimit = getSitesLimitForPlan(plan)
  const retentionMonths = getMaxRetentionMonthsForPlan(plan)
  const retentionLabel =
    retentionMonths >= 12
      ? `${retentionMonths / 12} year${retentionMonths > 12 ? 's' : ''}`
      : `${retentionMonths} months`

  const handleIntervalToggle = (newInterval: string) => {
    setCurrentInterval(newInterval)
    const params = new URLSearchParams(searchParams.toString())
    params.set('interval', newInterval)
    router.replace(`/checkout?${params.toString()}`, { scroll: false })
  }

  const features = [
    `${tierLabel} pageviews/mo`,
    `${sitesLimit} site${sitesLimit && sitesLimit > 1 ? 's' : ''}`,
    `${retentionLabel} data retention`,
    'Unlimited team members',
    'Custom events & goals',
    'Funnels & user journeys',
  ]

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-xl p-6">
      {/* Plan header */}
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-semibold text-white capitalize">{plan}</h2>
        <span className="rounded-full bg-brand-orange/15 px-3 py-0.5 text-xs font-medium text-brand-orange">
          30-day trial
        </span>
      </div>

      {/* Price display */}
      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold tracking-tight text-white">
            &euro;{isYearly ? monthlyEquivalent.toFixed(2) : displayPrice.toFixed(0)}
          </span>
          <span className="text-neutral-400 text-sm">/mo</span>
        </div>
        {isYearly && (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-sm text-neutral-400">
              &euro;{displayPrice.toFixed(2)} billed yearly
            </span>
            <span className="rounded-full bg-brand-orange/15 px-2.5 py-0.5 text-xs font-medium text-brand-orange">
              Save 1 month
            </span>
          </div>
        )}
      </div>

      {/* Interval toggle */}
      <div className="mb-6 flex rounded-lg bg-neutral-800/60 p-1">
        <button
          type="button"
          onClick={() => handleIntervalToggle('month')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            currentInterval === 'month'
              ? 'bg-neutral-700 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => handleIntervalToggle('year')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            currentInterval === 'year'
              ? 'bg-neutral-700 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Yearly
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-800 mb-6" />

      {/* Features list */}
      <ul className="space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-3 text-sm text-neutral-300">
            <Check weight="bold" className="h-4 w-4 shrink-0 text-brand-orange" />
            {feature}
          </li>
        ))}
      </ul>
    </div>
  )
}
