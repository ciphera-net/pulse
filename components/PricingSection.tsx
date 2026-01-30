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
    prices: { solo: 7, team: 12, business: 19 } 
  },
  { 
    label: '50k', 
    value: 50000, 
    prices: { solo: 11, team: 19, business: 29 } 
  },
  { 
    label: '100k', 
    value: 100000, 
    prices: { solo: 15, team: 25, business: 39 } 
  },
  { 
    label: '250k', 
    value: 250000, 
    prices: { solo: 25, team: 39, business: 59 } 
  },
  { 
    label: '500k', 
    value: 500000, 
    prices: { solo: 39, team: 59, business: 89 } 
  },
  { 
    label: '1M', 
    value: 1000000, 
    prices: { solo: 55, team: 79, business: 119 } 
  },
  { 
    label: '2.5M', 
    value: 2500000, 
    prices: { solo: 79, team: 119, business: 169 } 
  },
  { 
    label: '5M', 
    value: 5000000, 
    prices: { solo: 109, team: 159, business: 219 } 
  },
  { 
    label: '10M+', 
    value: 10000000, 
    prices: { solo: null, team: null, business: null } 
  },
]

export default function PricingSection() {
  const [isYearly, setIsYearly] = useState(false)
  const [sliderIndex, setSliderIndex] = useState(2) // Default to 100k (index 2)

  const currentTraffic = TRAFFIC_TIERS[sliderIndex]

  const calculatePrice = (planId: string) => {
    // @ts-ignore
    const basePrice = currentTraffic.prices[planId]
    
    // Handle "Custom" or missing prices
    if (basePrice === null || basePrice === undefined) return 'Custom'
    
    let price = basePrice
    if (isYearly) {
      price = price * 0.8 // 20% discount
    }
    return '€' + Math.round(price)
  }

  return (
    <section className="py-24 px-4 max-w-7xl mx-auto">
      <div className="text-center mb-16">
        <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 dark:text-white mb-6">
          Traffic based plans that match your growth
        </h2>
        <p className="text-xl text-neutral-600 dark:text-neutral-400">
          Sign up for 30-day free trial. No credit card required.
        </p>
      </div>

      {/* Controls Container */}
      <div className="max-w-3xl mx-auto mb-20 bg-neutral-100 dark:bg-neutral-800/50 rounded-2xl p-8 border border-neutral-200 dark:border-neutral-800">
        
        {/* Slider */}
        <div className="mb-12">
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

        {/* Toggle */}
        <div className="flex justify-center items-center gap-4">
          <span className={!isYearly ? 'text-neutral-900 dark:text-white font-medium' : 'text-neutral-500'}>Monthly</span>
          <button
            onClick={() => setIsYearly(!isYearly)}
            className="relative w-14 h-8 bg-neutral-200 dark:bg-neutral-700 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange/50"
          >
            <div
              className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                isYearly ? 'translate-x-6 bg-brand-orange' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={isYearly ? 'text-neutral-900 dark:text-white font-medium' : 'text-neutral-500'}>
            Yearly <span className="text-xs text-brand-orange bg-brand-orange/10 px-2 py-0.5 rounded-full ml-1">2 months free</span>
          </span>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid md:grid-cols-4 gap-6">
        {PLANS.map((plan) => (
          <div key={plan.id} className="card-glass p-8 flex flex-col relative overflow-hidden">
            <div className="mb-8">
              <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">{plan.name}</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-neutral-900 dark:text-white">
                  {calculatePrice(plan.id)}
                </span>
                {calculatePrice(plan.id) !== 'Custom' && (
                  <span className="text-neutral-500">/{isYearly ? 'mo' : 'month'}</span>
                )}
              </div>
              {isYearly && calculatePrice(plan.id) !== 'Custom' && (
                <p className="text-xs text-brand-orange mt-2">Billed yearly</p>
              )}
            </div>

            <Button className="w-full mb-8 bg-brand-orange hover:bg-brand-orange/90 text-white">
              Start free trial
            </Button>

            <ul className="space-y-4 flex-grow">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm text-neutral-600 dark:text-neutral-400">
                  <CheckCircleIcon className="w-5 h-5 text-brand-orange shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Enterprise Card (Dark Style) */}
        <div className="p-8 rounded-2xl bg-neutral-900 text-white border border-neutral-800 flex flex-col shadow-2xl">
          <div className="mb-8">
            <h3 className="text-lg font-medium text-white mb-2">Enterprise</h3>
            <div className="text-4xl font-bold text-white">Custom</div>
            <p className="text-neutral-400 mt-2 text-sm">For high volume sites</p>
          </div>

          <Button variant="secondary" className="w-full mb-8 bg-white text-neutral-900 hover:bg-neutral-100">
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
              <li key={feature} className="flex items-start gap-3 text-sm text-neutral-300">
                <CheckCircleIcon className="w-5 h-5 text-white shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
