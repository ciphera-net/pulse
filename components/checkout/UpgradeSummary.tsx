'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle } from '@phosphor-icons/react'
import { toast } from '@ciphera-net/ui'
import { changePlan } from '@/lib/api/billing'
import useSWR from 'swr'
import { getPrices } from '@/lib/api/billing'

interface UpgradeSummaryProps {
  currentPlan: string
  currentInterval: string
  currentLimit: number
  newPlan: string
  newInterval: string
  newLimit: number
}

function formatLimit(limit: number): string {
  if (limit >= 1_000_000) return `${limit / 1_000_000}M`
  return `${limit / 1_000}k`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function UpgradeSummary({
  currentPlan, currentInterval, currentLimit,
  newPlan, newInterval, newLimit,
}: UpgradeSummaryProps) {
  const router = useRouter()
  const [switching, setSwitching] = useState(false)
  const [done, setDone] = useState(false)
  const { data: prices } = useSWR('plan-prices', getPrices)

  const currentMonthly = prices?.[currentPlan]?.[currentLimit] ?? 0
  const newMonthly = prices?.[newPlan]?.[newLimit] ?? 0

  const currentDisplay = currentInterval === 'year'
    ? `€${((currentMonthly * 11) / 100).toFixed(2)}/yr`
    : `€${(currentMonthly / 100).toFixed(2)}/mo`

  const newDisplay = newInterval === 'year'
    ? `€${((newMonthly * 11) / 100).toFixed(2)}/yr`
    : `€${(newMonthly / 100).toFixed(2)}/mo`

  const handleSwitch = async () => {
    setSwitching(true)
    try {
      await changePlan({ plan_id: newPlan, interval: newInterval, limit: newLimit })
      setDone(true)
      toast.success('Plan updated successfully')
      setTimeout(() => router.push('/'), 2000)
    } catch {
      toast.error('Failed to change plan. Please try again.')
    } finally {
      setSwitching(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl glass-surface p-8 text-center">
        <CheckCircle weight="fill" className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Plan updated</h2>
        <p className="text-sm text-neutral-400">Redirecting to your dashboard...</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl glass-surface p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Switch plan</h2>
        <p className="text-sm text-neutral-400">Your billing will be prorated automatically.</p>
      </div>

      {/* Current → New comparison */}
      <div className="flex items-center gap-4">
        {/* Current plan */}
        <div className="flex-1 rounded-xl border border-neutral-700 bg-neutral-800/50 p-4">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Current</p>
          <p className="text-base font-semibold text-white">{capitalize(currentPlan)}</p>
          <p className="text-sm text-neutral-400">{formatLimit(currentLimit)} pageviews</p>
          <p className="text-sm text-neutral-300 mt-1">{currentDisplay}</p>
        </div>

        <ArrowRight weight="bold" className="w-5 h-5 text-neutral-500 shrink-0" />

        {/* New plan */}
        <div className="flex-1 rounded-xl border border-brand-orange/50 bg-brand-orange/5 p-4">
          <p className="text-xs font-medium text-brand-orange uppercase tracking-wider mb-1">New</p>
          <p className="text-base font-semibold text-white">{capitalize(newPlan)}</p>
          <p className="text-sm text-neutral-400">{formatLimit(newLimit)} pageviews</p>
          <p className="text-sm text-neutral-300 mt-1">{newDisplay}</p>
        </div>
      </div>

      {/* Info */}
      <p className="text-xs text-neutral-500">
        The price difference will be prorated for the remainder of your current billing period.
        Your next renewal will reflect the new plan price.
      </p>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          disabled={switching}
          className="flex-1 rounded-lg border border-neutral-700 px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 ease-apple"
        >
          Cancel
        </button>
        <button
          onClick={handleSwitch}
          disabled={switching}
          className="flex-1 rounded-lg bg-brand-orange-button px-4 py-3 text-sm font-semibold text-white hover:bg-brand-orange-button-hover transition-colors disabled:opacity-50 ease-apple"
        >
          {switching ? 'Switching...' : 'Confirm switch'}
        </button>
      </div>
    </div>
  )
}
