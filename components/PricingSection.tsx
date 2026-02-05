'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, CheckCircleIcon } from '@ciphera-net/ui'
import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { toast } from '@ciphera-net/ui'
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

export default function PricingSection() {
  const searchParams = useSearchParams()
  const [isYearly, setIsYearly] = useState(false)
  const [sliderIndex, setSliderIndex] = useState(2) // Default to 100k (index 2)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const { user } = useAuth()

  // * Show toast when redirected from Stripe Checkout with canceled=true
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
        console.error('Failed to parse pending checkout', e)
        localStorage.removeItem('pulse_pending_checkout')
      }
    }
  }, [user])

  const currentTraffic = TRAFFIC_TIERS[sliderIndex]

  // Helper to get all price details
  const getPriceDetails = (planId: string) => {
    // @ts-ignore
    const basePrice = currentTraffic.prices[planId]
    
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
    try {
      setLoadingPlan(planId)
      
      // 1. If not logged in, redirect to login/signup
      if (!user) {
        // Store checkout intent
        const intent = {
          planId,
          interval: isYearly ? 'year' : 'month',
          limit: currentTraffic.value,
          sliderIndex, // Store UI state to restore it
          isYearly     // Store UI state to restore it
        }
        localStorage.setItem('pulse_pending_checkout', JSON.stringify(intent))
        
        initiateOAuthFlow() 
        return
      }

      // 2. Call backend to create checkout session
      const interval = options?.interval || (isYearly ? 'year' : 'month')
      const limit = options?.limit || currentTraffic.value

      const { url } = await createCheckoutSession({
        plan_id: planId,
        interval,
        limit,
      })

      // 3. Redirect to Stripe Checkout
      if (url) {
        window.location.href = url
      } else {
        throw new Error('No checkout URL returned')
      }

    } catch (error: any) {
      console.error('Checkout error:', error)
      toast.error('Failed to start checkout. Please try again.')
    } finally {
      setLoadingPlan(null)
    }
  }

  return (
    <section className="py-24 px-4 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 dark:text-white mb-6 tracking-tight">
          Transparent Pricing
        </h2>
        <p className="text-xl text-neutral-600 dark:text-neutral-400">
          Scale with your traffic. No hidden fees.
        </p>
      </div>

      {/* Unified Container */}
      <div className="max-w-6xl mx-auto border border-neutral-200 dark:border-neutral-800 rounded-3xl bg-white/50 dark:bg-neutral-900/50 backdrop-blur-xl shadow-sm overflow-hidden mb-20">
        
        {/* Top Toolbar */}
        <div className="p-8 border-b border-neutral-200 dark:border-neutral-800 flex flex-col md:flex-row items-center justify-between gap-8 bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="w-full md:w-2/3">
            <div className="flex justify-between text-sm font-medium text-neutral-500 mb-4">
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
              className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer dark:bg-neutral-700 accent-brand-orange"
            />
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium uppercase tracking-wide">
              Get 1 month free with yearly
            </span>
            <div className="bg-neutral-200 dark:bg-neutral-800 p-1 rounded-lg flex">
              <button
                onClick={() => setIsYearly(false)}
                className={`min-w-[88px] px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  !isYearly
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setIsYearly(true)}
                className={`min-w-[88px] px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  isYearly
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Yearly
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Grid */}
        <div className="grid md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-neutral-200 dark:divide-neutral-800">
          {PLANS.map((plan) => {
            const priceDetails = getPriceDetails(plan.id)
            const isTeam = plan.id === 'team'

            return (
              <div key={plan.id} className={`p-8 flex flex-col relative transition-colors ${isTeam ? 'bg-brand-orange/[0.02]' : 'hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50'}`}>
                {isTeam && (
                  <>
                    <div className="absolute top-0 left-0 w-full h-1 bg-brand-orange" />
                    <div className="absolute top-4 right-4 bg-brand-orange/10 text-brand-orange text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide">
                      Most Popular
                    </div>
                  </>
                )}
                
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">{plan.name}</h3>
                  <p className="text-sm text-neutral-500 min-h-[40px] mb-4">{plan.description}</p>
                  
                  {priceDetails ? (
                    isYearly ? (
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-neutral-900 dark:text-white">
                            €{priceDetails.yearlyTotal}
                          </span>
                          <span className="text-neutral-500 font-medium">/year</span>
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
                        <span className="text-4xl font-bold text-neutral-900 dark:text-white">
                          €{priceDetails.baseMonthly}
                        </span>
                        <span className="text-neutral-500 font-medium">/mo</span>
                      </div>
                    )
                  ) : (
                    <div className="text-4xl font-bold text-neutral-900 dark:text-white">
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
                    <li key={feature} className="flex items-start gap-3 text-sm text-neutral-600 dark:text-neutral-400">
                      <CheckCircleIcon className={`w-5 h-5 shrink-0 ${isTeam ? 'text-brand-orange' : 'text-neutral-400'}`} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}

          {/* Enterprise Section */}
          <div className="p-8 bg-neutral-50/50 dark:bg-neutral-900/50 flex flex-col">
            <div className="mb-8">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">Enterprise</h3>
              <p className="text-sm text-neutral-500 min-h-[40px] mb-4">For high volume sites and custom needs</p>
              <div className="text-4xl font-bold text-neutral-900 dark:text-white">
                Custom
              </div>
            </div>

            <Button variant="secondary" className="w-full mb-8 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800">
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
                <li key={feature} className="flex items-start gap-3 text-sm text-neutral-600 dark:text-neutral-400">
                  <CheckCircleIcon className="w-5 h-5 text-neutral-400 shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
