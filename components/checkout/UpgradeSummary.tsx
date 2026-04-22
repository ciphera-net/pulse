'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle } from '@phosphor-icons/react'
import { toast } from '@ciphera-net/ui'
import { changePlan, estimatePlanChange, type PlanChangeEstimate } from '@/lib/api/billing'

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

function formatCents(cents: number): string {
  return `€${(Math.abs(cents) / 100).toFixed(2)}`
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

export default function UpgradeSummary({
  currentPlan, currentInterval, currentLimit,
  newPlan, newInterval, newLimit,
}: UpgradeSummaryProps) {
  const router = useRouter()
  const [switching, setSwitching] = useState(false)
  const [done, setDone] = useState(false)
  const [estimate, setEstimate] = useState<PlanChangeEstimate | null>(null)
  const [estimateError, setEstimateError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    estimatePlanChange({ plan_id: newPlan, interval: newInterval, limit: newLimit })
      .then(setEstimate)
      .catch(() => setEstimateError(true))
      .finally(() => setLoading(false))
  }, [newPlan, newInterval, newLimit])

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
        <p className="text-sm text-neutral-400">Review the changes before confirming.</p>
      </div>

      {/* Current → New comparison */}
      <div className="flex items-center gap-4">
        <div className="flex-1 rounded-xl border border-neutral-700 bg-neutral-800/50 p-4">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Current</p>
          <p className="text-base font-semibold text-white">{capitalize(currentPlan)}</p>
          <p className="text-sm text-neutral-400">{formatLimit(currentLimit)} pageviews</p>
          <p className="text-xs text-neutral-500 mt-0.5">{currentInterval === 'year' ? 'Yearly' : 'Monthly'} billing</p>
        </div>

        <ArrowRight weight="bold" className="w-5 h-5 text-neutral-500 shrink-0" />

        <div className="flex-1 rounded-xl border border-brand-orange/50 bg-brand-orange/5 p-4">
          <p className="text-xs font-medium text-brand-orange uppercase tracking-wider mb-1">New</p>
          <p className="text-base font-semibold text-white">{capitalize(newPlan)}</p>
          <p className="text-sm text-neutral-400">{formatLimit(newLimit)} pageviews</p>
          <p className="text-xs text-neutral-500 mt-0.5">{newInterval === 'year' ? 'Yearly' : 'Monthly'} billing</p>
        </div>
      </div>

      {/* Cost breakdown */}
      {loading && (
        <div className="py-4 text-center">
          <div className="h-5 w-5 mx-auto animate-spin rounded-full border-2 border-neutral-600 border-t-white" />
          <p className="text-xs text-neutral-500 mt-2">Calculating proration...</p>
        </div>
      )}

      {estimateError && (
        <p className="text-sm text-red-400">Failed to estimate cost. Please try again.</p>
      )}

      {estimate && !loading && (
        <div className="rounded-xl border border-neutral-700 bg-neutral-800/30 p-4 space-y-3">
          <h3 className="text-sm font-medium text-neutral-300">Cost summary</h3>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-400">New plan (prorated)</span>
              <span className="text-white">{formatCents(estimate.sub_total)}</span>
            </div>
            {estimate.credits_applied > 0 && (
              <div className="flex justify-between">
                <span className="text-neutral-400">Credit from current plan</span>
                <span className="text-green-400">-{formatCents(estimate.credits_applied)}</span>
              </div>
            )}
            {estimate.tax > 0 && (
              <div className="flex justify-between">
                <span className="text-neutral-400">VAT</span>
                <span className="text-white">{formatCents(estimate.tax)}</span>
              </div>
            )}
            <div className="border-t border-neutral-700 pt-2 flex justify-between font-medium">
              <span className="text-neutral-300">Due now</span>
              <span className="text-white">{formatCents(estimate.amount_due)}</span>
            </div>
          </div>

          {estimate.next_date > 0 && (
            <p className="text-xs text-neutral-500 pt-1">
              Next renewal: {formatCents(estimate.next_total)} on {formatDate(estimate.next_date)}
            </p>
          )}
        </div>
      )}

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
          disabled={switching || loading || estimateError}
          className="flex-1 rounded-lg bg-brand-orange-button px-4 py-3 text-sm font-semibold text-white hover:bg-brand-orange-button-hover transition-colors disabled:opacity-50 ease-apple"
        >
          {switching ? 'Switching...' : estimate ? `Pay ${formatCents(estimate.amount_due)} & switch` : 'Confirm switch'}
        </button>
      </div>
    </div>
  )
}
