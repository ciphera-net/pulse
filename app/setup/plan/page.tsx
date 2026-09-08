'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, WarningCircle } from '@phosphor-icons/react'
import { useSetup } from '@/lib/setup/context'
import { useSubscription } from '@/lib/swr/dashboard'
import { getPrices } from '@/lib/api/billing'
import useSWR from 'swr'
import { PLAN_CATALOG, getPlanPricing } from '@/lib/plans'
import TierSlider from '@/components/billing/TierSlider'
import PlanChoiceCard from '@/components/billing/PlanChoiceCard'
import PlanSummary from '@/components/checkout/PlanSummary'
import PaymentForm from '@/components/checkout/PaymentForm'
import { Button, Switcher, toast } from '@ciphera-net/facet'
import { TIMING } from '@/lib/motion'

const DEFAULT_LIMIT = 10_000

export default function SetupPlanPage() {
  const router = useRouter()
  const { pendingPlan, completeStep } = useSetup()
  const { data: subscription } = useSubscription()
  const { data: prices, error: pricesError, isLoading: pricesLoading, isValidating: pricesValidating, mutate: retryPrices } = useSWR('plan-prices', getPrices)
  const planRefs = useRef<(HTMLButtonElement | null)[]>([])

  const [selectedPlan, setSelectedPlan] = useState<string | null>(pendingPlan?.planId ?? null)
  const [isYearly, setIsYearly] = useState(pendingPlan?.interval === 'year')
  const [selectedLimit, setSelectedLimit] = useState<number>(pendingPlan?.limit ?? DEFAULT_LIMIT)
  const [country, setCountry] = useState('')
  const [vatId, setVatId] = useState('')
  const [verifiedVatId, setVerifiedVatId] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [billingEmail, setBillingEmail] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [missingFields, setMissingFields] = useState<string[]>([])

  useEffect(() => {
    if (
      subscription?.subscription_status === 'active' ||
      subscription?.subscription_status === 'trialing'
    ) {
      completeStep('plan')
      router.replace('/setup/done')
    }
  }, [subscription, completeStep, router])

  // Mollie's cancelUrl lands here with ?canceled=true when the customer backs
  // out of the hosted checkout — acknowledge it instead of showing the plan
  // picker as if nothing happened. (window.location, not useSearchParams, to
  // avoid the prerender Suspense requirement.)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('canceled') === 'true') {
      toast.info("Checkout was canceled. You can try again whenever you're ready.")
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // 🔴 REFILL THE BILLING DETAILS FROM SERVER TRUTH AFTER A CANCELLED PAYMENT.
  //
  // Going to Mollie is a full document navigation, so the app unmounts and
  // every answer typed into this form dies with it. Coming back, the person met
  // an empty form and had to enter all six fields again — which is the moment
  // they were already having second thoughts (finding #18).
  //
  // Nothing is stored in the browser to achieve this: the checkout handler
  // persists these with UpdateBillingProfile BEFORE it ever redirects, so they
  // are already server-side and simply were not read back. The plan, interval
  // and limit come home in the cancel URL instead, via pendingPlan.
  //
  // ⚠️ ONE SHOT, and never over something already typed. The functional form
  // is what makes the second condition true — a plain setState here would
  // clobber an in-flight edit if the subscription resolved late.
  const billingRefilled = useRef(false)
  useEffect(() => {
    if (!subscription || billingRefilled.current) return
    billingRefilled.current = true
    setBusinessName((v) => v || subscription.business_name || '')
    setBillingEmail((v) => v || subscription.billing_email || '')
    setAddress((v) => v || subscription.billing_address || '')
    setCity((v) => v || subscription.billing_city || '')
    setPostalCode((v) => v || subscription.billing_postal_code || '')
    setCountry((v) => v || subscription.billing_country || '')
    setVatId((v) => v || subscription.tax_id?.value || '')
  }, [subscription])

  const handleSkip = () => {
    completeStep('plan')
    router.push('/setup/done')
  }

  const onPlanKeyDown = (e: React.KeyboardEvent, index: number) => {
    let target: number | null = null
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') target = (index + 1) % PLAN_CATALOG.length
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') target = (index - 1 + PLAN_CATALOG.length) % PLAN_CATALOG.length
    if (target === null) return
    e.preventDefault()
    setSelectedPlan(PLAN_CATALOG[target].id)
    planRefs.current[target]?.focus()
  }

  const selectedInterval = isYearly ? 'year' as const : 'month' as const

  return (
    <div className="pb-20 sm:pb-0">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {selectedPlan ? 'Complete your subscription' : 'Choose your plan'}
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          {selectedPlan
            ? 'Review your plan and billing details before paying.'
            : 'Start free or pick a plan that fits. You can change anytime.'}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {selectedPlan ? (
          <motion.div
            key="checkout"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={TIMING}
            className="space-y-6"
          >
            <div className="relative z-10">
              <PlanSummary
                plan={selectedPlan}
                interval={selectedInterval}
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
                interval={selectedInterval}
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
              />
            </div>
            <button
              type="button"
              onClick={() => setSelectedPlan(null)}
              className="w-full text-center text-sm text-neutral-500 hover:text-neutral-400 transition-colors"
            >
              Back to plan selection
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="selection"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={TIMING}
          >
            {/* Free plan — the zero-friction path, styled as a fact, not a nudge */}
            <button
              type="button"
              onClick={handleSkip}
              className="w-full text-left p-4 rounded-none border border-neutral-800 bg-neutral-900 hover:border-neutral-700 hover:bg-neutral-800/50 transition-all duration-base ease-apple mb-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">Hobby</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-300 bg-neutral-800 border border-neutral-700 px-1.5 py-0.5 rounded-none">
                      Free forever
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">Start free, upgrade when you need more</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-lg font-bold text-white">€0</span>
                  <span className="text-xs text-neutral-500">/mo</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {['1 site', '5k pageviews', 'Custom events', 'No credit card'].map((f) => (
                  <span key={f} className="flex items-center gap-1 text-xs text-neutral-400">
                    <Check className="w-3 h-3 text-brand-orange" weight="bold" />
                    {f}
                  </span>
                ))}
              </div>
            </button>

            <div className="relative flex items-center justify-center mb-6">
              <div className="h-px flex-1 bg-neutral-800" />
              <span className="px-3 text-xs text-neutral-600">or pick a paid plan</span>
              <div className="h-px flex-1 bg-neutral-800" />
            </div>

            {/* Billing interval */}
            <div className="flex flex-col items-center gap-2 mb-6">
              <Switcher
                size="sm"
                tone="solid"
                aria-label="Billing interval"
                options={[
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'yearly', label: 'Yearly' },
                ]}
                value={isYearly ? 'yearly' : 'monthly'}
                onChange={(v) => setIsYearly(v === 'yearly')}
              />
              {/* The incentive is a note beside the control, never inside the selected segment
                  (orange text on the orange thumb is invisible) — the pricing page's own shape. */}
              <span className="text-xs text-neutral-500">1 month free with yearly</span>
            </div>

            {/* Traffic tier */}
            <div className="mb-6">
              <label className="block text-micro-label uppercase text-neutral-500 mb-3 text-center">
                Monthly pageviews
              </label>
              <TierSlider value={selectedLimit} onChange={setSelectedLimit} />
            </div>

            {/* Plan cards */}
            {pricesError ? (
              <div className="rounded-none border border-red-900/50 bg-red-950/20 p-6 text-center">
                <WarningCircle size={20} weight="fill" className="text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-300 mb-4">Couldn&apos;t load plan pricing. Please try again.</p>
                <Button variant="secondary" className="text-sm" disabled={pricesValidating} onClick={() => retryPrices()}>
                  {pricesValidating ? 'Retrying...' : 'Retry'}
                </Button>
              </div>
            ) : (
              <div role="radiogroup" aria-label="Choose a paid plan" className="space-y-3">
                {PLAN_CATALOG.map((plan, i) => {
                  const selected = selectedPlan === plan.id
                  return (
                    <PlanChoiceCard
                      key={plan.id}
                      ref={(el) => { planRefs.current[i] = el }}
                      plan={plan}
                      price={getPlanPricing(prices, plan.id, selectedLimit)}
                      priceLoading={pricesLoading || pricesValidating}
                      isYearly={isYearly}
                      role="radio"
                      aria-checked={selected}
                      aria-label={plan.name}
                      tabIndex={selected || (!selectedPlan && i === 0) ? 0 : -1}
                      onClick={() => setSelectedPlan(plan.id)}
                      onKeyDown={(e) => onPlanKeyDown(e, i)}
                    />
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
