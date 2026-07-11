'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRightIcon, Button, GithubIcon, LoadingOverlay } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { cdnUrl } from '@/lib/cdn'
import { Eyebrow } from '@/components/marketing/system/Eyebrow'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'
import { TrustStrip } from '@/components/marketing/system/TrustStrip'
import DashboardDemo from '@/components/marketing/DashboardDemo'
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
        {/* HERO — refined centered composition on the rail. The ember JPG is a
            quiet symmetric floor: a bottom-anchored radial mask fades its top
            into the background, and a top-down scrim keeps text contrast. */}
        <section className="relative overflow-hidden border-b border-border">
          <Image
            src={HERO_EMBER}
            alt=""
            aria-hidden="true"
            fill
            priority
            unoptimized
            sizes="100vw"
            className="object-cover object-bottom opacity-70 [mask-image:radial-gradient(140%_120%_at_50%_100%,#000_45%,transparent_100%)]"
          />
          {/* Top-down scrim so the headline keeps contrast where the glow rises. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-background via-background/60 to-transparent"
          />

          <div className="relative mx-auto max-w-3xl px-6 pb-0 pt-24 text-center sm:pt-32">
            <Eyebrow label="Pulse · Privacy-first analytics" className="text-center" />

            <h1 className="mt-6 font-display text-6xl font-bold leading-[0.95] tracking-tight text-foreground sm:text-7xl">
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

            <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Respect your users&apos; privacy while getting the insights you need.
              No cookies, no IP tracking, fully GDPR compliant.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3 pb-24 sm:pb-32">
              <Button size="lg" onClick={() => initiateOAuthFlow()}>
                Try Pulse Free
                <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="https://github.com/ciphera-net/pulse" target="_blank" rel="noopener noreferrer">
                  <GithubIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                  View on GitHub
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* TrustStrip — the hero's bottom edge */}
        <TrustStrip />

        {/* 01 · Product — dashboard mockup + alternating feature rows */}
        <MarketingSection
          eyebrowNumber="01"
          eyebrowLabel="Product"
          heading="Everything, nothing you don't need."
          dek="A real-time dashboard built for clarity — the full picture of your traffic without a single cookie."
        >
          <div className="mt-12">
            <DashboardDemo />
          </div>
          <div className="mt-20 sm:mt-24">
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
