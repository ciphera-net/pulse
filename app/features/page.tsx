'use client'

/**
 * @file Features / Product Tour page.
 *
 * Full quality treatment (06-08-2026, following the homepage audit): the page
 * SHOWS the product instead of only telling — a live two-up of real capture
 * slideshows (the same registry of authed/demo captures the homepage uses)
 * replaces the old illegible 380px thumbnail; the trust grid (the same 3-up
 * composition the homepage dropped as a website clone) becomes a numbered
 * receipts ledger where every claim carries the link that proves it; and every
 * number on the page is measured or sourced (script size measured 06-08; plan
 * limits from lib/plans.ts — the old hero claimed "less than 1 KB" while the
 * script ships 2.6 KB gzipped, under the 3 KB build budget).
 */

import Link from 'next/link'
import {
  Button,
  ArrowRightIcon,
  ArrowUpRightIcon,
  LockIcon,
  BarChartIcon,
  ZapIcon,
  GlobeIcon,
  Share2Icon,
} from '@ciphera-net/facet'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'
import { HairlineGrid } from '@/components/marketing/system/HairlineGrid'
import { ReceiptsLedger, ProofLink, type Receipt } from '@/components/marketing/ReceiptsLedger'
import { VisitorsSlideshow } from '@/components/marketing/mockups/visitors-slideshow'
import { CaptureSlideshow } from '@/components/marketing/mockups/capture-slideshow'
import { MacWindow } from '@/components/marketing/system/MacWindow'
import Image from 'next/image'
import { cdnUrl } from '@/lib/cdn'

type Icon = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

interface Feature {
  icon: Icon
  title: string
  description: string
  proof?: { label: string; href: string; external?: boolean }
}

// * 01 — the three pillars (matches the home hero's positioning)
const pillars: Feature[] = [
  {
    icon: LockIcon,
    title: 'Privacy first',
    description:
      'No cookies, no IP tracking, no fingerprinting. Fully GDPR, CCPA, and PECR compliant — no cookie banner required.',
    proof: { label: 'Why Pulse', href: '/about' },
  },
  {
    icon: BarChartIcon,
    title: 'Simple dashboard',
    description:
      'One clear dashboard with everything you need. Page views, visitors, referral sources, and top pages — no learning curve.',
    proof: { label: 'Open the live demo', href: '/demo' },
  },
  {
    icon: ZapIcon,
    title: 'Lightweight script',
    description:
      '2.6 KB gzipped — about 55× lighter than Google Analytics. Loads async with defer, so it never blocks rendering.',
    proof: { label: 'Install guide', href: '/installation' },
  },
]

// Inline stroke icons kept for the capabilities that have no facet equivalent;
// sized and coloured to the feature-cell recipe (h-5 w-5 text-muted-foreground).
const RealtimeIcon: Icon = ({ className, ...props }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
  </svg>
)

const FunnelIcon: Icon = ({ className, ...props }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
  </svg>
)

const GoalsIcon: Icon = ({ className, ...props }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
  </svg>
)

const UtmIcon: Icon = ({ className, ...props }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
  </svg>
)

// * 01 — core capabilities (framed hairline feature grid)
const capabilities: Feature[] = [
  {
    icon: RealtimeIcon,
    title: 'Real-time analytics',
    description: 'Watch visitors arrive live. See active pages, referrers, and current visitor counts with zero delay.',
  },
  {
    icon: FunnelIcon,
    title: 'Conversion funnels',
    description: 'Define multi-step funnels and see exactly where visitors drop off in your sign-up or checkout flow.',
  },
  {
    icon: GoalsIcon,
    title: 'Goals & events',
    description: 'Track custom goals, completions, and conversion rates — all without cookies or complex setup.',
  },
  {
    icon: UtmIcon,
    title: 'UTM campaign tracking',
    description: 'Automatically parse UTM parameters. Built-in link builder for campaigns, sources, and mediums.',
    proof: { label: 'Open the UTM builder', href: '/tools/utm-builder' },
  },
  {
    icon: Share2Icon,
    title: 'Shared dashboards',
    description: 'Generate a public link to share analytics with clients or teammates — no login required.',
    proof: { label: 'See a shared dashboard', href: '/demo' },
  },
  {
    icon: GlobeIcon,
    title: 'Geographic insights',
    description: 'A live world map by country, with region and city breakdowns a tab away. IPs are never stored — derived at request time only.',
  },
  {
    icon: ZapIcon,
    title: 'Performance monitoring',
    description: 'Daily Lighthouse checks with Core Web Vitals, filmstrip timeline, and score trend — mobile and desktop.',
  },
  {
    icon: BarChartIcon,
    title: 'Uptime alerts',
    description: 'Uptime monitors with downtime and recovery alerts by email and in the dashboard, with the incident history kept.',
  },
  {
    icon: GlobeIcon,
    title: 'CDN analytics',
    description: 'Bunny CDN bandwidth, cache hit rate, origin latency, and a ranked breakdown of the edge regions your bytes were served from — beside your visitor data.',
  },
]

// * 02 — trust receipts: every claim carries the link that proves it. (The old
// * 3-up grid was the same composition the homepage dropped as a website clone;
// * a numbered ledger literalizes "receipts, not promises".)
const trustReceipts: Receipt[] = [
  {
    title: 'Open-source client',
    description: 'The dashboard and tracking script are public on GitHub — inspect every line.',
    proof: { label: 'Read the code', href: 'https://github.com/ciphera-net/pulse', external: true },
  },
  {
    title: 'Swiss infrastructure',
    description: 'Every byte of visitor data is processed and stored in Switzerland.',
    proof: { label: 'Trust hub', href: 'https://ciphera.net/trust', external: true },
  },
  {
    title: 'No cookie banners',
    description: 'Cookie-free by architecture, so consent popups are simply unnecessary.',
    proof: { label: 'How that works', href: '/analytics-without-cookie-banner' },
  },
  {
    title: '100% data ownership',
    description: 'Your data is yours. We never sell it, share it, or mine it for ads.',
    proof: { label: 'Privacy policy', href: 'https://ciphera.net/privacy', external: true },
  },
  {
    title: 'Bot & spam filtering',
    description: 'Non-human traffic is automatically excluded so your numbers stay honest.',
    proof: { label: 'Common questions', href: '/faq' },
  },
  {
    title: '75 integrations',
    description: 'React, Vue, WordPress, Shopify, and dozens more — a script tag away.',
    proof: { label: 'All integrations', href: '/integrations' },
  },
]


function FeatureCell({ icon: Icon, title, description, proof }: Feature) {
  return (
    <div className="flex flex-col bg-card p-6">
      <Icon aria-hidden={true} className="h-5 w-5 text-muted-foreground" />
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      {proof && <ProofLink proof={proof} className="mt-5" />}
    </div>
  )
}

// Journeys slides — same assets as the homepage row (uniform 2112×1184).
function JourneysSlides() {
  return (
    <CaptureSlideshow
      width={2112}
      height={1184}
      alt="Pulse journeys for ciphera.net, live data"
      slides={[
        { key: 'columns', label: 'Columns', file: '/marketing/journeys-columns-sep-2x.png' },
        { key: 'flow', label: 'Flow', file: '/marketing/journeys-flow-sep-2x.png' },
      ]}
    />
  )
}

const steps = [
  { step: '1', title: 'Create your site', desc: 'Sign up and add your domain.' },
  { step: '2', title: 'Add the script', desc: 'Paste one <script> tag.' },
  { step: '3', title: 'Watch the data flow', desc: 'Real-time analytics, instantly.' },
]

export default function FeaturesPage() {
  return (
    <>
      {/* ── HERO ── */}
      <MarketingSection>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Pulse · Product tour</p>
          <h1 className="mx-auto mt-6 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            Everything you need. Nothing you don&apos;t.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Pulse gives you meaningful analytics without the complexity, the cookies, or the
            privacy trade-offs — the metrics that matter, and nothing that tracks your visitors.
          </p>
        </div>

        {/* Pillars — framed hairline feature grid */}
        <HairlineGrid columns={3} framed className="mt-14">
          {pillars.map((f) => (
            <FeatureCell key={f.title} {...f} />
          ))}
        </HairlineGrid>
      </MarketingSection>

      {/* ── 01 · ANALYTICS ── */}
      <MarketingSection
        eyebrowNumber="01"
        eyebrowLabel="Analytics"
        heading="Powerful analytics, simplified."
        dek="Everything from real-time dashboards to conversion funnels — without the bloat, and without a cookie in sight."
      >
        {/* The product, live — real captures of the ciphera.net dashboard, the
            same slideshow device as the homepage, at a width where the data is
            actually legible (the old 380px thumbnail was not). */}
        <div className="mt-12 grid gap-10 lg:grid-cols-2 [&>*]:min-w-0">
          <div>
            <p className="mb-4 text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Audience panels — live
            </p>
            <VisitorsSlideshow />
          </div>
          <div>
            <p className="mb-4 text-xs uppercase tracking-[0.08em] text-muted-foreground">
              CDN analytics — live
            </p>
            <MacWindow>
              <Image
                src={cdnUrl('/marketing/cdn-analytics-sep-2x.png')}
                alt="Pulse CDN analytics for ciphera.net — Bunny bandwidth, cache hit rate and origin latency"
                width={2465}
                height={1539}
                unoptimized
                className="block w-full"
              />
            </MacWindow>
          </div>
          <div>
            <p className="mb-4 text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Visitor journeys — live
            </p>
            <JourneysSlides />
          </div>
          <div>
            <p className="mb-4 text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Performance — live
            </p>
            <MacWindow>
              <Image
                src={cdnUrl('/marketing/performance-desktop-sep-2x.png')}
                alt="Pulse Performance for ciphera.net — desktop Lighthouse scores and page-load filmstrip"
                width={2468}
                height={1586}
                unoptimized
                className="block w-full"
              />
            </MacWindow>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Real data — captures of the live ciphera.net dashboard.{' '}
          <Link href="/demo" className="text-primary hover:text-primary/80">
            Explore it yourself →
          </Link>
        </p>

        <HairlineGrid columns={3} className="mt-14">
          {capabilities.map((f) => (
            <FeatureCell key={f.title} {...f} />
          ))}
        </HairlineGrid>
      </MarketingSection>

      {/* ── 02 · TRUST ── */}
      <MarketingSection
        eyebrowNumber="02"
        eyebrowLabel="Trust"
        heading="Guarantees, with receipts."
        dek="Not claims on a marketing page — each one links to the thing that proves it."
      >
        <ReceiptsLedger receipts={trustReceipts} />
      </MarketingSection>

      {/* ── 03 · SETUP ── */}
      <MarketingSection
        eyebrowNumber="03"
        eyebrowLabel="Setup"
        heading="Up and running in minutes."
        dek="No SDKs to install, no build steps, no configuration files."
      >
        <HairlineGrid columns={3} className="mt-12">
          {steps.map((s) => (
            <div key={s.step} className="flex items-start gap-4 bg-card p-6">
              <span className="text-sm text-primary">{s.step.padStart(2, '0')}</span>
              <div>
                <p className="text-sm font-semibold text-foreground">{s.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </HairlineGrid>
      </MarketingSection>

      {/* ── CLOSING CTA ── */}
      <section>
        <div className="flex flex-col items-start justify-between gap-8 px-6 py-20 sm:py-24 lg:flex-row lg:items-center">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Ready to see it in action?
            </h2>
            {/* Plan facts from lib/plans.ts (1 site, FREE_PAGEVIEW_LIMIT). */}
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Start for free — no credit card required. The Hobby plan includes one site and
              5,000 pageviews a month.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => initiateOAuthFlow()}>
              Get started free
              <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">View pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
