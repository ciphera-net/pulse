'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
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
      <div className="mb-6 flex items-center gap-1 p-1 bg-neutral-800/50 rounded-xl">
        {(['month', 'year'] as const).map((iv) => (
          <button
            key={iv}
            type="button"
            onClick={() => handleIntervalToggle(iv)}
            className={`relative flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
              currentInterval === iv ? 'text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            {currentInterval === iv && (
              <motion.div
                layoutId="checkout-interval-bg"
                className="absolute inset-0 bg-neutral-700 rounded-lg shadow-sm"
                transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
              />
            )}
            <span className="relative z-10">{iv === 'month' ? 'Monthly' : 'Yearly'}</span>
          </button>
        ))}
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
