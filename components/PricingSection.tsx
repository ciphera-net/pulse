'use client'

import { useState, useEffect } from 'react'
import { logger } from '@/lib/utils/logger'
import { useSearchParams, useRouter } from 'next/navigation'
import { Check, X } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { toast } from '@ciphera-net/ui'
import { useSubscription } from '@/lib/swr/dashboard'
import PricingFAQ from '@/components/marketing/PricingFAQ'
import CTASection from '@/components/marketing/CTASection'
import { Slider } from '@/components/ui/slider'
import useSWR from 'swr'
import { TRAFFIC_TIERS } from '@/lib/plans'
import { getPrices } from '@/lib/api/billing'

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

// The "10M+" tier — no price means custom/contact-us
const TIER_10M_PLUS = { label: '10M+', value: 10000001 }

// All tiers shown in the slider, including the custom-price 10M+ tier
const ALL_SLIDER_TIERS = [...TRAFFIC_TIERS, TIER_10M_PLUS] as const

export default function PricingSection() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isYearly, setIsYearly] = useState(true)
  const [sliderIndex, setSliderIndex] = useState(0) // Default to 10k (index 0)
  const { user } = useAuth()
  const { data: subscription } = useSubscription()
  const { data: prices } = useSWR('plan-prices', getPrices)
  const currentPlanId = subscription?.plan_id || (user ? 'free' : null)
  const currentLimit = subscription?.pageview_limit

  // * Show toast when redirected from checkout with canceled=true
  useEffect(() => {
    if (searchParams.get('canceled') === 'true') {
      toast.info("Checkout was canceled. You can try again whenever you're ready.")
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

  const currentTraffic = ALL_SLIDER_TIERS[sliderIndex]

  // Helper to get all price details (prices in EUR cents from API, display in whole euros)
  const getPriceDetails = (planId: string) => {
    // The 10M+ tier never has a price
    if (currentTraffic.value === TIER_10M_PLUS.value) return null

    const baseCents = prices?.[planId]?.[currentTraffic.value]
    if (!baseCents) return null

    const baseMonthly = baseCents / 100
    const yearlyTotal = Math.round((baseMonthly * 11) * 100) / 100
    const effectiveMonthly = Math.round((yearlyTotal / 12) * 100) / 100

    return {
      baseMonthly,
      yearlyTotal,
      effectiveMonthly,
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
      <div className="text-center mb-16">
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6">
          Transparent Pricing
        </h2>
        <p className="text-xl text-neutral-400 max-w-2xl mx-auto leading-relaxed">
          Scale with your traffic. No hidden fees.
        </p>
      </div>

      {/* Slider + Toggle */}
      <div className="max-w-4xl mx-auto mb-12">
        {/* Question label */}
        <p className="text-neutral-400 font-medium text-sm text-center mb-8">
          How many monthly pageviews do you expect?
        </p>

        {/* Desktop: tier labels on top, Radix slider below */}
        <div className="hidden md:block">
          <div className="flex items-end justify-between mb-3 px-0.5">
            {ALL_SLIDER_TIERS.map((tier, i) => (
              <button
                key={tier.label}
                type="button"
                onClick={() => setSliderIndex(i)}
                aria-label={`Select ${tier.label} pageviews per month`}
                className={`text-xs font-medium tabular-nums whitespace-nowrap transition-colors rounded px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  i === sliderIndex
                    ? 'text-primary font-semibold'
                    : 'text-neutral-500 hover:text-neutral-300'
                } ease-apple`}
              >
                {tier.label}
              </button>
            ))}
          </div>
          <Slider
            value={[sliderIndex]}
            onValueChange={([v]) => setSliderIndex(v)}
            min={0}
            max={ALL_SLIDER_TIERS.length - 1}
            step={1}
            aria-label={`${currentTraffic.label} pageviews per month`}
            className="[&_[role=slider]]:h-6 [&_[role=slider]]:w-2.5 [&_[role=slider]]:border-[3px] [&_[role=slider]]:border-background [&_[role=slider]]:bg-primary [&_[role=slider]]:ring-offset-0"
          />
        </div>

        {/* Mobile: Dropdown select */}
        <div className="md:hidden px-4">
          <select
            value={sliderIndex}
            onChange={(e) => setSliderIndex(parseInt(e.target.value))}
            className="w-full py-2.5 px-4 bg-neutral-900/80 border border-white/[0.08] rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-brand-orange"
          >
            {ALL_SLIDER_TIERS.map((tier, i) => {
              const soloCents = prices?.['solo']?.[(tier as { value: number }).value]
              return (
                <option key={tier.label} value={i}>
                  {tier.label} pageviews/month
                  {soloCents ? ` — from €${soloCents / 100}/mo` : ' — Custom'}
                </option>
              )
            })}
          </select>
        </div>

        {/* Billing toggle — centered */}
        <div className="flex flex-col items-center gap-2 mt-8">
          <div className="bg-neutral-800/80 backdrop-blur-sm border border-white/[0.08] p-1 rounded-xl flex" role="radiogroup" aria-label="Billing interval">
            <button
              onClick={() => setIsYearly(false)}
              role="radio"
              aria-checked={!isYearly}
              className={`min-w-[88px] px-4 py-2 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange ${
                !isYearly
                  ? 'bg-neutral-700 text-white shadow-sm'
                  : 'text-neutral-500 hover:text-white'
              } ease-apple`}
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
              } ease-apple`}
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
      <div className="rounded-2xl border border-brand-orange/30 bg-brand-orange/10 px-6 py-4 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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
          className="text-sm font-semibold text-brand-orange hover:text-white transition-colors shrink-0 disabled:opacity-50 disabled:cursor-default ease-apple"
        >
          {currentPlanId === 'free' ? 'Your current plan' : 'Get started →'}
        </button>
      </div>

      {/* Unified card block */}
      <div className="rounded-2xl glass-surface overflow-hidden mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3">
          {PLANS.map((plan, index) => {
            const priceDetails = getPriceDetails(plan.id)
            const isTeam = plan.id === 'team'
            const selectedLimit = TRAFFIC_TIERS[sliderIndex]?.value
            const isCurrent = currentPlanId === plan.id && currentLimit === selectedLimit

            return (
              <div
                key={plan.id}
                className={`px-6 py-8 flex flex-col gap-8 ${
                  index < PLANS.length - 1 ? 'lg:border-r border-b lg:border-b-0 border-white/[0.08]' : ''
                }`}
              >
                {/* Category label */}
                <div className="flex items-center justify-between">
                  <p className={`font-semibold text-sm uppercase tracking-wider ${
                    isTeam ? 'text-brand-orange' : 'text-neutral-400'
                  }`}>
                    {plan.category}
                  </p>
                  {isTeam && <span className="badge-primary">Most Popular</span>}
                </div>

                {/* Price block */}
                <div>
                  {priceDetails ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-display font-bold text-white">
                          €{isYearly ? priceDetails.effectiveMonthly : priceDetails.baseMonthly}
                        </span>
                        <div>
                          <p className="text-white font-semibold text-sm uppercase">{plan.name}</p>
                          <p className="text-neutral-500 text-xs">
                            {currentTraffic.label} pageviews/mo · billed {isYearly ? 'yearly' : 'monthly'}
                          </p>
                        </div>
                      </div>
                      {isYearly && (
                        <p className="text-xs text-neutral-500 mt-1">
                          €{priceDetails.yearlyTotal} billed yearly · excl. VAT
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-display font-bold text-white">Custom</span>
                    </div>
                  )}
                </div>

                {/* Feature list — check/x */}
                <div className="flex flex-col gap-3 flex-grow">
                  {plan.features.map((feature) => (
                    <div key={feature.name} className="flex items-center gap-2">
                      {feature.included ? (
                        <>
                          <Check className="w-4 h-4 text-brand-orange shrink-0" weight="bold" />
                          <span className="text-neutral-200 text-sm">{feature.name}</span>
                        </>
                      ) : (
                        <>
                          <X className="w-4 h-4 text-neutral-700 shrink-0" weight="bold" />
                          <span className="text-neutral-500 text-sm line-through">{feature.name}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* CTA button */}
                <button
                  onClick={() => !isCurrent && handleSubscribe(plan.id)}
                  disabled={isCurrent || !priceDetails}
                  className={`w-full h-[44px] rounded-xl flex items-center justify-between px-6 font-semibold text-sm uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isTeam
                      ? 'bg-brand-orange hover:bg-brand-orange-hover text-white'
                      : 'bg-neutral-700 hover:bg-neutral-600 text-white'
                  } ease-apple`}
                >
                  <span>
                    {isCurrent ? 'Current plan' : !priceDetails ? 'Contact us' : 'Get Started'}
                  </span>
                  {!isCurrent && priceDetails && (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* All Plans Include row */}
        <div className="border-t border-white/[0.08] px-6 py-6">
          <p className="text-neutral-400 font-semibold text-sm uppercase tracking-wider text-center mb-4">
            All plans include
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-4 sm:gap-8">
            {['Cookie-free tracking', 'GDPR compliant', 'Swiss infrastructure', '100% data ownership'].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-brand-orange shrink-0" weight="bold" />
                <span className="text-neutral-200 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Enterprise nudge */}
      <div className="card-glass px-6 py-4 mt-2 mb-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-sm text-neutral-300">
          <span className="font-semibold text-white">Need something bigger?</span>{' '}
          We&apos;ll build a custom plan for you — unlimited sites, SLA, managed proxy, raw data export.
        </p>
        <a
          href="mailto:business@ciphera.net?subject=Enterprise%20Plan%20Inquiry"
          className="text-sm font-semibold text-brand-orange hover:text-white transition-colors shrink-0 ease-apple"
        >
          Let&apos;s talk →
        </a>
      </div>

      {/* Gradient Divider */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-neutral-800 to-transparent" />

      {/* FAQ */}
      <PricingFAQ />

      {/* CTA */}
      <CTASection secondaryLabel="View Features" secondaryHref="/features" />
    </section>
  )
}
