import Image from 'next/image'
import Link from 'next/link'
import { ArrowRightIcon } from '@ciphera-net/facet'
import { cdnUrl } from '@/lib/cdn'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'
import { TrustStrip } from '@/components/marketing/system/TrustStrip'
import { MacWindow } from '@/components/marketing/system/MacWindow'
import FeatureSections from '@/components/marketing/FeatureSections'
import { WhyPulse } from '@/components/marketing/WhyPulse'
import ComparisonCards from '@/components/marketing/ComparisonCards'
import { HomeFAQ } from '@/components/marketing/HomeFAQ'
import { HomeClosingCta } from '@/components/marketing/HomeClosingCta'
import { HeroCtas } from '@/components/marketing/HeroCtas'

// The ember floor lives under the website CDN prefix, so it's referenced by
// absolute URL rather than cdnUrl() (which prepends Pulse's /pulse prefix).
const HERO_EMBER = 'https://cdn.ciphera.net/website/hero-glyph-ember.jpg'

// * The public marketing homepage — a pure server component so its copy, links
// * and footer are in the served HTML for crawlers, social scrapers and AI
// * answer engines (previously the whole page was client-gated behind an auth
// * probe and served an empty shell). Authenticated visitors are redirected to
// * /sites by middleware before this ever renders, so there is no auth branch
// * here. The single interactive island is the hero CTA (<HeroCtas/>).
export default function MarketingHome() {
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

        {/* Copy block — no eyebrow (logo + H1 already carry it); the dek is
            a POSITIONING line (category anchor + sovereignty), not claims —
            the TrustStrip below owns the claims as chips. Forced two-line
            headline so the larger scale never rewraps. */}
        <div className="relative mx-auto max-w-5xl px-6 pt-20 text-center sm:pt-28">
          <h1 className="font-display text-5xl font-bold leading-[0.95] tracking-tight text-foreground sm:text-7xl lg:text-[5.5rem]">
            Analytics without
            <span className="sr-only"> the surveillance.</span>
            {/* Rotates ONCE on load through the three things Pulse removes,
                then settles on "surveillance." — decorative duplicates
                (aria-hidden; the sr-only line above is the real sentence).
                The hand-drawn underline stretches to each word. */}
            <span aria-hidden="true" className="grid">
              {(
                [
                  ['surveillance.', 'animate-hero-word-1', ''],
                  ['cookies.', 'animate-hero-word-2', 'opacity-0'],
                  ['consent banners.', 'animate-hero-word-3', 'opacity-0'],
                ] as const
              ).map(([word, anim, base]) => (
                <span
                  key={word}
                  className={`[grid-area:1/1] motion-reduce:animate-none ${anim} ${base}`}
                >
                  the{' '}
                  <span className="relative inline-block">
                    {word}
                    <svg
                      aria-hidden="true"
                      className="absolute -bottom-2 left-0 h-3 w-full text-primary"
                      viewBox="0 0 200 12"
                      preserveAspectRatio="none"
                    >
                      <path d="M0 9C50 3 150 3 200 9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                    </svg>
                  </span>
                </span>
              ))}
            </span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            The open-source alternative to Google&nbsp;Analytics — built in
            Belgium, hosted in the EU.
          </p>

          <HeroCtas />
        </div>

        {/* The artifact — a retina capture of the LIVE ciphera.net dashboard
            (real data, last 30 days; same data as /demo) inside a dark-mode
            macOS window. The window is a complete closed frame floating on
            margins with air before the TrustStrip — a real window sitting on
            the page; its viewport cropping the dashboard mid-scroll is
            exactly what a real browser window does. */}
        <div className="relative mx-auto mt-14 w-full max-w-5xl px-6 pb-16 sm:mt-16 sm:pb-20">
          <MacWindow>
            <Image
              src={cdnUrl('/marketing/dashboard-hero-deep-2x.png')}
              alt="The Pulse dashboard for ciphera.net — 30 days of real visitor, pageview and engagement data"
              width={2304}
              height={2004}
              priority
              unoptimized
              className="block w-full"
            />
          </MacWindow>

          {/* The window shows REAL data — say so. Dot mirrors the app's
              live-visitors control (RealtimeVisitors recipe). */}
          <Link
            href="/demo"
            className="mt-5 flex items-center justify-center gap-2 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-green-500 animate-pulse motion-reduce:animate-none"
            />
            Live data — this is our real dashboard
            <ArrowRightIcon className="h-3 w-3" aria-hidden="true" />
          </Link>
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
