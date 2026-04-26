'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import useSWR from 'swr'
import { Check } from '@phosphor-icons/react'
import { useSetup } from '@/lib/setup/context'
import { useSubscription } from '@/lib/swr/dashboard'
import { getPrices } from '@/lib/api/billing'
import { TRAFFIC_TIERS } from '@/lib/plans'
import PlanSummary from '@/components/checkout/PlanSummary'
import PaymentForm from '@/components/checkout/PaymentForm'
import { Button, Spinner } from '@ciphera-net/ui'
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

const DEFAULT_LIMIT = 10_000

export default function SetupPlanPage() {
  const router = useRouter()
  const { pendingPlan, completeStep } = useSetup()
  const { data: subscription } = useSubscription()
  const { data: prices } = useSWR('plan-prices', getPrices)

  const [selectedPlan, setSelectedPlan] = useState<string | null>(pendingPlan?.planId ?? null)
  const [isYearly, setIsYearly] = useState(pendingPlan?.interval === 'year')
  const [selectedLimit, setSelectedLimit] = useState<number>(pendingPlan?.limit ?? DEFAULT_LIMIT)
  const [country, setCountry] = useState('')
  const [vatId, setVatId] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [billingEmail, setBillingEmail] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [postalCode, setPostalCode] = useState('')

  useEffect(() => {
    if (
      subscription?.subscription_status === 'active' ||
      subscription?.subscription_status === 'trialing'
    ) {
      completeStep('plan')
      router.replace('/setup/done')
    }
  }, [subscription, completeStep, router])

  const handleSkip = () => {
    completeStep('plan')
    router.push('/setup/done')
  }

  const handlePaymentSuccess = () => {
    completeStep('plan')
    router.push('/setup/done')
  }

  const getPrice = (planId: string) => {
    const baseCents = prices?.[planId]?.[selectedLimit]
    if (!baseCents) return null
    const monthly = baseCents / 100
    const yearlyTotal = Math.round((monthly * 11) * 100) / 100
    const effectiveMonthly = Math.round((yearlyTotal / 12) * 100) / 100
    return { monthly, effectiveMonthly, yearlyTotal }
  }

  const selectedInterval = isYearly ? 'year' as const : 'month' as const

  return (
    <>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Choose your plan
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          Start free or pick a plan that fits. You can change anytime.
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
            <PlanSummary
              plan={selectedPlan}
              interval={selectedInterval}
              limit={selectedLimit}
              country={country}
              vatId={vatId}
              onCountryChange={setCountry}
              onVatIdChange={setVatId}
              businessName={businessName}
              onBusinessNameChange={setBusinessName}
              billingEmail={billingEmail}
              onBillingEmailChange={setBillingEmail}
              address={address}
              onAddressChange={setAddress}
              city={city}
              onCityChange={setCity}
              postalCode={postalCode}
              onPostalCodeChange={setPostalCode}
            />
            <PaymentForm
              plan={selectedPlan}
              interval={selectedInterval}
              limit={selectedLimit}
              country={country}
              vatId={vatId}
              onSuccess={handlePaymentSuccess}
              businessName={businessName}
              billingEmail={billingEmail}
              address={address}
              city={city}
              postalCode={postalCode}
            />
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
            {/* Free plan — prominent */}
            <button
              type="button"
              onClick={handleSkip}
              className="w-full text-left p-4 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/70 hover:bg-emerald-500/10 transition-all mb-6"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">Hobby</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      Recommended
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
                    <Check className="w-3 h-3 text-emerald-400" weight="bold" />
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
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      plan.popular
                        ? 'border-brand-orange/40 bg-brand-orange/5 hover:border-brand-orange/70'
                        : 'border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{plan.name}</span>
                          {plan.popular && (
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
          </motion.div>
        )}
      </AnimatePresence>

    </>
  )
}
