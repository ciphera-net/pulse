'use client'

import { useState, useEffect } from 'react'
import { logger } from '@/lib/utils/logger'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Button, CheckCircleIcon } from '@ciphera-net/ui'
import { CreditCard, ArrowsClockwise, ShieldCheck, Check, Globe, Eye, LockSimple, Code, Scales } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { toast } from '@ciphera-net/ui'
import { useSubscription } from '@/lib/swr/dashboard'
import PricingFAQ from '@/components/marketing/PricingFAQ'
import CTASection from '@/components/marketing/CTASection'

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

const COMPARISON_FEATURES = [
  { feature: 'Sites', values: ['1', '1', 'Up to 5', 'Up to 10'] },
  { feature: 'Pageviews', values: ['5k/mo', 'Based on plan', 'Based on plan', 'Based on plan'] },
  { feature: 'Data retention', values: ['6 months', '1 year', '2 years', '3 years'] },
  { feature: 'Team members', values: ['1', '1', 'Unlimited', 'Unlimited'] },
  { feature: 'Custom events', values: [false, true, true, true] },
  { feature: 'Funnels', values: [false, false, true, true] },
  { feature: 'Uptime monitoring', values: [false, false, true, true] },
  { feature: 'API access', values: [false, false, true, true] },
  { feature: 'Email reports', values: [false, true, true, true] },
  { feature: 'Priority support', values: [false, false, false, true] },
]

export default function PricingSection() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isYearly, setIsYearly] = useState(true)
  const [sliderIndex, setSliderIndex] = useState(0) // Default to 10k (index 0)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const { user } = useAuth()
  const { data: subscription } = useSubscription()
  const currentPlanId = subscription?.plan_id || (user ? 'free' : null)

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

  const handleSubscribe = (planId: string, options?: { interval?: string, limit?: number }) => {
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

    // 2. Navigate to embedded checkout page
    const selectedInterval = options?.interval || (isYearly ? 'year' : 'month')
    const selectedLimit = options?.limit || currentTraffic.value
    router.push(`/checkout?plan=${planId}&interval=${selectedInterval}&limit=${selectedLimit}`)
  }

  return (
    <section className="pb-24 px-4 max-w-6xl mx-auto">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-16"
      >
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6">
          Transparent Pricing
        </h2>
        <p className="text-xl text-neutral-400 max-w-2xl mx-auto leading-relaxed">
          Scale with your traffic. No hidden fees.
        </p>
      </motion.div>

      {/* Slider + Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="max-w-4xl mx-auto mb-12"
      >
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
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
              className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-brand-orange focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"
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
      </motion.div>

      {/* Hobby nudge */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12 }}
        className="rounded-2xl border border-brand-orange/30 bg-brand-orange/10 px-6 py-4 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      >
        <p className="text-sm text-neutral-300">
          <span className="font-semibold text-white">Just exploring?</span>{' '}
          Start free with the Hobby plan — 1 site, 5k pageviews, no credit card needed.
        </p>
        <button
          onClick={() => {
            if (currentPlanId === 'free') return
            if (!user) { initiateOAuthFlow(); return }
            window.location.href = '/'
          }}
          disabled={currentPlanId === 'free'}
          className="text-sm font-semibold text-brand-orange hover:text-white transition-colors shrink-0 disabled:opacity-50 disabled:cursor-default"
        >
          {currentPlanId === 'free' ? 'Your current plan' : 'Get started →'}
        </button>
      </motion.div>

      {/* Paid Plans — 3 column grid */}
      <div className="grid md:grid-cols-3 gap-6 mb-6">
        {PLANS.map((plan, index) => {
          const priceDetails = getPriceDetails(plan.id)
          const isTeam = plan.id === 'team'
          const isCurrent = currentPlanId === plan.id

          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 + index * 0.1 }}
              className={`card-glass p-8 flex flex-col relative overflow-hidden hover:-translate-y-1 hover:shadow-xl transition-all duration-300 ${
                isTeam ? 'border-brand-orange/20' : ''
              }`}
            >
              {isTeam && (
                <>
                  <div className="absolute top-0 left-0 w-full h-1 bg-brand-orange" />
                  <span className="absolute top-4 right-4 badge-primary">Most Popular</span>
                </>
              )}

              <div className="mb-8">
                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                <p className="text-sm text-neutral-400 min-h-[40px] mb-4">{plan.description}</p>

                {priceDetails ? (
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-white">
                        €{isYearly ? priceDetails.effectiveMonthly : priceDetails.baseMonthly}
                      </span>
                      <span className="text-neutral-400 font-medium">/mo</span>
                      <span className="text-xs text-neutral-500 ml-1">excl. VAT</span>
                    </div>
                    {isYearly && (
                      <p className="text-xs text-neutral-500 mt-1">
                        €{priceDetails.yearlyTotal} billed yearly
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-4xl font-bold text-white">Custom</div>
                )}
              </div>

              <Button
                onClick={() => !isCurrent && handleSubscribe(plan.id)}
                disabled={isCurrent || loadingPlan === plan.id || !!loadingPlan || !priceDetails}
                variant={isCurrent ? 'secondary' : isTeam ? 'primary' : 'secondary'}
                className="w-full mb-8"
              >
                {isCurrent ? 'Current plan' : loadingPlan === plan.id ? 'Loading...' : !priceDetails ? 'Contact us' : 'Subscribe'}
              </Button>

              <ul className="space-y-4 flex-grow">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-neutral-400">
                    <CheckCircleIcon className={`w-5 h-5 shrink-0 ${isTeam ? 'text-brand-orange' : 'text-neutral-400'}`} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )
        })}
      </div>

      {/* Enterprise nudge */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="card-glass px-6 py-4 mt-2 mb-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      >
        <p className="text-sm text-neutral-300">
          <span className="font-semibold text-white">Need something bigger?</span>{' '}
          We&apos;ll build a custom plan for you — unlimited sites, SLA, managed proxy, raw data export.
        </p>
        <a
          href="mailto:business@ciphera.net?subject=Enterprise%20Plan%20Inquiry"
          className="text-sm font-semibold text-brand-orange hover:text-white transition-colors shrink-0"
        >
          Let&apos;s talk →
        </a>
      </motion.div>

      {/* Gradient Divider */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-neutral-800 to-transparent my-20" />

      {/* Feature Comparison */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mb-20"
      >
        <h2 className="text-2xl font-bold text-white mb-8 text-center">Compare plans</h2>
        <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="p-4 sm:p-6 text-sm font-medium text-neutral-500">Feature</th>
                {['Hobby', 'Solo', 'Team', 'Business'].map((plan) => (
                  <th key={plan} className={`p-4 sm:p-6 text-sm font-bold ${plan === 'Team' ? 'text-brand-orange' : 'text-white'}`}>
                    {plan}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {COMPARISON_FEATURES.map((row) => (
                <tr key={row.feature} className="hover:bg-neutral-800/50 transition-colors">
                  <td className="p-4 sm:p-6 text-white font-medium text-sm">{row.feature}</td>
                  {row.values.map((val, i) => (
                    <td key={i} className="p-4 sm:p-6 text-sm">
                      {val === true ? (
                        <Check className="w-5 h-5 text-green-500" weight="bold" />
                      ) : val === false ? (
                        <span className="text-neutral-600">—</span>
                      ) : (
                        <span className="text-neutral-400">{val}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Trust Signals */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mb-20"
      >
        <h2 className="text-2xl font-bold text-white mb-8 text-center">Built for trust</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-6 max-w-4xl mx-auto">
          {[
            { icon: Scales, label: 'GDPR compliant', detail: 'By architecture, not configuration' },
            { icon: Eye, label: 'No cookies', detail: 'No consent banners needed' },
            { icon: Globe, label: 'Swiss infrastructure', detail: 'Data processed in Switzerland' },
            { icon: Code, label: 'Open source', detail: 'Frontend fully on GitHub' },
            { icon: ArrowsClockwise, label: 'Cancel anytime', detail: 'No lock-in or cancellation fees' },
            { icon: LockSimple, label: 'No data selling', detail: '100% data ownership, always' },
          ].map((signal, i) => (
            <motion.div
              key={signal.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="flex items-start gap-3 py-2"
            >
              <signal.icon className="w-5 h-5 text-brand-orange shrink-0 mt-0.5" weight="bold" />
              <div>
                <span className="font-semibold text-white text-sm">{signal.label}</span>
                <p className="text-xs text-neutral-400 mt-0.5">{signal.detail}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Gradient Divider */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-neutral-800 to-transparent" />

      {/* FAQ */}
      <PricingFAQ />

      {/* CTA */}
      <CTASection secondaryLabel="View Features" secondaryHref="/features" />
    </section>
  )
}
