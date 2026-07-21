'use client'

/**
 * @file Features / Product Tour page.
 *
 * Everything Pulse offers, rebuilt onto the marketing section grammar: mono
 * eyebrows, numbered full-bleed section slabs on the shared rail, the framed
 * HairlineGrid feature-cell recipe (neutral icons, mono proof links). Framer
 * retired — content is visible at first paint; transitions are CSS with
 * `motion-reduce`. Tokens only.
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
import { PulseFeaturesCarousel } from '@/components/marketing/mockups/pulse-features-carousel'

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
  },
  {
    icon: ZapIcon,
    title: 'Lightweight script',
    description:
      'Less than 1 KB. Loads in milliseconds with zero impact on your Lighthouse score or Core Web Vitals.',
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

// * 02 — core capabilities (framed hairline feature grid)
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
  },
  {
    icon: Share2Icon,
    title: 'Shared dashboards',
    description: 'Generate a public link to share analytics with clients or teammates — no login required.',
  },
  {
    icon: GlobeIcon,
    title: 'Geographic insights',
    description: 'Country, region, and city-level breakdowns. IPs are never stored — derived at request time only.',
    proof: { label: 'All integrations', href: '/integrations' },
  },
]

// * 03 — trust signals (framed hairline grid, no proof links)
const trustSignals: { title: string; description: string }[] = [
  { title: 'Open source', description: 'The dashboard and tracking script are public on GitHub — inspect every line.' },
  { title: 'Swiss infrastructure', description: 'Every byte of visitor data is processed and stored in Switzerland.' },
  { title: 'No cookie banners', description: 'Cookie-free by architecture, so consent popups are simply unnecessary.' },
  { title: '100% data ownership', description: 'Your data is yours. We never sell it, share it, or mine it for ads.' },
  { title: 'Bot & spam filtering', description: 'Non-human traffic is automatically excluded so your numbers stay honest.' },
  { title: '75+ integrations', description: 'React, Vue, WordPress, Shopify, and dozens more — a script tag away.' },
]

const proofLinkClass =
  'mt-5 inline-flex items-center gap-1 text-xs text-primary transition-colors duration-150 hover:text-primary/80 motion-reduce:transition-none'

function ProofLink({ proof }: { proof: NonNullable<Feature['proof']> }) {
  if (proof.external) {
    return (
      <a href={proof.href} target="_blank" rel="noopener noreferrer" className={proofLinkClass}>
        {proof.label}
        <ArrowUpRightIcon aria-hidden="true" className="h-3 w-3" />
      </a>
    )
  }
  return (
    <Link href={proof.href} className={proofLinkClass}>
      {proof.label}
      <ArrowUpRightIcon aria-hidden="true" className="h-3 w-3" />
    </Link>
  )
}

function FeatureCell({ icon: Icon, title, description, proof }: Feature) {
  return (
    <div className="flex flex-col bg-card p-6">
      <Icon aria-hidden={true} className="h-5 w-5 text-muted-foreground" />
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      {proof && <ProofLink proof={proof} />}
    </div>
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
          <h1 className="mx-auto mt-6 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
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
        <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_auto] lg:items-start">
          <HairlineGrid columns={2}>
            {capabilities.map((f) => (
              <FeatureCell key={f.title} {...f} />
            ))}
          </HairlineGrid>
          <div className="border border-border bg-card p-6">
            <p className="mb-4 text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Live preview
            </p>
            <PulseFeaturesCarousel />
          </div>
        </div>
      </MarketingSection>

      {/* ── 02 · TRUST ── */}
      <MarketingSection
        eyebrowNumber="02"
        eyebrowLabel="Trust"
        heading="Built for trust."
        dek="Open source, Swiss hosted, and designed to keep your visitors' data exactly where it belongs — with them."
      >
        <HairlineGrid columns={3} framed className="mt-12">
          {trustSignals.map((s) => (
            <div key={s.title} className="flex flex-col bg-card p-6">
              <p className="text-sm font-semibold text-foreground">{s.title}</p>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {s.description}
              </p>
            </div>
          ))}
        </HairlineGrid>

        <div className="mt-6 flex flex-wrap items-center gap-6">
          <Link
            href="/integrations"
            className="inline-flex items-center gap-1 text-xs text-primary transition-colors duration-150 hover:text-primary/80 motion-reduce:transition-none"
          >
            View all integrations
            <ArrowUpRightIcon aria-hidden="true" className="h-3 w-3" />
          </Link>
          <a
            href="https://github.com/ciphera-net/pulse"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary transition-colors duration-150 hover:text-primary/80 motion-reduce:transition-none"
          >
            View on GitHub
            <ArrowUpRightIcon aria-hidden="true" className="h-3 w-3" />
          </a>
        </div>
      </MarketingSection>

      {/* ── 03 · SETUP ── */}
      <MarketingSection
        eyebrowNumber="03"
        eyebrowLabel="Setup"
        heading="Up and running in 3 minutes."
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
            <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Ready to see it in action?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Start for free — no credit card required, cancel anytime. The Hobby plan includes
              one site and 5,000 pageviews a month.
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
