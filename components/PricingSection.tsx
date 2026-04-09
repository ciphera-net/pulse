'use client'

import { useState, useEffect } from 'react'
import { logger } from '@/lib/utils/logger'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Button, CheckCircleIcon } from '@ciphera-net/ui'
import { ArrowsClockwise, Check, Globe, Eye, LockSimple, Code, Scales } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { toast } from '@ciphera-net/ui'
import { useSubscription } from '@/lib/swr/dashboard'
import PricingFAQ from '@/components/marketing/PricingFAQ'
import CTASection from '@/components/marketing/CTASection'

// 1. Define Plans with IDs, Categories, and Feature Matrix
const PLANS = [
  {
    id: 'solo',
    name: 'Solo',
    category: 'PERSONAL',
    description: 'For personal sites and freelancers',
    features: [
      { name: '1 site', included: true },
      { name: 'Up to 5 sites', included: false },
      { name: 'Up to 10 sites', included: false },
      { name: 'Custom events', included: true },
      { name: 'Email reports', included: true },
      { name: 'Team dashboard', included: false },
      { name: 'Shared links', included: false },
      { name: 'Funnels', included: false },
      { name: 'API access', included: false },
      { name: 'Uptime monitoring', included: false },
      { name: 'Priority support', included: false },
    ]
  },
  {
    id: 'team',
    name: 'Team',
    category: 'TEAM',
    description: 'For startups and growing agencies',
    features: [
      { name: '1 site', included: true },
      { name: 'Up to 5 sites', included: true },
      { name: 'Up to 10 sites', included: false },
      { name: 'Custom events', included: true },
      { name: 'Email reports', included: true },
      { name: 'Team dashboard', included: true },
      { name: 'Shared links', included: true },
      { name: 'Funnels', included: true },
      { name: 'API access', included: true },
      { name: 'Uptime monitoring', included: true },
      { name: 'Priority support', included: false },
    ]
  },
  {
    id: 'business',
    name: 'Business',
    category: 'BUSINESS',
    description: 'For large organizations',
    features: [
      { name: '1 site', included: true },
      { name: 'Up to 5 sites', included: true },
      { name: 'Up to 10 sites', included: true },
      { name: 'Custom events', included: true },
      { name: 'Email reports', included: true },
      { name: 'Team dashboard', included: true },
      { name: 'Shared links', included: true },
      { name: 'Funnels', included: true },
      { name: 'API access', included: true },
      { name: 'Uptime monitoring', included: true },
      { name: 'Priority support', included: true },
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

// Temporary empty array — comparison table JSX will be removed in a later task
const COMPARISON_FEATURES: { feature: string; values: (string | boolean)[] }[] = []

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
      <div className="max-w-4xl mx-auto mb-12">
        {/* Question label */}
        <p className="text-neutral-400 font-medium text-sm text-center mb-8">
          How many monthly pageviews do you expect?
        </p>

        {/* Desktop: Custom slider with tick marks */}
        <div className="hidden md:flex flex-col items-center w-full px-8">
          {/* Tick mark labels */}
          <div className="relative w-full h-5 mb-4">
            {TRAFFIC_TIERS.map((tier, i) => (
              <button
                key={tier.label}
                onClick={() => setSliderIndex(i)}
                className={`absolute text-xs uppercase tracking-wider -translate-x-1/2 transition-colors ${
                  i === sliderIndex
                    ? 'text-white font-semibold'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
                style={{ left: `${(i / (TRAFFIC_TIERS.length - 1)) * 100}%` }}
              >
                {tier.label}
              </button>
            ))}
          </div>

          {/* Custom track */}
          <div className="relative w-full h-4 flex items-center">
            <input
              type="range"
              min="0"
              max={TRAFFIC_TIERS.length - 1}
              step="1"
              value={sliderIndex}
              onChange={(e) => setSliderIndex(parseInt(e.target.value))}
              aria-label="Monthly pageview limit"
              aria-valuetext={`${currentTraffic.label} pageviews per month`}
              className="sr-only"
            />
            {/* Background track */}
            <div className="absolute w-full h-1.5 bg-neutral-700 rounded-full" />
            {/* Active fill */}
            <div
              className="absolute h-1.5 bg-brand-orange rounded-full pointer-events-none"
              style={{ width: `${(sliderIndex / (TRAFFIC_TIERS.length - 1)) * 100}%` }}
            />
            {/* Drag handle */}
            <div
              className="absolute w-8 h-4 bg-brand-orange border border-brand-orange-hover rounded-full cursor-grab active:cursor-grabbing flex items-center justify-center gap-0.5 -translate-x-1/2 shadow-lg"
              style={{ left: `${(sliderIndex / (TRAFFIC_TIERS.length - 1)) * 100}%` }}
              onPointerDown={(e) => {
                const track = e.currentTarget.parentElement!
                const rect = track.getBoundingClientRect()
                const move = (ev: PointerEvent) => {
                  const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
                  setSliderIndex(Math.round(pct * (TRAFFIC_TIERS.length - 1)))
                }
                const up = () => {
                  document.removeEventListener('pointermove', move)
                  document.removeEventListener('pointerup', up)
                }
                document.addEventListener('pointermove', move)
                document.addEventListener('pointerup', up)
                e.preventDefault()
              }}
            >
              <div className="w-0.5 h-1.5 rounded-sm bg-white/50" />
              <div className="w-0.5 h-1.5 rounded-sm bg-white/50" />
            </div>
          </div>
        </div>

        {/* Mobile: Dropdown select */}
        <div className="md:hidden px-4">
          <select
            value={sliderIndex}
            onChange={(e) => setSliderIndex(parseInt(e.target.value))}
            className="w-full py-2.5 px-4 bg-neutral-900/80 border border-white/[0.08] rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-brand-orange"
          >
            {TRAFFIC_TIERS.map((tier, i) => (
              <option key={tier.label} value={i}>
                {tier.label} pageviews/month
                {tier.prices.solo !== null ? ` — from €${tier.prices.solo}/mo` : ' — Custom'}
              </option>
            ))}
          </select>
        </div>

        {/* Billing toggle — centered */}
        <div className="flex flex-col items-center gap-2 mt-8">
          <div className="bg-neutral-800/80 backdrop-blur-sm border border-white/[0.08] p-1 rounded-xl flex" role="radiogroup" aria-label="Billing interval">
            <button
              onClick={() => setIsYearly(false)}
              role="radio"
              aria-checked={!isYearly}
              className={`min-w-[88px] px-4 py-2 rounded-lg text-sm font-medium transition-all ${
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
              className={`min-w-[88px] px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isYearly
                  ? 'bg-neutral-700 text-white shadow-sm'
                  : 'text-neutral-500 hover:text-white'
              }`}
            >
              Yearly
            </button>
          </div>
          <span className="text-xs text-neutral-500 font-medium">
            Get 1 month free with yearly
          </span>
        </div>
      </div>

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
                  <li key={feature.name} className="flex items-start gap-3 text-sm text-neutral-400">
                    <CheckCircleIcon className={`w-5 h-5 shrink-0 ${isTeam ? 'text-brand-orange' : 'text-neutral-400'}`} />
                    <span>{feature.name}</span>
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
