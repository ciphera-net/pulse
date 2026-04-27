'use client'

import { Fragment, Suspense, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import useSWR from 'swr'
import { Check, CheckCircle, ArrowRight } from '@phosphor-icons/react'
import { toast, Spinner, LoadingOverlay } from '@ciphera-net/ui'
import { useSubscription } from '@/lib/swr/dashboard'
import { getPrices, changePlan, estimatePlanChange, type PlanChangeEstimate } from '@/lib/api/billing'
import { TRAFFIC_TIERS } from '@/lib/plans'
import { cdnUrl } from '@/lib/cdn'
import { TIMING } from '@/lib/motion'

const PLANS = [
  {
    id: 'solo',
    name: 'Solo',
    description: 'For personal sites',
    highlights: ['1 site', 'Custom events', 'Email reports'],
  },
  {
    id: 'team',
    name: 'Team',
    description: 'For startups & agencies',
    popular: true,
    highlights: ['Up to 5 sites', 'Funnels & journeys', 'Team dashboard', 'API access'],
  },
  {
    id: 'business',
    name: 'Business',
    description: 'For larger organizations',
    highlights: ['Up to 10 sites', 'Uptime monitoring', 'Priority support', 'Everything in Team'],
  },
]

const STEPS = [
  { key: 'select', label: 'Select plan' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
]

function formatLimit(limit: number): string {
  if (limit >= 1_000_000) return `${limit / 1_000_000}M`
  return `${limit / 1_000}k`
}

function formatCents(cents: number): string {
  return `€${(Math.abs(cents) / 100).toFixed(2)}`
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function SwitchStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="w-full max-w-2xl mx-auto mb-10">
      <div className="flex items-start">
        {STEPS.map((step, i) => {
          const isCompleted = i < currentStep
          const isCurrent = i === currentStep

          const circleClasses = [
            'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold shrink-0 transition-all ease-apple',
            isCompleted || isCurrent
              ? 'bg-brand-orange text-white'
              : 'bg-neutral-800 border border-neutral-700 text-neutral-400',
          ].join(' ')

          const labelColor = isCurrent
            ? 'text-white font-semibold'
            : isCompleted
              ? 'text-neutral-400'
              : 'text-neutral-500'

          return (
            <Fragment key={step.key}>
              <div className="flex flex-col items-center shrink-0">
                <div className={circleClasses}>
                  {isCompleted ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : i + 1}
                </div>
                <span className={`text-xs font-medium ${labelColor} mt-2.5 whitespace-nowrap`}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-px flex-1 mx-3 mt-3.5 sm:mt-4 ${isCompleted ? 'bg-brand-orange' : 'bg-neutral-700'}`} />
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function SwitchPlanContent() {
  const router = useRouter()
  const { data: subscription, isLoading } = useSubscription()
  const { data: prices } = useSWR('plan-prices', getPrices)

  const [step, setStep] = useState(0)
  const [isYearly, setIsYearly] = useState(false)
  const [selectedLimit, setSelectedLimit] = useState(10_000)
  const [selectedPlan, setSelectedPlan] = useState('')

  const [estimate, setEstimate] = useState<PlanChangeEstimate | null>(null)
  const [estimateLoading, setEstimateLoading] = useState(false)
  const [estimateError, setEstimateError] = useState(false)
  const [switching, setSwitching] = useState(false)

  if (isLoading) {
    return <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" />
  }

  if (!subscription || subscription.subscription_status !== 'active') {
    router.replace('/setup/plan')
    return null
  }

  const currentPlan = subscription.plan_id
  const currentInterval = subscription.billing_interval
  const currentLimit = subscription.pageview_limit
  const newInterval = isYearly ? 'year' : 'month'

  const getPrice = (planId: string) => {
    const baseCents = prices?.[planId]?.[selectedLimit]
    if (!baseCents) return null
    const monthly = baseCents / 100
    const yearlyTotal = Math.round((monthly * 11) * 100) / 100
    const effectiveMonthly = Math.round((yearlyTotal / 12) * 100) / 100
    return { monthly, effectiveMonthly, yearlyTotal }
  }

  const handleSelectPlan = async (planId: string) => {
    setSelectedPlan(planId)
    setStep(1)
    setEstimateLoading(true)
    setEstimateError(false)
    try {
      const est = await estimatePlanChange({ plan_id: planId, interval: newInterval, limit: selectedLimit })
      setEstimate(est)
    } catch {
      setEstimateError(true)
    } finally {
      setEstimateLoading(false)
    }
  }

  const handleSwitch = async () => {
    setSwitching(true)
    try {
      await changePlan({ plan_id: selectedPlan, interval: newInterval, limit: selectedLimit })
      setStep(2)
      toast.success('Plan updated successfully')
      setTimeout(() => router.push('/'), 3000)
    } catch {
      toast.error('Failed to change plan. Please try again.')
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-10">
      <SwitchStepper currentStep={step} />
      <div className="w-full max-w-lg">
        <AnimatePresence mode="wait">

          {/* Step 1: Select plan */}
          {step === 0 && (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={TIMING}
            >
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Switch your plan
                </h1>
                <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
                  Currently on <span className="text-white font-medium">{currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}</span> with {formatLimit(currentLimit)} pageviews ({currentInterval === 'year' ? 'yearly' : 'monthly'}).
                </p>
              </div>

              {/* Billing toggle */}
              <div className="flex flex-col items-center gap-2 mb-6">
                <div className="bg-neutral-800/80 border border-white/[0.08] p-1 rounded-xl flex">
                  <button
                    onClick={() => setIsYearly(false)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ease-apple ${
                      !isYearly ? 'bg-neutral-700 text-white shadow-sm' : 'text-neutral-500 hover:text-white'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setIsYearly(true)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ease-apple ${
                      isYearly ? 'bg-neutral-700 text-white shadow-sm' : 'text-neutral-500 hover:text-white'
                    }`}
                  >
                    Yearly
                  </button>
                </div>
                {isYearly && (
                  <span className="text-xs text-brand-orange font-medium">1 month free</span>
                )}
              </div>

              {/* Traffic tier */}
              <div className="mb-6">
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 text-center">
                  Monthly pageviews
                </label>
                <select
                  value={selectedLimit}
                  onChange={(e) => setSelectedLimit(Number(e.target.value))}
                  className="w-full py-2 px-3 bg-neutral-800/80 border border-white/[0.08] rounded-xl text-white text-sm outline-none focus-visible:border-brand-orange"
                >
                  {TRAFFIC_TIERS.map((tier) => (
                    <option key={tier.value} value={tier.value}>
                      {tier.label} pageviews/month
                    </option>
                  ))}
                </select>
              </div>

              {/* Plan cards */}
              <div className="space-y-3">
                {PLANS.map((plan) => {
                  const price = getPrice(plan.id)
                  const isCurrent = plan.id === currentPlan && selectedLimit === currentLimit && newInterval === currentInterval
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => !isCurrent && handleSelectPlan(plan.id)}
                      disabled={isCurrent}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        isCurrent
                          ? 'border-emerald-500/40 bg-emerald-500/5 opacity-60 cursor-not-allowed'
                          : plan.popular
                            ? 'border-brand-orange/40 bg-brand-orange/5 hover:border-brand-orange/70'
                            : 'border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{plan.name}</span>
                            {isCurrent && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                Current
                              </span>
                            )}
                            {!isCurrent && plan.popular && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-orange bg-brand-orange/10 px-1.5 py-0.5 rounded">
                                Popular
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 mt-0.5">{plan.description}</p>
                        </div>
                        {price ? (
                          <div className="text-right shrink-0">
                            <span className="text-lg font-bold text-white">
                              €{isYearly ? price.effectiveMonthly : price.monthly}
                            </span>
                            <span className="text-xs text-neutral-500">/mo</span>
                          </div>
                        ) : (
                          <Spinner size="sm" />
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {plan.highlights.map((f) => (
                          <span key={f} className="flex items-center gap-1 text-xs text-neutral-400">
                            <Check className="w-3 h-3 text-brand-orange" weight="bold" />
                            {f}
                          </span>
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => router.back()}
                className="w-full text-center text-sm text-neutral-500 hover:text-neutral-400 transition-colors mt-6"
              >
                Cancel
              </button>
            </motion.div>
          )}

          {/* Step 2: Review */}
          {step === 1 && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={TIMING}
            >
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Review changes
                </h1>
                <p className="mt-2 text-sm text-neutral-400">
                  Confirm the plan switch below.
                </p>
              </div>

              <div className="rounded-2xl glass-surface p-6 space-y-6">
                {/* Current → New comparison */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 rounded-xl border border-neutral-700 bg-neutral-800/50 p-4">
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Current</p>
                    <p className="text-base font-semibold text-white">{currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}</p>
                    <p className="text-sm text-neutral-400">{formatLimit(currentLimit)} pageviews</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{currentInterval === 'year' ? 'Yearly' : 'Monthly'} billing</p>
                  </div>

                  <ArrowRight weight="bold" className="w-5 h-5 text-neutral-500 shrink-0" />

                  <div className="flex-1 rounded-xl border border-brand-orange/50 bg-brand-orange/5 p-4">
                    <p className="text-xs font-medium text-brand-orange uppercase tracking-wider mb-1">New</p>
                    <p className="text-base font-semibold text-white">{selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}</p>
                    <p className="text-sm text-neutral-400">{formatLimit(selectedLimit)} pageviews</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{isYearly ? 'Yearly' : 'Monthly'} billing</p>
                  </div>
                </div>

                {/* Cost breakdown */}
                {estimateLoading && (
                  <div className="py-4 text-center">
                    <div className="h-5 w-5 mx-auto animate-spin rounded-full border-2 border-neutral-600 border-t-white" />
                    <p className="text-xs text-neutral-500 mt-2">Calculating...</p>
                  </div>
                )}

                {estimateError && (
                  <p className="text-sm text-red-400">Failed to estimate cost. Please try again.</p>
                )}

                {estimate && !estimateLoading && estimate.direction === 'downgrade' && (
                  <div className="rounded-xl border border-neutral-700 bg-neutral-800/30 p-4 space-y-3">
                    <h3 className="text-sm font-medium text-neutral-300">Downgrade summary</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Current plan active until</span>
                        <span className="text-white">{estimate.current_plan_end}</span>
                      </div>
                      {(estimate.refund_amount ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-neutral-400">
                            Refund ({estimate.remaining_days} unused day{estimate.remaining_days !== 1 ? 's' : ''} of {estimate.current_plan_label})
                          </span>
                          <span className="text-green-400">{formatCents(estimate.refund_amount!)}</span>
                        </div>
                      )}
                      <div className="border-t border-neutral-700 pt-2 flex justify-between font-medium">
                        <span className="text-neutral-300">New plan starts</span>
                        <span className="text-white">{estimate.new_plan_start}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">First charge</span>
                        <span className="text-white">{formatCents(estimate.new_plan_cost ?? 0)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500 pt-1">
                      Refund will be returned to your original payment method.
                    </p>
                  </div>
                )}

                {estimate && !estimateLoading && estimate.direction === 'upgrade' && (
                  <div className="rounded-xl border border-neutral-700 bg-neutral-800/30 p-4 space-y-3">
                    <h3 className="text-sm font-medium text-neutral-300">Upgrade summary</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral-400">New plan starts</span>
                        <span className="text-white">Now</span>
                      </div>
                      {(estimate.credits_applied ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-neutral-400">
                            Credit ({estimate.remaining_days} unused day{estimate.remaining_days !== 1 ? 's' : ''} of {estimate.current_plan_label})
                          </span>
                          <span className="text-green-400">−{formatCents(estimate.credits_applied!)}</span>
                        </div>
                      )}
                      <div className="border-t border-neutral-700 pt-2 flex justify-between font-medium">
                        <span className="text-neutral-300">Charged today</span>
                        <span className="text-white">{formatCents(estimate.charge_amount ?? 0)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setStep(0); setEstimate(null) }}
                    disabled={switching}
                    className="flex-1 rounded-lg border border-neutral-700 px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 ease-apple"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSwitch}
                    disabled={switching || estimateLoading || estimateError}
                    className="flex-1 rounded-lg bg-brand-orange-button px-4 py-3 text-sm font-semibold text-white hover:bg-brand-orange-button-hover transition-colors disabled:opacity-50 ease-apple"
                  >
                    {switching ? 'Switching...'
                      : estimate?.direction === 'downgrade' ? 'Confirm downgrade'
                      : estimate?.direction === 'upgrade' ? `Pay ${formatCents(estimate.charge_amount ?? 0)} & upgrade`
                      : 'Confirm switch'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Done */}
          {step === 2 && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={TIMING}
            >
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Plan updated
                </h1>
              </div>

              <div className="rounded-2xl glass-surface p-8 text-center">
                <CheckCircle weight="fill" className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">
                  You&apos;re now on {selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}
                </h2>
                <p className="text-sm text-neutral-400">
                  {formatLimit(selectedLimit)} pageviews, {isYearly ? 'yearly' : 'monthly'} billing. Redirecting to your dashboard...
                </p>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}

export default function SwitchPage() {
  return (
    <Suspense fallback={<LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" />}>
      <SwitchPlanContent />
    </Suspense>
  )
}
