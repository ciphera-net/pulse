'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CircleCheck } from 'lucide-react'
import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { toast, Button } from '@ciphera-net/ui'
import { useSubscription } from '@/lib/swr/dashboard'
import { getUserOrganizations } from '@/lib/api/organization'
import PricingFAQ from '@/components/marketing/PricingFAQ'
import CTASection from '@/components/marketing/CTASection'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge-2'
import useSWR from 'swr'
import { TRAFFIC_TIERS } from '@/lib/plans'
import { getPrices } from '@/lib/api/billing'
import { cn } from '@/lib/utils'

const PLANS = [
  {
    id: 'free',
    name: 'Hobby',
    description: 'For side projects and exploration',
    features: ['1 site', '5k pageviews/mo', 'Custom events', 'GDPR compliant'],
    isFree: true,
    isPopular: false,
  },
  {
    id: 'solo',
    name: 'Solo',
    description: 'For personal sites and freelancers',
    features: ['1 site', 'Custom events', 'Email reports', 'Responsive design'],
    isFree: false,
    isPopular: false,
  },
  {
    id: 'team',
    name: 'Team',
    description: 'For startups and growing agencies',
    features: ['Up to 5 sites', 'Team dashboard', 'Funnels & journeys', 'API access', 'Shared links'],
    isFree: false,
    isPopular: true,
  },
  {
    id: 'business',
    name: 'Business',
    description: 'For larger organizations',
    features: ['Up to 10 sites', 'Everything in Team', 'Uptime monitoring', 'Priority support', 'Custom events'],
    isFree: false,
    isPopular: false,
  },
]

// The "10M+" tier — no price means custom/contact-us
const TIER_10M_PLUS = { label: '10M+', value: 10000001 }

// All tiers shown in the slider, including the custom-price 10M+ tier
const ALL_SLIDER_TIERS = [...TRAFFIC_TIERS, TIER_10M_PLUS] as const

export default function PricingSection() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isYearly, setIsYearly] = useState(true)
  const [sliderIndex, setSliderIndex] = useState(0)
  const { user } = useAuth()
  const { data: subscription } = useSubscription()
  const { data: prices } = useSWR('plan-prices', getPrices)
  const currentPlanId = subscription?.plan_id || (user ? 'free' : null)
  const currentLimit = subscription?.pageview_limit

  // Show toast when redirected from checkout with canceled=true
  useEffect(() => {
    if (searchParams.get('canceled') === 'true') {
      toast.info("Checkout was canceled. You can try again whenever you're ready.")
      const url = new URL(window.location.href)
      url.searchParams.delete('canceled')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }, [searchParams])

  const currentTraffic = ALL_SLIDER_TIERS[sliderIndex]

  const getPrice = (planId: string) => {
    if (planId === 'free') return null
    if (currentTraffic.value === TIER_10M_PLUS.value) return null
    const selectedLimit = TRAFFIC_TIERS[sliderIndex]?.value
    const baseCents = prices?.[planId]?.[selectedLimit]
    if (!baseCents) return null
    const monthly = baseCents / 100
    const yearlyTotal = Math.round((monthly * 11) * 100) / 100
    const effectiveMonthly = Math.round((yearlyTotal / 12) * 100) / 100
    return { monthly, effectiveMonthly, yearlyTotal }
  }

  const handleSubscribe = async (planId: string) => {
    const selectedInterval = isYearly ? 'year' : 'month'
    const selectedLimit = TRAFFIC_TIERS[sliderIndex]?.value ?? 10000
    const planParams = `plan=${planId}&interval=${selectedInterval}&limit=${selectedLimit}`

    if (!user) {
      localStorage.setItem('pulse_auth_return_to', `/setup/org?${planParams}`)
      initiateOAuthFlow()
      return
    }

    if (subscription?.subscription_status === 'active') {
      router.push(`/switch?${planParams}`)
      return
    }


    try {
      const orgs = await getUserOrganizations()
      if (orgs.length === 0) {
        router.push(`/setup/org?${planParams}`)
      } else {
        router.push(`/setup/plan?${planParams}`)
      }
    } catch {
      router.push(`/setup/plan?${planParams}`)
    }
  }

  return (
    <section className="pb-24 px-4 max-w-6xl mx-auto">
      {/* Title section */}
      <div className="text-center mb-10">
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">
          Pricing
        </h2>
        <p className="text-lg text-neutral-400 max-w-xl mx-auto leading-relaxed">
          Select the plan that best suits your needs
        </p>
      </div>

      {/* Monthly/Yearly toggle */}
      <div className="flex flex-col items-center gap-2 mb-10">
        <div
          className="bg-neutral-900 border border-neutral-800 p-1 rounded-xl flex"
          role="radiogroup"
          aria-label="Billing interval"
        >
          <button
            onClick={() => setIsYearly(false)}
            role="radio"
            aria-checked={!isYearly}
            className={cn(
              'min-w-[96px] px-4 py-2 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange ease-apple',
              !isYearly
                ? 'bg-neutral-700 text-white shadow-sm'
                : 'text-neutral-500 hover:text-white',
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setIsYearly(true)}
            role="radio"
            aria-checked={isYearly}
            className={cn(
              'min-w-[96px] px-4 py-2 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange ease-apple',
              isYearly
                ? 'bg-neutral-700 text-white shadow-sm'
                : 'text-neutral-500 hover:text-white',
            )}
          >
            Yearly
          </button>
        </div>
        <span className="text-xs text-neutral-500 font-medium">
          Get 1 month free with yearly
        </span>
      </div>

      {/* Pageview tier slider */}
      <div className="max-w-3xl mx-auto mb-12">
        <p className="text-neutral-400 text-sm text-center mb-6">
          How many monthly pageviews do you expect?
        </p>

        {/* Desktop: labels + slider */}
        <div className="hidden md:block">
          <div className="flex items-end justify-between mb-3 px-0.5">
            {ALL_SLIDER_TIERS.map((tier, i) => (
              <button
                key={tier.label}
                type="button"
                onClick={() => setSliderIndex(i)}
                aria-label={`Select ${tier.label} pageviews per month`}
                className={cn(
                  'text-xs font-medium tabular-nums whitespace-nowrap transition-colors rounded px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ease-apple',
                  i === sliderIndex
                    ? 'text-brand-orange font-semibold'
                    : 'text-neutral-500 hover:text-neutral-300',
                )}
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

        {/* Mobile: dropdown */}
        <div className="md:hidden">
          <select
            value={sliderIndex}
            onChange={(e) => setSliderIndex(parseInt(e.target.value))}
            className="w-full py-2.5 px-4 bg-neutral-900 border border-neutral-800 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-brand-orange"
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
      </div>

      {/* 4-column plan card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {PLANS.map((plan) => {
          const priceDetails = getPrice(plan.id)
          const isTeam = plan.id === 'team'
          const selectedLimit = TRAFFIC_TIERS[sliderIndex]?.value
          const isCurrent = plan.isFree
            ? currentPlanId === 'free'
            : currentPlanId === plan.id && currentLimit === selectedLimit
          const isCustomTier = currentTraffic.value === TIER_10M_PLUS.value

          return (
            <div
              key={plan.id}
              className={cn(
                'relative flex flex-col rounded-2xl border p-6 transition-all',
                isTeam
                  ? 'border-brand-orange bg-neutral-900/50 shadow-lg shadow-brand-orange/5 lg:scale-105 lg:z-10'
                  : 'border-neutral-800 bg-neutral-900/50',
              )}
            >
              {/* Badge + plan name */}
              <div className="flex items-center justify-between mb-4">
                <Badge
                  variant={isTeam ? 'primary' : 'secondary'}
                  appearance={isTeam ? 'default' : 'light'}
                  size="md"
                  className={isTeam ? 'bg-brand-orange text-white border-transparent' : ''}
                >
                  {plan.name}
                </Badge>
                {isTeam && (
                  <span className="text-xs font-semibold text-brand-orange uppercase tracking-wider">
                    Popular
                  </span>
                )}
              </div>

              {/* Price */}
              <div className="mb-2">
                {plan.isFree ? (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-white">€0</span>
                      <span className="text-neutral-500 text-sm">/mo</span>
                    </div>
                    <p className="text-neutral-500 text-xs mt-1">5k pageviews · forever free</p>
                  </>
                ) : isCustomTier ? (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-white">Custom</span>
                    </div>
                    <p className="text-neutral-500 text-xs mt-1">Contact us for pricing</p>
                  </>
                ) : priceDetails ? (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className={cn('text-4xl font-bold', isTeam ? 'text-white' : 'text-white')}>
                        €{isYearly ? priceDetails.effectiveMonthly : priceDetails.monthly}
                      </span>
                      <span className="text-neutral-500 text-sm">/mo</span>
                    </div>
                    {isYearly ? (
                      <p className="text-neutral-500 text-xs mt-1">
                        €{priceDetails.yearlyTotal} billed yearly · excl. VAT
                      </p>
                    ) : (
                      <p className="text-neutral-500 text-xs mt-1">
                        {currentTraffic.label} pageviews · billed monthly
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-neutral-500">—</span>
                    </div>
                    <p className="text-neutral-500 text-xs mt-1">Loading...</p>
                  </>
                )}
              </div>

              {/* Description */}
              <p className="text-neutral-400 text-sm mb-5">{plan.description}</p>

              {/* Divider */}
              <div className="border-t border-neutral-800 mb-5" />

              {/* Feature list */}
              <ul className="flex flex-col gap-3 flex-grow mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <CircleCheck className="w-4 h-4 text-brand-orange shrink-0 mt-0.5" />
                    <span className="text-neutral-200 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <Button
                variant={isTeam ? 'primary' : 'secondary'}
                onClick={() => {
                  if (isCurrent) return
                  if (plan.isFree) {
                    if (!user) { initiateOAuthFlow(); return }
                    window.location.href = '/'
                    return
                  }
                  if (isCustomTier) {
                    window.location.href = 'mailto:business@ciphera.net?subject=Enterprise%20Plan%20Inquiry'
                    return
                  }
                  handleSubscribe(plan.id)
                }}
                disabled={isCurrent || (!plan.isFree && !isCustomTier && !priceDetails)}
                className={cn(
                  'w-full justify-center',
                  isTeam && 'shadow-md shadow-brand-orange/20',
                )}
              >
                {isCurrent
                  ? 'Current plan'
                  : plan.isFree
                  ? 'Get Started Free'
                  : isCustomTier
                  ? 'Contact us'
                  : subscription?.subscription_status === 'active'
                  ? 'Switch plan'
                  : 'Get Started'}
              </Button>
            </div>
          )
        })}
      </div>

      {/* All plans include row */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 px-6 py-5 mb-4">
        <p className="text-neutral-400 text-sm font-semibold text-center uppercase tracking-wider mb-4">
          All plans include
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-4 sm:gap-8">
          {['Cookie-free tracking', 'GDPR compliant', 'Swiss infrastructure', '100% data ownership'].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <CircleCheck className="w-4 h-4 text-brand-orange shrink-0" />
              <span className="text-neutral-200 text-sm">{item}</span>
            </div>
          ))}
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

      {/* Gradient divider */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-neutral-800 to-transparent" />

      {/* FAQ */}
      <PricingFAQ />

      {/* CTA */}
      <CTASection secondaryLabel="View Features" secondaryHref="/features" />
    </section>
  )
}
