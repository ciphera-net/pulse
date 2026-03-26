'use client'

import { useState, useEffect } from 'react'
import { logger } from '@/lib/utils/logger'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Button, CheckCircleIcon } from '@ciphera-net/ui'
import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { toast } from '@ciphera-net/ui'
import { COUNTRY_OPTIONS } from '@/lib/countries'
import { createCheckoutSession } from '@/lib/api/billing'

// 1. Define Plans with IDs and Site Limits
const PLANS = [
  {
    id: 'solo',
    name: 'Solo',
    description: 'For personal sites and freelancers',
    features: [
      '1 site',
      '1 year data retention',
      'Email reports',
      '100% Data ownership'
    ]
  },
  {
    id: 'team',
    name: 'Team',
    description: 'For startups and growing agencies',
    features: [
      'Up to 5 sites',
      '2 year data retention',
      'Team dashboard',
      'Shared links'
    ]
  },
  {
    id: 'business',
    name: 'Business',
    description: 'For large organizations',
    features: [
      'Up to 10 sites',
      '3 years data retention',
      'Priority support',
      'Custom events'
    ]
  }
]

// 2. Define Explicit Pricing per Tier (approx 20% cheaper than Plausible)
// Includes intermediate steps: 50k, 250k, 2.5M
const TRAFFIC_TIERS = [
  { 
    label: '10k', 
    value: 10000, 
    prices: { solo: 7, team: 11, business: 15 } 
  },
  { 
    label: '50k', 
    value: 50000, 
    prices: { solo: 11, team: 19, business: 27 } 
  },
  { 
    label: '100k', 
    value: 100000, 
    prices: { solo: 15, team: 23, business: 31 } 
  },
  { 
    label: '250k', 
    value: 250000, 
    prices: { solo: 25, team: 39, business: 59 } 
  },
  { 
    label: '500k', 
    value: 500000, 
    prices: { solo: 39, team: 59, business: 79 } 
  },
  { 
    label: '1M', 
    value: 1000000, 
    prices: { solo: 55, team: 79, business: 111 } 
  },
  { 
    label: '2.5M', 
    value: 2500000, 
    prices: { solo: 79, team: 119, business: 169 } 
  },
  { 
    label: '5M', 
    value: 5000000, 
    prices: { solo: 103, team: 155, business: 207 } 
  },
  { 
    label: '10M', 
    value: 10000000, 
    prices: { solo: 135, team: 199, business: 269 } 
  },
  { 
    label: '10M+', 
    value: 10000001, 
    prices: { solo: null, team: null, business: null } 
  },
]

const PRICING_COUNTRY_OPTIONS = [
  ...COUNTRY_OPTIONS.map((c) => ({ code: c.value, label: c.label })),
  { code: 'OTHER', label: 'Other' },
]

export default function PricingSection() {
  const searchParams = useSearchParams()
  const [isYearly, setIsYearly] = useState(false)
  const [sliderIndex, setSliderIndex] = useState(2) // Default to 100k (index 2)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [checkoutCountry, setCheckoutCountry] = useState('')
  const [checkoutVatId, setCheckoutVatId] = useState('')
  const [showCheckoutForm, setShowCheckoutForm] = useState(false)
  const [pendingCheckout, setPendingCheckout] = useState<{ planId: string; interval: string; limit: number } | null>(null)
  const { user } = useAuth()

  // * Show toast when redirected from Mollie Checkout with canceled=true
  useEffect(() => {
    if (searchParams.get('canceled') === 'true') {
      toast.info('Checkout was canceled. You can try again whenever you’re ready.')
      const url = new URL(window.location.href)
      url.searchParams.delete('canceled')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }, [searchParams])

  // * Check for pending checkout on mount/auth
  useEffect(() => {
    if (!user) return

    const pendingCheckout = localStorage.getItem('pulse_pending_checkout')
    if (pendingCheckout) {
      try {
        const intent = JSON.parse(pendingCheckout)
        
        // Restore UI state
        if (typeof intent.sliderIndex === 'number') setSliderIndex(intent.sliderIndex)
        if (typeof intent.isYearly === 'boolean') setIsYearly(intent.isYearly)
        
        // Trigger checkout
        handleSubscribe(intent.planId, {
          interval: intent.interval,
          limit: intent.limit
        })
        
        // Clear intent
        localStorage.removeItem('pulse_pending_checkout')
      } catch (e) {
        logger.error('Failed to parse pending checkout', e)
        localStorage.removeItem('pulse_pending_checkout')
      }
    }
  }, [user])

  const currentTraffic = TRAFFIC_TIERS[sliderIndex]

  // Helper to get all price details
  const getPriceDetails = (planId: string) => {
    const basePrice = currentTraffic.prices[planId as keyof typeof currentTraffic.prices]
    
    // Handle "Custom"
    if (basePrice === null || basePrice === undefined) return null
    
    const yearlyTotal = basePrice * 11 // 1 month free (pay for 11)
    const effectiveMonthly = Math.round(yearlyTotal / 12)
    
    return {
      baseMonthly: basePrice,
      yearlyTotal: yearlyTotal,
      effectiveMonthly: effectiveMonthly
    }
  }

  const handleSubscribe = async (planId: string, options?: { interval?: string, limit?: number }) => {
    // 1. If not logged in, redirect to login/signup
    if (!user) {
      const intent = {
        planId,
        interval: isYearly ? 'year' : 'month',
        limit: currentTraffic.value,
        sliderIndex,
        isYearly
      }
      localStorage.setItem('pulse_pending_checkout', JSON.stringify(intent))
      initiateOAuthFlow()
      return
    }

    // 2. Show checkout form to collect country + optional VAT
    const interval = options?.interval || (isYearly ? 'year' : 'month')
    const limit = options?.limit || currentTraffic.value
    setPendingCheckout({ planId, interval, limit })
    setCheckoutCountry('')
    setCheckoutVatId('')
    setShowCheckoutForm(true)
  }

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingCheckout || !checkoutCountry) return

    try {
      setLoadingPlan(pendingCheckout.planId)

      const { url } = await createCheckoutSession({
        plan_id: pendingCheckout.planId,
        interval: pendingCheckout.interval,
        limit: pendingCheckout.limit,
        country: checkoutCountry,
        vat_id: checkoutVatId || undefined,
      })

      if (url) {
        window.location.href = url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (error: unknown) {
      logger.error('Checkout error:', error)
      toast.error('Failed to start checkout — please try again')
    } finally {
      setLoadingPlan(null)
    }
  }

  const handleCheckoutCancel = () => {
    setShowCheckoutForm(false)
    setPendingCheckout(null)
    setCheckoutCountry('')
    setCheckoutVatId('')
    setLoadingPlan(null)
  }

  return (
    <section className="py-24 px-4 max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <h2 className="text-3xl font-bold text-white mb-4">
          Transparent Pricing
        </h2>
        <p className="text-lg text-neutral-400">
          Scale with your traffic. No hidden fees.
        </p>
      </motion.div>

      {/* Unified Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="max-w-6xl mx-auto border border-neutral-800 rounded-2xl bg-neutral-900/50 backdrop-blur-xl shadow-sm overflow-hidden mb-20"
      >
        
        {/* Top Toolbar */}
        <div className="p-6 border-b border-neutral-800 flex flex-col md:flex-row items-center justify-between gap-8 bg-neutral-900/50">
          <div className="w-full md:w-2/3">
            <div className="flex justify-between text-sm font-medium text-neutral-400 mb-4">
              <span>10k</span>
              <span className="text-brand-orange font-bold text-lg">
                Up to {currentTraffic.label} monthly pageviews
              </span>
              <span>10M+</span>
            </div>
            <input
              type="range"
              min="0"
              max={TRAFFIC_TIERS.length - 1}
              step="1"
              value={sliderIndex}
              onChange={(e) => setSliderIndex(parseInt(e.target.value))}
              aria-label="Monthly pageview limit"
              aria-valuetext={`${currentTraffic.label} pageviews per month`}
              className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2"
            />
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
              Get 1 month free with yearly
            </span>
            <div className="bg-neutral-800 p-1 rounded-lg flex" role="radiogroup" aria-label="Billing interval">
              <button
                onClick={() => setIsYearly(false)}
                role="radio"
                aria-checked={!isYearly}
                className={`min-w-[88px] px-4 py-2 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange ${
                  !isYearly
                    ? 'bg-neutral-700 text-white shadow-sm'
                    : 'text-neutral-500 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setIsYearly(true)}
                role="radio"
                aria-checked={isYearly}
                className={`min-w-[88px] px-4 py-2 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange ${
                  isYearly
                    ? 'bg-neutral-700 text-white shadow-sm'
                    : 'text-neutral-500 hover:text-white'
                }`}
              >
                Yearly
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Grid */}
        <div className="grid md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-neutral-800">
          {/* Free Plan */}
          <div className="p-6 flex flex-col relative transition-colors hover:bg-neutral-800/50">
            <div className="mb-8">
              <h3 className="text-lg font-bold text-white mb-2">Free</h3>
              <p className="text-sm text-neutral-400 min-h-[40px] mb-4">For trying Pulse on a personal project</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white">€0</span>
                <span className="text-neutral-400 font-medium">/forever</span>
              </div>
            </div>

            <Button
              onClick={() => {
                if (!user) {
                  initiateOAuthFlow()
                  return
                }
                window.location.href = '/'
              }}
              variant="secondary"
              className="w-full mb-8"
            >
              Get started
            </Button>

            <ul className="space-y-4 flex-grow">
              {['1 site', '5k monthly pageviews', '6 months data retention', '100% Data ownership'].map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm text-neutral-400">
                  <CheckCircleIcon className="w-5 h-5 shrink-0 text-neutral-400" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {PLANS.map((plan) => {
            const priceDetails = getPriceDetails(plan.id)
            const isTeam = plan.id === 'team'

            return (
              <div key={plan.id} className={`p-6 flex flex-col relative transition-colors ${isTeam ? 'bg-brand-orange/[0.02]' : 'hover:bg-neutral-800/50'}`}>
                {isTeam && (
                  <>
                    <div className="absolute top-0 left-0 w-full h-1 bg-brand-orange" />
                    <span className="absolute top-4 right-4 badge-primary">
                      Most Popular
                    </span>
                  </>
                )}
                
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-white mb-2">{plan.name}</h3>
                  <p className="text-sm text-neutral-400 min-h-[40px] mb-4">{plan.description}</p>
                  
                  {priceDetails ? (
                    isYearly ? (
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-white">
                            €{priceDetails.yearlyTotal}
                          </span>
                          <span className="text-neutral-400 font-medium">/year</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-sm font-medium">
                          <span className="text-neutral-400 line-through decoration-neutral-400">
                            €{priceDetails.baseMonthly}/mo
                          </span>
                          <span className="text-brand-orange">
                            €{priceDetails.effectiveMonthly}/mo
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-white">
                          €{priceDetails.baseMonthly}
                        </span>
                        <span className="text-neutral-400 font-medium">/mo</span>
                      </div>
                    )
                  ) : (
                    <div className="text-4xl font-bold text-white">
                      Custom
                    </div>
                  )}
                </div>

                <Button 
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={loadingPlan === plan.id || !!loadingPlan || !priceDetails}
                  variant={isTeam ? 'primary' : 'secondary'}
                  className="w-full mb-8"
                >
                  {loadingPlan === plan.id ? 'Loading...' : !priceDetails ? 'Contact us' : 'Start free trial'}
                </Button>

                <ul className="space-y-4 flex-grow">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-neutral-400">
                      <CheckCircleIcon className={`w-5 h-5 shrink-0 ${isTeam ? 'text-brand-orange' : 'text-neutral-400'}`} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}

          {/* Enterprise Section */}
          <div className="p-6 bg-neutral-900/50 flex flex-col">
            <div className="mb-8">
              <h3 className="text-lg font-bold text-white mb-2">Enterprise</h3>
              <p className="text-sm text-neutral-400 min-h-[40px] mb-4">For high volume sites and custom needs</p>
              <div className="text-4xl font-bold text-white">
                Custom
              </div>
            </div>

            <Button
              variant="secondary"
              className="w-full mb-8"
              onClick={() => { window.location.href = 'mailto:business@ciphera.net?subject=Enterprise%20Plan%20Inquiry' }}
            >
              Contact us
            </Button>

            <ul className="space-y-4">
              {[
                'Everything in Business',
                '10+ sites',
                'Unlimited team members',
                'SLA & Priority Support',
                'Managed Proxy',
                'Raw data export'
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm text-neutral-400">
                  <CheckCircleIcon className="w-5 h-5 text-neutral-400 shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </motion.div>

      {/* Checkout Country / VAT Modal */}
      {showCheckoutForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={handleCheckoutCancel}
          />
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-md border border-neutral-800 rounded-2xl bg-neutral-900 p-6 shadow-xl"
          >
            <h3 className="text-lg font-bold text-white mb-1">
              Billing details
            </h3>
            <p className="text-sm text-neutral-400 mb-6">
              Select your country to calculate the correct tax rate.
            </p>

            <form onSubmit={handleCheckoutSubmit} className="space-y-4">
              {/* Country */}
              <div>
                <label htmlFor="checkout-country" className="block text-sm font-medium text-neutral-300 mb-1.5">
                  Country <span className="text-red-400">*</span>
                </label>
                <select
                  id="checkout-country"
                  required
                  value={checkoutCountry}
                  onChange={(e) => setCheckoutCountry(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange transition-colors"
                >
                  <option value="" disabled>Select a country</option>
                  {PRICING_COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* VAT ID */}
              <div>
                <label htmlFor="checkout-vat" className="block text-sm font-medium text-neutral-300 mb-1.5">
                  VAT ID <span className="text-neutral-500">(optional)</span>
                </label>
                <input
                  id="checkout-vat"
                  type="text"
                  value={checkoutVatId}
                  onChange={(e) => setCheckoutVatId(e.target.value)}
                  placeholder="e.g. BE0123456789"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange transition-colors"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!checkoutCountry || !!loadingPlan}
                  className="flex-1"
                >
                  {loadingPlan ? 'Loading...' : 'Continue to payment'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCheckoutCancel}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </section>
  )
}
