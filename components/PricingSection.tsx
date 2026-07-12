'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { toast, Button, ArrowRightIcon, CheckIcon } from '@ciphera-net/facet'
import { useSubscription } from '@/lib/swr/dashboard'
import { getUserOrganizations } from '@/lib/api/organization'
import PricingFAQ from '@/components/marketing/PricingFAQ'
import { Slider } from '@/components/ui/slider'
import { Eyebrow } from '@/components/marketing/system/Eyebrow'
import { HairlineGrid } from '@/components/marketing/system/HairlineGrid'
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

const INCLUDED_EVERYWHERE = [
  'Cookie-free tracking',
  'GDPR compliant',
  'Swiss infrastructure',
  '100% data ownership',
]

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

  // Roving arrow-key handling for the billing segmented control. DOM focus
  // must move with the roving tabindex — flipping ARIA state alone strands
  // focus on a tabindex="-1" tab.
  const monthlyTabRef = useRef<HTMLButtonElement>(null)
  const yearlyTabRef = useRef<HTMLButtonElement>(null)
  function handleToggleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const nextYearly = !isYearly
      setIsYearly(nextYearly)
      ;(nextYearly ? yearlyTabRef : monthlyTabRef).current?.focus()
    }
  }

  return (
    <>
      {/* Header — mono eyebrow, semantic h1, short dek */}
      <section className="border-b border-border">
        <div className="px-6 pb-12 pt-16 text-center sm:pt-20">
          <Eyebrow label="Pulse · Pricing" className="text-center" />
          <h1 className="mt-6 font-display text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            Pricing
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Simple, transparent pricing for privacy-first analytics. Start free,
            scale when you need to — no cookies, no consent banner, ever.
          </p>

          {/* Billing toggle — segmented control, h-10 bordered container */}
          <div className="mt-10 flex flex-col items-center gap-3">
            <div
              role="tablist"
              aria-label="Billing interval"
              className="flex h-10 items-stretch border border-border p-1"
            >
              <button
                ref={monthlyTabRef}
                type="button"
                role="tab"
                aria-selected={!isYearly}
                tabIndex={!isYearly ? 0 : -1}
                onClick={() => setIsYearly(false)}
                onKeyDown={handleToggleKeyDown}
                className={cn(
                  'min-w-[96px] px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
                  !isYearly
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Monthly
              </button>
              <button
                ref={yearlyTabRef}
                type="button"
                role="tab"
                aria-selected={isYearly}
                tabIndex={isYearly ? 0 : -1}
                onClick={() => setIsYearly(true)}
                onKeyDown={handleToggleKeyDown}
                className={cn(
                  'min-w-[96px] px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
                  isYearly
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Yearly
              </button>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              Get 1 month free with yearly
            </span>
          </div>

          {/* Pageview tier slider — restyled on the app slider primitive */}
          <div className="mx-auto mt-12 max-w-3xl text-left">
            <p className="mb-6 text-center text-sm text-muted-foreground">
              How many monthly pageviews do you expect?
            </p>

            {/* Desktop: labels + slider */}
            <div className="hidden md:block">
              <div className="mb-3 flex items-end justify-between px-0.5">
                {ALL_SLIDER_TIERS.map((tier, i) => (
                  <button
                    key={tier.label}
                    type="button"
                    onClick={() => setSliderIndex(i)}
                    aria-label={`Select ${tier.label} pageviews per month`}
                    className={cn(
                      'whitespace-nowrap px-1 py-0.5 font-mono text-xs tabular-nums transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
                      i === sliderIndex
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground',
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
              />
            </div>

            {/* Mobile: dropdown */}
            <div className="md:hidden">
              <select
                value={sliderIndex}
                onChange={(e) => setSliderIndex(parseInt(e.target.value))}
                className="h-10 w-full border border-border bg-card px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
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
        </div>
      </section>

      {/* Tier cards — one hairline grid, four cells */}
      <section className="border-b border-border">
        <div className="px-6 py-16 sm:py-20">
          <HairlineGrid columns={4}>
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
                    'relative flex flex-col bg-card p-6',
                    // Highlighted tier: an inset primary ring reads cleanly inside
                    // a gap-px grid where cells carry no borders of their own; a
                    // border-t-2 would be swallowed by the 1px gap.
                    isTeam && 'ring-1 ring-inset ring-primary',
                  )}
                >
                  {/* Tier name — mono micro-label; popular tier flags itself */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      {plan.name}
                    </span>
                    {isTeam && (
                      <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
                        Most popular
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="mt-5">
                    {plan.isFree ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="font-display text-4xl font-bold tabular-nums text-foreground">
                            €0
                          </span>
                          <span className="text-sm text-muted-foreground">/mo</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          5k pageviews · forever free
                        </p>
                      </>
                    ) : isCustomTier ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="font-display text-4xl font-bold text-foreground">
                            Custom
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Contact us for pricing
                        </p>
                      </>
                    ) : priceDetails ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="font-display text-4xl font-bold tabular-nums text-foreground">
                            €{isYearly ? priceDetails.effectiveMonthly : priceDetails.monthly}
                          </span>
                          <span className="text-sm text-muted-foreground">/mo</span>
                        </div>
                        {isYearly ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            €{priceDetails.yearlyTotal} billed yearly · excl. VAT
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {currentTraffic.label} pageviews · billed monthly
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="font-display text-4xl font-bold text-muted-foreground">
                            —
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Loading…</p>
                      </>
                    )}
                  </div>

                  {/* Description */}
                  <p className="mt-4 text-sm text-muted-foreground">{plan.description}</p>

                  {/* Divider */}
                  <div className="my-5 h-px bg-border" />

                  {/* Feature list */}
                  <ul className="mb-6 flex flex-grow flex-col gap-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <CheckIcon
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        />
                        <span className="text-sm text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA — primary only on the highlighted tier, outline elsewhere */}
                  <Button
                    variant={isTeam ? 'default' : 'outline'}
                    onClick={() => {
                      if (isCurrent) return
                      if (plan.isFree) {
                        if (!user) {
                          initiateOAuthFlow()
                          return
                        }
                        window.location.href = '/'
                        return
                      }
                      if (isCustomTier) {
                        window.location.href =
                          'mailto:business@ciphera.net?subject=Enterprise%20Plan%20Inquiry'
                        return
                      }
                      handleSubscribe(plan.id)
                    }}
                    disabled={isCurrent || (!plan.isFree && !isCustomTier && !priceDetails)}
                    className="mt-auto w-full justify-center"
                  >
                    {isCurrent
                      ? 'Current plan'
                      : plan.isFree
                        ? 'Get started free'
                        : isCustomTier
                          ? 'Contact us'
                          : subscription?.subscription_status === 'active'
                            ? 'Switch plan'
                            : 'Get started'}
                  </Button>
                </div>
              )
            })}
          </HairlineGrid>

          {/* All plans include — quiet bordered row */}
          <div className="mt-6 border border-border bg-card px-6 py-5">
            <p className="mb-4 text-center font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
              All plans include
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center sm:gap-8">
              {INCLUDED_EVERYWHERE.map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckIcon
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                  />
                  <span className="text-sm text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Enterprise nudge — bordered row on tokens */}
          <div className="mt-4 flex flex-col items-start justify-between gap-3 border border-border bg-card px-6 py-4 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Need something bigger?</span>{' '}
              We&apos;ll build a custom plan for you — unlimited sites, SLA, managed proxy,
              raw data export.
            </p>
            <a
              href="mailto:business@ciphera.net?subject=Enterprise%20Plan%20Inquiry"
              className="shrink-0 font-mono text-xs text-primary transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
            >
              Let&apos;s talk →
            </a>
          </div>
        </div>
      </section>

      {/* FAQ — shared category-rail pattern */}
      <section className="border-b border-border">
        <div className="px-6 py-16 sm:py-20">
          <Eyebrow label="FAQ" />
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Pricing questions, answered.
          </h2>
          <PricingFAQ />
        </div>
      </section>

      {/* Closing CTA — quiet bordered row, facet Buttons */}
      <section>
        <div className="flex flex-col items-start justify-between gap-8 px-6 py-20 sm:py-24 lg:flex-row lg:items-center">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Start tracking with privacy.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Join the developers who respect their users&apos; privacy while getting the
              insights they need. No cookies, no consent banner, no compromise.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => initiateOAuthFlow()}>
              Try Pulse Free
              <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/features">View features</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
