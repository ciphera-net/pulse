'use client'

import { Fragment, Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import useSWR from 'swr'
import { CheckCircle, ClockCountdown, ArrowRight, WarningCircle } from '@phosphor-icons/react'
import { toast, Button, Spinner, LoadingOverlay } from '@ciphera-net/facet'
import { useSubscription } from '@/lib/swr/dashboard'
import { getPrices, changePlan, estimatePlanChange, type PlanChangeEstimate } from '@/lib/api/billing'
import { PLAN_CATALOG, TRAFFIC_TIERS, getPlanPricing, formatPlanName } from '@/lib/plans'
import PlanChoiceCard from '@/components/billing/PlanChoiceCard'
import TierSlider from '@/components/billing/TierSlider'
import { formatDateFull } from '@/lib/utils/formatDate'
import { cdnUrl } from '@/lib/cdn'
import { TIMING } from '@/lib/motion'

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

/** Estimate dates arrive as strings; render them verbosely when parseable. */
function formatEstimateDate(value?: string): string {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : formatDateFull(d)
}

function isValidTier(limit: number): boolean {
  return TRAFFIC_TIERS.some((t) => t.value === limit)
}

function SwitchStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="w-full max-w-2xl mx-auto mb-10">
      <div className="flex items-start">
        {STEPS.map((step, i) => {
          const isCompleted = i < currentStep
          const isCurrent = i === currentStep

          const circleClasses = [
            'w-7 h-7 sm:w-8 sm:h-8 rounded-none flex items-center justify-center text-xs sm:text-sm font-semibold shrink-0 transition-all ease-apple',
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
  const searchParams = useSearchParams()
  const { data: subscription, isLoading, mutate: mutateSubscription } = useSubscription()
  const { data: prices, isLoading: pricesLoading } = useSWR('plan-prices', getPrices)

  const [step, setStep] = useState(0)
  const [isYearly, setIsYearly] = useState(false)
  const [selectedLimit, setSelectedLimit] = useState(10_000)
  const [selectedPlan, setSelectedPlan] = useState('')

  const [estimate, setEstimate] = useState<PlanChangeEstimate | null>(null)
  const [estimateLoading, setEstimateLoading] = useState(false)
  const [estimateError, setEstimateError] = useState(false)
  const [switching, setSwitching] = useState(false)
  // True when the backend accepted the change but it awaits payment confirmation
  // (grant-after-payment upgrade). Drives the "pending" success copy so we never
  // imply the new plan is already live.
  const [changePending, setChangePending] = useState(false)

  const runEstimate = useCallback(async (planId: string, interval: string, limit: number) => {
    setEstimateLoading(true)
    setEstimateError(false)
    try {
      const est = await estimatePlanChange({ plan_id: planId, interval, limit })
      setEstimate(est)
    } catch {
      setEstimateError(true)
    } finally {
      setEstimateLoading(false)
    }
  }, [])

  // * Initialize the pickers from the org's LIVE plan (tier + interval), then
  // * let /pricing deep-link params override — landing on defaults that
  // * contradict what the customer is actually on misprices every card and can
  // * turn an intended tier-keep into an accidental downgrade. Ref-guarded so
  // * an SWR revalidation doesn't stomp manual toggles.
  const initialized = useRef(false)
  useEffect(() => {
    if (!subscription || initialized.current) return
    initialized.current = true

    const paramInterval = searchParams.get('interval')
    const paramLimit = Number(searchParams.get('limit'))
    const paramPlan = searchParams.get('plan') ?? ''

    const interval = paramInterval === 'year' || paramInterval === 'month'
      ? paramInterval
      : subscription.billing_interval
    setIsYearly(interval === 'year')

    const limit = isValidTier(paramLimit)
      ? paramLimit
      : isValidTier(subscription.pageview_limit)
        ? subscription.pageview_limit
        : 10_000
    setSelectedLimit(limit)

    // A valid ?plan deep link (from /pricing) carries a full, deliberate
    // choice — honor it by going straight to the review step.
    if (
      PLAN_CATALOG.some((p) => p.id === paramPlan) &&
      !(paramPlan === subscription.plan_id &&
        limit === subscription.pageview_limit &&
        (interval || 'month') === subscription.billing_interval)
    ) {
      setSelectedPlan(paramPlan)
      setStep(1)
      runEstimate(paramPlan, interval === 'year' ? 'year' : 'month', limit)
    }
  }, [subscription, searchParams, runEstimate])

  if (isLoading) {
    return <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" />
  }

  const status = subscription?.subscription_status
  if (!subscription || (status !== 'active' && status !== 'trialing')) {
    // past_due: the fix is the payment method, not a new plan — send the user
    // to billing recovery instead of restarting onboarding.
    router.replace(status === 'past_due' ? '/settings/organization/billing' : '/setup/plan')
    return null
  }

  const currentPlan = subscription.plan_id
  const currentInterval = subscription.billing_interval
  const currentLimit = subscription.pageview_limit
  const newInterval = isYearly ? 'year' : 'month'

  const handleSelectPlan = (planId: string) => {
    setSelectedPlan(planId)
    setStep(1)
    runEstimate(planId, newInterval, selectedLimit)
  }

  const handleSwitch = async () => {
    setSwitching(true)
    try {
      const result = await changePlan({ plan_id: selectedPlan, interval: newInterval, limit: selectedLimit })
      setChangePending(result.pending === true)
      setStep(2)
      toast.success(result.pending ? 'Plan change pending payment confirmation' : 'Plan updated successfully')
      mutateSubscription()
    } catch {
      toast.error('Failed to change plan. Please try again.')
    } finally {
      setSwitching(false)
    }
  }

  const currentPricing = getPlanPricing(prices, currentPlan, currentLimit)
  const newPricing = getPlanPricing(prices, selectedPlan, selectedLimit)

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 pb-24 sm:pb-12 sm:px-6 lg:px-10">
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
                  Currently on <span className="text-white font-medium">{formatPlanName(currentPlan)}</span> · {formatLimit(currentLimit)} pageviews · {currentInterval === 'year' ? 'yearly' : 'monthly'} billing.
                </p>
              </div>

              {/* Billing interval */}
              <div className="flex flex-col items-center gap-2 mb-6">
                <div className="bg-neutral-800/80 border border-neutral-800 p-1 rounded-none flex">
                  <button
                    onClick={() => setIsYearly(false)}
                    className={`px-4 py-1.5 rounded-none text-sm font-medium transition-all ease-apple ${
                      !isYearly ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setIsYearly(true)}
                    className={`px-4 py-1.5 rounded-none text-sm font-medium transition-all ease-apple ${
                      isYearly ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'
                    }`}
                  >
                    Yearly <span className={isYearly ? 'text-brand-orange' : 'text-neutral-600'}>· 1 mo free</span>
                  </button>
                </div>
              </div>

              {/* Traffic tier */}
              <div className="mb-6">
                <label className="block text-micro-label uppercase text-neutral-500 mb-3 text-center">
                  Monthly pageviews
                </label>
                <TierSlider value={selectedLimit} onChange={setSelectedLimit} />
              </div>

              {/* Plan cards */}
              <div className="space-y-3">
                {PLAN_CATALOG.map((plan) => {
                  const isCurrent =
                    plan.id === currentPlan &&
                    selectedLimit === currentLimit &&
                    newInterval === currentInterval
                  return (
                    <PlanChoiceCard
                      key={plan.id}
                      plan={plan}
                      price={getPlanPricing(prices, plan.id, selectedLimit)}
                      priceLoading={pricesLoading}
                      isYearly={isYearly}
                      isCurrent={isCurrent}
                      onClick={() => handleSelectPlan(plan.id)}
                    />
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

              <div className="rounded-none bg-card border border-border p-6 space-y-6">
                {/* Current → New comparison */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 rounded-none border border-neutral-700 bg-neutral-800/50 p-4">
                    <p className="text-micro-label uppercase text-neutral-500 mb-1">Current</p>
                    <p className="text-base font-semibold text-white">{formatPlanName(currentPlan)}</p>
                    <p className="text-sm text-neutral-400">{formatLimit(currentLimit)} pageviews</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {currentInterval === 'year' ? 'Yearly' : 'Monthly'} billing
                      {currentPricing ? ` · €${currentInterval === 'year' ? currentPricing.effectiveMonthly : currentPricing.monthly}/mo` : ''}
                    </p>
                  </div>

                  <ArrowRight weight="bold" className="w-5 h-5 text-neutral-500 shrink-0" />

                  <div className="flex-1 rounded-none border border-brand-orange/50 bg-brand-orange/5 p-4">
                    <p className="text-micro-label uppercase text-brand-orange mb-1">New</p>
                    <p className="text-base font-semibold text-white">{formatPlanName(selectedPlan)}</p>
                    <p className="text-sm text-neutral-400">{formatLimit(selectedLimit)} pageviews</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {isYearly ? 'Yearly' : 'Monthly'} billing
                      {newPricing ? ` · €${isYearly ? newPricing.effectiveMonthly : newPricing.monthly}/mo` : ''}
                    </p>
                  </div>
                </div>

                {/* Cost breakdown */}
                {estimateLoading && (
                  <div className="py-4 text-center">
                    <Spinner size="sm" className="mx-auto" />
                    <p className="text-xs text-neutral-500 mt-2">Calculating...</p>
                  </div>
                )}

                {estimateError && !estimateLoading && (
                  <div className="rounded-none border border-red-900/50 bg-red-950/20 p-4 text-center">
                    <WarningCircle size={18} weight="fill" className="text-red-400 mx-auto mb-1.5" />
                    <p className="text-sm text-red-300 mb-3">Couldn&apos;t calculate the cost of this change.</p>
                    <Button
                      variant="secondary"
                      className="text-sm"
                      onClick={() => runEstimate(selectedPlan, newInterval, selectedLimit)}
                    >
                      Retry
                    </Button>
                  </div>
                )}

                {estimate && !estimateLoading && !estimateError && estimate.direction === 'downgrade' && (
                  <div className="rounded-none border border-neutral-700 bg-neutral-800/30 p-4 space-y-3">
                    <h3 className="text-sm font-medium text-neutral-300">Change summary</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Current plan active until</span>
                        <span className="text-white">{formatEstimateDate(estimate.current_plan_end)}</span>
                      </div>
                      {(estimate.refund_amount ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-neutral-400">
                            Refund ({estimate.remaining_days} unused day{estimate.remaining_days !== 1 ? 's' : ''} of {estimate.current_plan_label})
                          </span>
                          <span className="text-pos">{formatCents(estimate.refund_amount!)}</span>
                        </div>
                      )}
                      <div className="border-t border-neutral-700 pt-2 flex justify-between font-medium">
                        <span className="text-neutral-300">New plan starts</span>
                        <span className="text-white">{formatEstimateDate(estimate.new_plan_start)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">First charge <span className="text-neutral-500">(incl. VAT)</span></span>
                        <span className="text-white">{formatCents(estimate.new_plan_cost ?? 0)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500 pt-1">
                      Refund will be returned to your original payment method.
                    </p>
                  </div>
                )}

                {estimate && !estimateLoading && !estimateError && estimate.direction === 'upgrade' && (
                  <div className="rounded-none border border-neutral-700 bg-neutral-800/30 p-4 space-y-3">
                    <h3 className="text-sm font-medium text-neutral-300">Payment summary</h3>
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
                          <span className="text-pos">−{formatCents(estimate.credits_applied!)}</span>
                        </div>
                      )}
                      <div className="border-t border-neutral-700 pt-2 flex justify-between font-medium">
                        <span className="text-neutral-300">Charged today <span className="font-normal text-neutral-500">(incl. VAT)</span></span>
                        <span className="text-white">{formatCents(estimate.charge_amount ?? 0)}</span>
                      </div>
                      {estimate.next_renewal && (
                        <div className="flex justify-between">
                          <span className="text-neutral-400">Next renewal</span>
                          <span className="text-white">{formatEstimateDate(estimate.next_renewal)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setStep(0); setEstimate(null); setEstimateError(false) }}
                    disabled={switching}
                    className="flex-1 rounded-none border border-neutral-700 px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 ease-apple"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSwitch}
                    disabled={switching || estimateLoading || estimateError || !estimate}
                    className="flex-1 rounded-none bg-brand-orange-button px-4 py-3 text-sm font-semibold text-white hover:bg-brand-orange-button-hover transition-colors disabled:opacity-50 ease-apple"
                  >
                    {switching ? 'Switching...'
                      : estimate?.direction === 'upgrade' ? `Pay ${formatCents(estimate.charge_amount ?? 0)} & switch`
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
                  {changePending ? 'Change pending' : 'Plan updated'}
                </h1>
              </div>

              <div className="rounded-none bg-card border border-border p-8 text-center">
                {changePending ? (
                  <>
                    <ClockCountdown weight="fill" className="w-12 h-12 mx-auto mb-4 text-amber-400" />
                    <h2 className="text-xl font-semibold text-white mb-2">
                      Plan change pending payment confirmation
                    </h2>
                    <p className="text-sm text-neutral-400">
                      Your switch to {formatPlanName(selectedPlan)} ({formatLimit(selectedLimit)} pageviews, {isYearly ? 'yearly' : 'monthly'} billing) applies as soon as your payment is confirmed. You can safely leave this page — it happens automatically.
                    </p>
                  </>
                ) : (
                  <>
                    <CheckCircle weight="fill" className="w-12 h-12 mx-auto mb-4 text-pos" />
                    <h2 className="text-xl font-semibold text-white mb-2">
                      You&apos;re now on {formatPlanName(selectedPlan)}
                    </h2>
                    <p className="text-sm text-neutral-400">
                      {formatLimit(selectedLimit)} pageviews, {isYearly ? 'yearly' : 'monthly'} billing.
                    </p>
                  </>
                )}
                <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                  <Button variant="default" className="text-sm" onClick={() => router.push('/')}>
                    Go to dashboard
                  </Button>
                  <Button variant="secondary" className="text-sm" onClick={() => router.push('/settings/organization/billing')}>
                    View billing
                  </Button>
                </div>
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
