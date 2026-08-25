'use client'

import { Fragment, Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import useSWR from 'swr'
import { CheckCircle, ClockCountdown, ArrowRight, WarningCircle, Prohibit } from '@phosphor-icons/react'
import { toast, Button, Spinner, LoadingOverlay } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import { useSubscription } from '@/lib/swr/dashboard'
import { getPrices, getSubscription, changePlan, estimatePlanChange, type PlanChangeEstimate } from '@/lib/api/billing'
import { PLAN_CATALOG, TRAFFIC_TIERS, getPlanPricing, formatPlanName } from '@/lib/plans'
import PlanChoiceCard from '@/components/billing/PlanChoiceCard'
import TierSlider from '@/components/billing/TierSlider'
import PlanSummary from '@/components/checkout/PlanSummary'
import PaymentForm from '@/components/checkout/PaymentForm'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { formatCalendarDateFull } from '@/lib/utils/formatDate'
import { formatEuro, formatEuroCents } from '@/lib/utils/money'
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
  // Magnitude only — callers render the sign/direction themselves ("refund",
  // a leading −). Formatting itself goes through the one shared formatter.
  return formatEuroCents(Math.abs(cents))
}

/** Estimate dates are CALENDAR-DATE strings — the backend formats them with
 * .Format("2006-01-02"). Rendered through the calendar formatter so no Date is
 * constructed and no timezone can shift the shown day; running them through
 * formatDateFull here reproduced the exact local-day class behind the 15-08
 * "RENEWS 16/08" incident. Falls back to the raw string for anything the
 * calendar parser refuses, rather than fabricating a date. */
function formatEstimateDate(value?: string): string {
  if (!value) return ''
  return formatCalendarDateFull(value) ?? value
}

function isValidTier(limit: number): boolean {
  return TRAFFIC_TIERS.some((t) => t.value === limit)
}

/**
 * Return-from-Mollie confirmation (?from=checkout — the backend's per-caller
 * return URL for return_to:"switch"). Same honesty contract as the wizard's
 * done page (ruled B1): success is EARNED by observing an active subscription.
 */
type PaymentState = 'none' | 'confirming' | 'confirmed' | 'failed' | 'error' | 'unconfirmed'

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
              <div className="flex flex-col items-center shrink-0" aria-current={isCurrent ? 'step' : undefined}>
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
  const { loading: authLoading } = useAuth()
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

  // Checkout-mode billing details (no mandate on file — ruled E1: /switch
  // collects details/VAT itself, then redirects to Mollie and returns HERE).
  const [country, setCountry] = useState('')
  const [vatId, setVatId] = useState('')
  const [verifiedVatId, setVerifiedVatId] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [billingEmail, setBillingEmail] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [missingFields, setMissingFields] = useState<string[]>([])

  // Return-from-Mollie confirmation state (see PaymentState).
  const [payment, setPayment] = useState<PaymentState>('none')
  const [pollNonce, setPollNonce] = useState(0)

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

  // ?from=checkout — the customer is back from Mollie. Poll until the payment
  // settles; the same state machine as the wizard's done page (ruled B1).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('canceled') === 'true') {
      toast.info("Checkout was canceled. You can try again whenever you're ready.")
      window.history.replaceState({}, '', window.location.pathname)
      return
    }
    if (params.get('from') !== 'checkout') return
    setPayment('confirming')
    setStep(2)
    let cancelled = false
    ;(async () => {
      let consecutiveErrors = 0
      for (let i = 0; i < 25; i++) {
        try {
          const sub = await getSubscription()
          if (cancelled) return
          consecutiveErrors = 0
          if (sub.subscription_status === 'active' || sub.subscription_status === 'trialing') {
            setPayment('confirmed')
            window.history.replaceState({}, '', window.location.pathname)
            mutateSubscription()
            return
          }
          if (sub.subscription_status === 'past_due' || sub.subscription_status === 'canceled') {
            setPayment('failed')
            return
          }
        } catch {
          consecutiveErrors++
          if (consecutiveErrors >= 3) {
            if (!cancelled) setPayment('error')
            return
          }
        }
        await new Promise((r) => setTimeout(r, 3000))
        if (cancelled) return
      }
      if (!cancelled) setPayment('unconfirmed')
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollNonce])

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

    // Prefill checkout billing details from what the org already told us —
    // the no-mandate flow re-collects only what is missing. The VAT ID is
    // prefilled UNVERIFIED on purpose: stored ids are not necessarily
    // VIES-validated, and the form requires a fresh verification to submit one.
    setBusinessName(subscription.business_name ?? '')
    setBillingEmail(subscription.billing_email ?? '')
    setAddress(subscription.billing_address ?? '')
    setCity(subscription.billing_city ?? '')
    setPostalCode(subscription.billing_postal_code ?? '')
    if (subscription.tax_id?.country) setCountry(subscription.tax_id.country)
    if (subscription.tax_id?.value) setVatId(subscription.tax_id.value)

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

  // * useSubscription's SWR key is null until the auth user resolves, so its
  // * isLoading is FALSE with no data during auth load — redirecting on
  // * !subscription at that moment bounces users with perfectly active
  // * subscriptions (a race observed live). Wait for auth first.
  if (authLoading || isLoading) {
    return <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" />
  }

  // A failed fetch is an ERROR, not a bounce (ruled F1/F-B2): the old guard
  // sent an active subscriber whose request blipped into onboarding — where a
  // second checkout is live.
  if (!subscription) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <SettingsErrorState
            title="Couldn’t load your subscription"
            message="Your plan and usage are temporarily unavailable. Your subscription itself is unaffected."
            onRetry={() => mutateSubscription()}
            retrying={isLoading}
          />
        </div>
      </div>
    )
  }

  const status = subscription.subscription_status
  if (status === 'past_due') {
    // past_due: the fix is the payment method, not a new plan — send the user
    // to billing recovery instead of a plan picker that would bounce.
    router.replace('/settings/organization/billing')
    return null
  }

  // Ruled E1: /switch owns EVERY plan change. A mandate on file means the
  // Review step charges in place; no mandate (from-free upgrade, a granted or
  // cancelled org) means /switch collects billing details and hands off to
  // Mollie, returning HERE — never to the onboarding wizard.
  const canChargeInPlace =
    Boolean(subscription.has_payment_method) && (status === 'active' || status === 'trialing')

  const currentPlan = subscription.plan_id
  const currentInterval = subscription.billing_interval
  const currentLimit = subscription.pageview_limit
  const newInterval = isYearly ? 'year' : 'month'
  const isSubscribed = status === 'active' || status === 'trialing'

  const handleSelectPlan = (planId: string) => {
    setSelectedPlan(planId)
    setStep(1)
    if (canChargeInPlace) {
      runEstimate(planId, newInterval, selectedLimit)
    }
  }

  const handleSwitch = async () => {
    setSwitching(true)
    try {
      const result = await changePlan({ plan_id: selectedPlan, interval: newInterval, limit: selectedLimit })
      setChangePending(result.pending === true)
      setStep(2)
      toast.success(result.pending ? 'Plan change pending payment confirmation' : 'Plan updated successfully')
      mutateSubscription()
    } catch (err) {
      // Surface the server's own refusal when it has one — "a plan change is
      // already pending for this billing cycle" is actionable; a generic toast
      // is not.
      const apiErr = err as { data?: { error?: string } }
      toast.error(apiErr.data?.error || 'Failed to change plan. Please try again.')
    } finally {
      setSwitching(false)
    }
  }

  const currentPricing = getPlanPricing(prices, currentPlan, currentLimit)
  const newPricing = getPlanPricing(prices, selectedPlan, selectedLimit)

  // ── Return-from-Mollie states override the step UI entirely ──
  if (payment !== 'none') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-10">
        <SwitchStepper currentStep={2} />
        <div className="w-full max-w-lg">
          {payment === 'confirming' && (
            <div className="text-center py-16">
              <p className="mx-auto mb-5 flex items-center justify-center gap-2 text-sm font-semibold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-orange animate-pulse" />
                Confirming your payment
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-white">Almost there</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-400">
                Cards confirm in seconds. Bank redirects can take a minute — your
                plan activates automatically the moment the payment lands.
              </p>
              <p className="mx-auto mt-8 text-xs text-neutral-500">
                Been a while?{' '}
                <button
                  type="button"
                  onClick={() => router.push('/settings/organization/billing')}
                  className="text-brand-orange hover:underline"
                >
                  Check billing
                </button>
                {' '}— you won&apos;t be charged twice.
              </p>
            </div>
          )}

          {payment === 'confirmed' && (
            <div className="rounded-none bg-card border border-border p-8 text-center">
              <p className="mb-3 text-sm font-semibold text-pos">✓ Payment confirmed</p>
              <h2 className="text-xl font-semibold text-white mb-2">Plan updated</h2>
              <p className="text-sm text-neutral-400">
                You&apos;re on {formatPlanName(subscription.plan_id)} — the new limits are live now.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                <Button variant="default" className="text-sm" onClick={() => router.push('/settings/organization/billing')}>
                  Back to billing
                </Button>
                <Button variant="secondary" className="text-sm" onClick={() => router.push('/')}>
                  Go to dashboard
                </Button>
              </div>
            </div>
          )}

          {payment === 'failed' && (
            <div className="text-center py-10">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-none border border-neutral-800 mb-5">
                <Prohibit weight="fill" className="h-8 w-8 text-destructive" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Your payment didn&apos;t go through</h1>
              <p className="mt-3 text-sm text-neutral-400 max-w-md mx-auto">
                The payment was declined or cancelled, so your plan wasn&apos;t
                changed. You can try again — nothing has been charged.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Button variant="default" className="text-sm" onClick={() => { setPayment('none'); setStep(0) }}>
                  Try again
                </Button>
                <Button variant="secondary" className="text-sm" onClick={() => router.push('/settings/organization/billing')}>
                  View billing
                </Button>
              </div>
            </div>
          )}

          {payment === 'error' && (
            <div className="text-center py-10">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-none border border-neutral-800 mb-5">
                <WarningCircle weight="fill" className="h-8 w-8 text-amber-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">We can&apos;t check your payment right now</h1>
              <p className="mt-3 text-sm text-neutral-400 max-w-md mx-auto">
                This is a problem on our side, not with your payment. If you
                completed it, your plan activates automatically — you won&apos;t
                be charged twice.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Button variant="default" className="text-sm" onClick={() => { setPayment('confirming'); setPollNonce((n) => n + 1) }}>
                  Check again
                </Button>
                <Button variant="secondary" className="text-sm" onClick={() => router.push('/settings/organization/billing')}>
                  View billing
                </Button>
              </div>
            </div>
          )}

          {payment === 'unconfirmed' && (
            <div className="text-center py-10">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-none border border-neutral-800 mb-5">
                <WarningCircle weight="fill" className="h-8 w-8 text-amber-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">We couldn&apos;t confirm your payment</h1>
              <p className="mt-3 text-sm text-neutral-400 max-w-md mx-auto">
                If you cancelled or the payment failed, no charge was made — you
                can simply try again. If you did complete the payment, your plan
                updates automatically within a few minutes; you won&apos;t be
                charged twice.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Button variant="default" className="text-sm" onClick={() => { setPayment('none'); setStep(0) }}>
                  Try again
                </Button>
                <Button variant="secondary" className="text-sm" onClick={() => router.push('/settings/organization/billing')}>
                  View billing
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

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
                  {isSubscribed ? (
                    <>Currently on <span className="text-white font-medium">{formatPlanName(currentPlan)}</span> · {formatLimit(currentLimit)} pageviews · {currentInterval === 'year' ? 'yearly' : 'monthly'} billing.</>
                  ) : (
                    <>Currently on the free <span className="text-white font-medium">{formatPlanName(currentPlan)}</span> plan. Pick a plan below — you&apos;ll enter payment details on the next step.</>
                  )}
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
                    isSubscribed &&
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

          {/* Step 2a: Review & pay in place (mandate on file) */}
          {step === 1 && canChargeInPlace && (
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

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 rounded-none border border-neutral-700 bg-neutral-800/50 p-4">
                    <p className="text-micro-label uppercase text-neutral-500 mb-1">Current</p>
                    <p className="text-base font-semibold text-white">{formatPlanName(currentPlan)}</p>
                    <p className="text-sm text-neutral-400">{formatLimit(currentLimit)} pageviews</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {currentInterval === 'year' ? 'Yearly' : 'Monthly'} billing
                      {currentPricing ? ` · ${formatEuro(currentInterval === 'year' ? currentPricing.effectiveMonthly : currentPricing.monthly)}/mo` : ''}
                    </p>
                  </div>

                  <ArrowRight weight="bold" className="w-5 h-5 text-neutral-500 shrink-0" />

                  <div className="flex-1 rounded-none border border-brand-orange/50 bg-brand-orange/5 p-4">
                    <p className="text-micro-label uppercase text-brand-orange mb-1">New</p>
                    <p className="text-base font-semibold text-white">{formatPlanName(selectedPlan)}</p>
                    <p className="text-sm text-neutral-400">{formatLimit(selectedLimit)} pageviews</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {isYearly ? 'Yearly' : 'Monthly'} billing
                      {newPricing ? ` · ${formatEuro(isYearly ? newPricing.effectiveMonthly : newPricing.monthly)}/mo` : ''}
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
                    {(estimate.refund_amount ?? 0) > 0 && (
                      <p className="text-xs text-neutral-500 pt-1">
                        Refund will be returned to your original payment method.
                      </p>
                    )}
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
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Payment method</span>
                        <span className="text-white">On file</span>
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
                {estimate?.direction === 'upgrade' && (
                  <p className="text-center text-xs text-neutral-500">
                    You stay on this page — no checkout redirect, no onboarding screens.
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 2b: Checkout (no mandate on file — collect details, hand off
              to Mollie, return HERE via return_to:"switch") */}
          {step === 1 && !canChargeInPlace && (
            <motion.div
              key="checkout"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={TIMING}
              className="space-y-6"
            >
              <div className="text-center mb-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Complete your subscription
                </h1>
                <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
                  Review your plan and billing details before paying. You&apos;ll
                  return here when the payment is done.
                </p>
              </div>
              <div className="relative z-10">
                <PlanSummary
                  plan={selectedPlan}
                  interval={newInterval}
                  onIntervalChange={(iv) => setIsYearly(iv === 'year')}
                  limit={selectedLimit}
                  country={country}
                  vatId={vatId}
                  onCountryChange={(c) => { setCountry(c); setMissingFields((f) => f.filter((k) => k !== 'country')) }}
                  onVatIdChange={setVatId}
                  verifiedVatId={verifiedVatId}
                  onVerifiedVatIdChange={setVerifiedVatId}
                  businessName={businessName}
                  onBusinessNameChange={(v) => { setBusinessName(v); setMissingFields((f) => f.filter((k) => k !== 'business_name')) }}
                  billingEmail={billingEmail}
                  onBillingEmailChange={(v) => { setBillingEmail(v); setMissingFields((f) => f.filter((k) => k !== 'billing_email')) }}
                  address={address}
                  onAddressChange={(v) => { setAddress(v); setMissingFields((f) => f.filter((k) => k !== 'address')) }}
                  city={city}
                  onCityChange={(v) => { setCity(v); setMissingFields((f) => f.filter((k) => k !== 'city')) }}
                  postalCode={postalCode}
                  onPostalCodeChange={(v) => { setPostalCode(v); setMissingFields((f) => f.filter((k) => k !== 'postal_code')) }}
                  missingFields={missingFields}
                />
              </div>
              <div className="relative z-0">
                <PaymentForm
                  plan={selectedPlan}
                  interval={newInterval}
                  limit={selectedLimit}
                  country={country}
                  vatId={vatId}
                  verifiedVatId={verifiedVatId}
                  businessName={businessName}
                  billingEmail={billingEmail}
                  address={address}
                  city={city}
                  postalCode={postalCode}
                  onMissingFields={setMissingFields}
                  returnTo="switch"
                />
              </div>
              <button
                type="button"
                onClick={() => setStep(0)}
                className="w-full text-center text-sm text-neutral-500 hover:text-neutral-400 transition-colors"
              >
                Back to plan selection
              </button>
            </motion.div>
          )}

          {/* Step 3: Done (in-place changes only — checkout-mode confirmation
              renders through the payment state machine above) */}
          {step === 2 && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={TIMING}
            >
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  {changePending ? 'Change pending' : estimate?.direction === 'downgrade' ? 'Change scheduled' : 'Plan updated'}
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
                ) : estimate?.direction === 'downgrade' ? (
                  <>
                    {/* A scheduled change is a fact about the FUTURE. The old copy
                        said "You're now on <new plan>" while the backend had only
                        scheduled it — the estimate screen one step earlier said
                        the opposite (F-B17). */}
                    <ClockCountdown weight="fill" className="w-12 h-12 mx-auto mb-4 text-neutral-300" />
                    <h2 className="text-xl font-semibold text-white mb-2">
                      Plan change scheduled
                    </h2>
                    <p className="text-sm text-neutral-400">
                      You stay on {formatPlanName(currentPlan)} until{' '}
                      {formatEstimateDate(estimate.current_plan_end) || 'the end of the paid period'}, then move to{' '}
                      {formatPlanName(selectedPlan)} ({formatLimit(selectedLimit)} pageviews, {isYearly ? 'yearly' : 'monthly'} billing). Nothing else to do.
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
                  <Button variant="default" className="text-sm" onClick={() => router.push('/settings/organization/billing')}>
                    Back to billing
                  </Button>
                  <Button variant="secondary" className="text-sm" onClick={() => router.push('/')}>
                    Go to dashboard
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
