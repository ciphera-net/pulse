'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  TRAFFIC_TIERS,
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

  const handleIntervalToggle = (newInterval: string) => {
    setCurrentInterval(newInterval)
    const params = new URLSearchParams(searchParams.toString())
    params.set('interval', newInterval)
    router.replace(`/checkout?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Plan name + badge */}
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white capitalize">{plan}</h2>
          <span className="rounded-full bg-brand-orange/15 px-3 py-0.5 text-xs font-medium text-brand-orange">
            30-day trial
          </span>
        </div>

        {/* Interval toggle */}
        <div className="flex items-center gap-1 p-1 bg-neutral-800/50 rounded-xl sm:ml-auto">
          {(['month', 'year'] as const).map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => handleIntervalToggle(iv)}
              className={`relative px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
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
      </div>

      {/* Price row */}
      <div className="mt-4 flex items-baseline gap-2 flex-wrap">
        <span className="text-3xl font-bold tracking-tight text-white">
          &euro;{isYearly ? monthlyEquivalent.toFixed(2) : displayPrice.toFixed(0)}
        </span>
        <span className="text-neutral-400 text-sm">/mo</span>
        <span className="text-neutral-500 text-sm">&middot; {tierLabel} pageviews</span>
        {isYearly && (
          <span className="rounded-full bg-brand-orange/15 px-2.5 py-0.5 text-xs font-medium text-brand-orange">
            Save 1 month
          </span>
        )}
      </div>
      {isYearly && (
        <p className="mt-1 text-sm text-neutral-400">
          &euro;{displayPrice.toFixed(2)} billed yearly
        </p>
      )}
    </div>
  )
}
