'use client'

import { useState } from 'react'
import { Button, CheckCircleIcon } from '@ciphera-net/ui'

// Pricing Tiers Configuration
const TIERS = [
  {
    name: 'Starter',
    description: 'For personal sites and startups',
    basePrice: 9, // Base price for lowest tier
    features: [
      '1 site',
      '1 year data retention',
      'Email reports',
      '100% Data ownership'
    ]
  },
  {
    name: 'Growth',
    description: 'For growing businesses',
    basePrice: 19,
    features: [
      'Up to 3 sites',
      '3 years data retention',
      'Team dashboard',
      'Shared links'
    ]
  },
  {
    name: 'Business',
    description: 'For large organizations',
    basePrice: 49,
    features: [
      'Up to 10 sites',
      'Unlimited data retention',
      'Priority support',
      'Custom events'
    ]
  }
]

// Slider Steps (Pageviews)
const TRAFFIC_TIERS = [
  { label: '10k', value: 10000, multiplier: 1 },
  { label: '100k', value: 100000, multiplier: 2 },
  { label: '500k', value: 500000, multiplier: 5 },
  { label: '1M', value: 1000000, multiplier: 8 },
  { label: '10M+', value: 10000000, multiplier: 15 },
]

export default function PricingSection() {
  const [isYearly, setIsYearly] = useState(false)
  const [sliderIndex, setSliderIndex] = useState(2) // Default to middle tier (500k)

  const currentTraffic = TRAFFIC_TIERS[sliderIndex]

  const calculatePrice = (basePrice: number, multiplier: number) => {
    let price = basePrice * multiplier
    if (isYearly) {
      price = price * 0.8 // 20% discount (approx 2 months free)
    }
    return Math.round(price)
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
        {TIERS.map((tier) => (
          <div key={tier.name} className="card-glass p-8 flex flex-col relative overflow-hidden">
            <div className="mb-8">
              <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">{tier.name}</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-neutral-900 dark:text-white">
                  €{calculatePrice(tier.basePrice, currentTraffic.multiplier)}
                </span>
                <span className="text-neutral-500">/{isYearly ? 'mo' : 'month'}</span>
              </div>
              {isYearly && (
                <p className="text-xs text-brand-orange mt-2">Billed yearly</p>
              )}
            </div>

            <Button className="w-full mb-8 bg-brand-orange hover:bg-brand-orange/90 text-white">
              Start free trial
            </Button>

            <ul className="space-y-4 flex-grow">
              {tier.features.map((feature) => (
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
