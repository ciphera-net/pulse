'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRightIcon, Button, LoadingOverlay } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { cdnUrl } from '@/lib/cdn'
import { Eyebrow } from '@/components/marketing/system/Eyebrow'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'
import { TrustStrip } from '@/components/marketing/system/TrustStrip'
import { MacWindow } from '@/components/marketing/system/MacWindow'
import FeatureSections from '@/components/marketing/FeatureSections'
import { WhyPulse } from '@/components/marketing/WhyPulse'
import ComparisonCards from '@/components/marketing/ComparisonCards'
import { HomeFAQ } from '@/components/marketing/HomeFAQ'
import { HomeClosingCta } from '@/components/marketing/HomeClosingCta'
import HomeDashboard from '@/components/dashboard/HomeDashboard'

// The ember floor lives under the website CDN prefix, so it's referenced by
// absolute URL rather than cdnUrl() (which prepends Pulse's /pulse prefix).
const HERO_EMBER = 'https://cdn.ciphera.net/website/hero-glyph-ember.jpg'

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()

  if (authLoading) {
    return <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" portal={false} />
  }

  if (!user) {
    return (
      <>
        {/* HERO — product-first: the dashboard mockup IS the hero artifact.
            The copy block stays compact above it; the ember reduces to a faint
            warm floor behind the mockup (light under the artifact), and the
            hero's bottom border crops the mockup — a deliberate teaser, the
            full demo lives one scroll away. */}
        <section className="relative overflow-hidden border-b border-border">
          <Image
            src={HERO_EMBER}
            alt=""
            aria-hidden="true"
            fill
            priority
            unoptimized
            sizes="100vw"
            className="object-cover object-bottom opacity-40 [mask-image:radial-gradient(85%_65%_at_50%_100%,#000_25%,transparent_78%)]"
          />

          <div className="relative mx-auto max-w-3xl px-6 pt-20 text-center sm:pt-28">
            <Eyebrow label="Pulse · Privacy-first analytics" className="text-center" />

            <h1 className="mt-6 font-display text-5xl font-bold leading-[0.95] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              Analytics without the{' '}
              <span className="relative inline-block">
                surveillance.
                <svg
                  aria-hidden="true"
                  className="absolute -bottom-2 left-0 h-3 w-full text-primary"
                  viewBox="0 0 200 12"
                  preserveAspectRatio="none"
                >
                  <path d="M0 9C50 3 150 3 200 9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Respect your users&apos; privacy while getting the insights you need.
              No cookies, no IP tracking, fully GDPR compliant.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" onClick={() => initiateOAuthFlow()}>
                Try Pulse Free
                <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/demo">
                  Live demo
                  <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          {/* The artifact — a retina capture of the LIVE ciphera.net dashboard
              (real data, last 30 days; same data as /demo) inside a dark-mode
              macOS window, floating on margins like plausible's, docked into
              the fold: the capture ends on the chart card's own bottom border,
              so the crop line is a seam the dashboard itself drew. */}
          <div className="relative mx-auto mt-14 w-full max-w-5xl px-6 sm:mt-16">
            <MacWindow docked>
              <Image
                src={cdnUrl('/marketing/dashboard-hero-tall-2x.png')}
                alt="The Pulse dashboard for ciphera.net — 30 days of real visitor, pageview and engagement data"
                width={2304}
                height={1790}
                priority
                unoptimized
                className="block w-full"
              />
            </MacWindow>
          </div>
        </section>

        {/* TrustStrip — the hero's bottom edge */}
        <TrustStrip />

        {/* 01 · Product — alternating feature rows (the dashboard demo now
            leads the hero; this section carries the deeper feature stories) */}
        <MarketingSection
          eyebrowNumber="01"
          eyebrowLabel="Product"
          heading="Everything, nothing you don't need."
          dek="Funnels, journeys, reports and a live dashboard — every feature answers a question about your traffic without costing your visitors their privacy."
        >
          <div className="mt-12">
            <FeatureSections />
          </div>
        </MarketingSection>

        {/* 02 · Why Pulse — 4-up hairline feature grid */}
        <MarketingSection
          eyebrowNumber="02"
          eyebrowLabel="Why Pulse"
          heading="Privacy-first doesn't mean less insight."
          dek="Four guarantees, each backed by something you can verify — not a claim on a marketing page."
        >
          <WhyPulse />
        </MarketingSection>

        {/* 03 · Compare — Pulse vs. traditional analytics */}
        <MarketingSection
          eyebrowNumber="03"
          eyebrowLabel="Compare"
          heading="How Pulse compares."
          dek="See how privacy-first analytics stacks up against the tracking-heavy status quo."
        >
          <ComparisonCards />
        </MarketingSection>

        {/* 04 · FAQ — category rail + continuous numbering accordion */}
        <MarketingSection
          eyebrowNumber="04"
          eyebrowLabel="FAQ"
          heading="Frequently asked questions."
        >
          <HomeFAQ />
        </MarketingSection>

        {/* 05 · Get started — closer (no border-b: the footer's border-t owns it) */}
        <section>
          <HomeClosingCta />
        </section>
      </>
    )
  }

  // * Wait for organization context before mounting HomeDashboard so its data
  // * hooks (useSites, etc.) only fire once auth is fully ready — prevents the
  // * post-login race where SWR caches an empty/401 response for 30s.
  if (!user.org_id) {
    return <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" portal={false} />
  }

  return <HomeDashboard />
}
