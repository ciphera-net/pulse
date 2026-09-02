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
import Select from '@/components/ui/select'
import { Eyebrow } from '@/components/marketing/system/Eyebrow'
import { HairlineGrid } from '@/components/marketing/system/HairlineGrid'
import useSWR from 'swr'
import {
  TRAFFIC_TIERS,
  FREE_PLAN,
  PLAN_CATALOG,
  PLAN_FEATURE_MATRIX,
  FREE_PAGEVIEW_LIMIT,
  getPlanPricing,
} from '@/lib/plans'
import { formatEuro } from '@/lib/utils/money'
import { PlanComparisonTable } from '@/components/marketing/PlanComparisonTable'
import { HomeClosingCta } from '@/components/marketing/HomeClosingCta'
import { getPrices } from '@/lib/api/billing'
import { cn } from '@/lib/utils'

// One matrix for every surface: the marketing cards render the same catalog
// the in-app pickers (/setup/plan, /switch) consume — copy edits happen in
// lib/plans.ts, never here.
const PLANS = [FREE_PLAN, ...PLAN_CATALOG]

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
  const isCustomTraffic = currentTraffic.value === TIER_10M_PLUS.value

  // The comparison table's pageviews row reads the live tier slider — the
  // static matrix in lib/plans.ts can't know the selection. Accent form ties
  // the cells to the slider's primary-colored selected label.
  const paidPageviews = isCustomTraffic
    ? 'Custom'
    : ({ text: `${currentTraffic.label} (selected)`, accent: true } as const)
  const comparisonGroups = PLAN_FEATURE_MATRIX.map((group) =>
    group.label === 'Usage'
      ? {
          ...group,
          rows: [
            group.rows[0],
            {
              label: 'Monthly pageviews',
              values: {
                free: FREE_PAGEVIEW_LIMIT.toLocaleString('en-US'),
                solo: paidPageviews,
                team: paidPageviews,
                business: paidPageviews,
              },
            },
            ...group.rows.slice(1),
          ],
        }
      : group,
  )

  const getPrice = (planId: string) => {
    if (planId === 'free') return null
    if (currentTraffic.value === TIER_10M_PLUS.value) return null
    const selectedLimit = TRAFFIC_TIERS[sliderIndex]?.value
    if (!selectedLimit) return null
    // The derivation (yearly = 11 × monthly) lives in lib/plans.ts — this used
    // to re-implement the formula verbatim, which is how the two could drift.
    return getPlanPricing(prices, planId, selectedLimit)
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
      {/* Header — eyebrow, semantic h1, short dek */}
      <section className="border-b border-border">
        <div className="px-6 pb-12 pt-16 text-center sm:pt-20">
          <Eyebrow label="Pulse · Pricing" className="text-center" />
          <h1 className="mt-6 font-display text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
            Pricing
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Every plan runs the full product — you pay for scale, not features.
            Start free; no cookies, no consent banner, ever.
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
            <span className="text-xs text-muted-foreground">
              Get 1 month free with yearly · prices excl. VAT
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
                      'whitespace-nowrap px-1 py-0.5 text-xs tabular-nums transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
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

            {/* Mobile: dropdown — the app Select (portaled), never the native control */}
            <div className="md:hidden">
              <Select
                variant="input"
                fullWidth
                value={String(sliderIndex)}
                onChange={(v) => setSliderIndex(Number(v))}
                options={ALL_SLIDER_TIERS.map((tier, i) => {
                  const soloCents = prices?.['solo']?.[(tier as { value: number }).value]
                  return {
                    value: String(i),
                    label: `${tier.label} pageviews/month${soloCents ? ` — from ${formatEuro(soloCents / 100)}/mo` : ' — Custom'}`,
                  }
                })}
              />
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
              const isFree = plan.id === 'free'
              const isPopular = !!plan.popular
              const selectedLimit = TRAFFIC_TIERS[sliderIndex]?.value
              const isCurrent = isFree
                ? currentPlanId === 'free'
                : currentPlanId === plan.id && currentLimit === selectedLimit

              return (
                <div
                  key={plan.id}
                  className={cn(
                    'relative flex flex-col bg-card p-6',
                    // Highlighted tier: an inset primary ring reads cleanly inside
                    // a gap-px grid where cells carry no borders of their own; a
                    // border-t-2 would be swallowed by the 1px gap.
                    isPopular && 'ring-1 ring-inset ring-primary',
                  )}
                >
                  {/* Tier name — micro-label; popular tier flags itself */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      {plan.name}
                    </span>
                    {isPopular && (
                      <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                        Most popular
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="mt-5">
                    {isFree ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="font-display text-4xl font-semibold tabular-nums text-foreground">
                            €0
                          </span>
                          <span className="text-sm text-muted-foreground">/mo</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Forever free · no credit card
                        </p>
                      </>
                    ) : isCustomTraffic ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="font-display text-4xl font-semibold text-foreground">
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
                          <span className="font-display text-4xl font-semibold tabular-nums text-foreground">
                            {formatEuro(isYearly ? priceDetails.effectiveMonthly : priceDetails.monthly)}
                          </span>
                          <span className="text-sm text-muted-foreground">/mo</span>
                        </div>
                        {/* Both states carry the pageview allowance — the tier
                            must never be visible in only one of the two
                            toggles. VAT is disclosed once, under the toggle. */}
                        {isYearly ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {currentTraffic.label} pageviews · {formatEuro(priceDetails.yearlyTotal)} billed
                            yearly
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
                          <span className="font-display text-4xl font-semibold text-muted-foreground">
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
                    {plan.highlights.map((feature) => (
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
                    variant={isPopular ? 'default' : 'outline'}
                    onClick={() => {
                      if (isCurrent) return
                      if (isFree) {
                        if (!user) {
                          initiateOAuthFlow()
                          return
                        }
                        window.location.href = '/'
                        return
                      }
                      if (isCustomTraffic) {
                        router.push('/contact')
                        return
                      }
                      handleSubscribe(plan.id)
                    }}
                    disabled={isCurrent || (!isFree && !isCustomTraffic && !priceDetails)}
                    className="mt-auto w-full justify-center h-11 md:h-9"
                  >
                    {isCurrent
                      ? 'Current plan'
                      : isFree
                        ? 'Get started free'
                        : isCustomTraffic
                          ? 'Contact us'
                          : subscription?.subscription_status === 'active'
                            ? 'Switch plan'
                            : 'Get started'}
                  </Button>
                </div>
              )
            })}
          </HairlineGrid>

          {/* Enterprise — the SeoPageCta card anatomy: micro-label, display
              heading, receipts body, real Facet button. (The old "All plans
              include" strip is gone: the cards' "Every feature included" line
              and the table's included-everywhere group already carry it.) */}
          <div className="mt-6 flex flex-col items-start justify-between gap-4 border border-border bg-card px-6 py-5 sm:flex-row sm:items-center">
            <div>
              <p className="font-display text-lg font-semibold tracking-tight text-foreground">
                Need something bigger?
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                A custom plan built around your setup — unlimited sites, an uptime SLA,
                managed proxy, raw data export.
              </p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link href="/contact">
                Let&apos;s talk
                <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          {/* Open source — grant-only tier, same strip anatomy as enterprise
              above. Never a 5th card: the grid is a 4-up and a card would read
              as self-serve, which this deliberately is not. */}
          <div className="mt-6 flex flex-col items-start justify-between gap-4 border border-border bg-card px-6 py-5 sm:flex-row sm:items-center">
            <div>
              <p className="font-display text-lg font-semibold tracking-tight text-foreground">
                Building open source, or running a nonprofit?
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The Team tier at €0, by application — five sites, 100k
                pageviews a month, every feature. We get to say you use Pulse.
              </p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link href="/open-source">
                The open-source plan
                <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Plan comparison — the full matrix, VerdictTable anatomy */}
      <section className="border-b border-border">
        <div className="px-6 py-16 sm:py-20">
          <Eyebrow label="Compare plans" />
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Every plan, line by line.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            No feature gates. Plans differ on three things — sites, pageviews and
            data retention — and everything else ships everywhere, on Hobby too.
          </p>
          <PlanComparisonTable groups={comparisonGroups} />
        </div>
      </section>

      {/* FAQ — shared category-rail pattern */}
      <section className="border-b border-border">
        <div className="px-6 py-16 sm:py-20">
          <Eyebrow label="FAQ" />
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Pricing questions, answered.
          </h2>
          <PricingFAQ />
        </div>
      </section>

      {/* Closer — the homepage's ember-bloom closer, shared device (no
          border-b: the footer's border-t owns the seam). Secondary goes to
          the live demo — this page IS pricing, the homepage default would
          be circular. */}
      <section>
        <HomeClosingCta eyebrow="Get started" secondaryHref="/demo" secondaryLabel="View live demo" />
      </section>
    </>
  )
}
