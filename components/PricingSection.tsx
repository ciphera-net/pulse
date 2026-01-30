'use client'

import { useState } from 'react'
import { Button, CheckCircleIcon } from '@ciphera-net/ui'

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
      '3 years data retention',
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
      'Unlimited data retention',
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
  const [isYearly, setIsYearly] = useState(false)
  const [sliderIndex, setSliderIndex] = useState(2) // Default to 100k (index 2)

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

  return (
    <section className="py-24 px-4 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 dark:text-white mb-6 tracking-tight">
          Transparent Pricing
        </h2>
        <p className="text-xl text-neutral-600 dark:text-neutral-400">
          Scale with your traffic. No hidden fees.
        </p>
      </div>

      {/* Unified Container */}
      <div className="max-w-7xl mx-auto border border-neutral-200 dark:border-neutral-800 rounded-3xl bg-white/50 dark:bg-neutral-900/50 backdrop-blur-xl shadow-sm overflow-hidden mb-20">
        
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

          <div className="bg-neutral-200 dark:bg-neutral-800 p-1 rounded-lg flex shrink-0">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                !isYearly 
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                isYearly 
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Yearly
              <span className="text-[10px] bg-brand-orange/10 text-brand-orange px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
                1 month free
              </span>
            </button>
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
                  className={`w-full mb-8 ${
                    isTeam 
                      ? 'bg-brand-orange hover:bg-brand-orange/90 text-white shadow-lg shadow-brand-orange/20' 
                      : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100'
                  }`}
                >
                  Start free trial
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
