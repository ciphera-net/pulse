import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRightIcon } from '@ciphera-net/facet'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'
import { MacWindow } from '@/components/marketing/system/MacWindow'
import { HairlineGrid } from '@/components/marketing/system/HairlineGrid'
import { ReceiptsLedger, ProofLink, type Receipt } from '@/components/marketing/ReceiptsLedger'
import { HomeClosingCta } from '@/components/marketing/HomeClosingCta'
import { Eyebrow } from '@/components/marketing/system/Eyebrow'
import { cdnUrl } from '@/lib/cdn'
import { comparisonLogoUrl } from '@/lib/comparisons'

const description =
  'Pulse is privacy-first web analytics built by Ciphera BV in Belgium — open-source client, cookie-free, and counted on Swiss infrastructure.'

export const metadata: Metadata = {
  title: 'About',
  description,
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About',
    description,
    siteName: 'Pulse by Ciphera',
  },
}

// The company facts, each with the link that proves it — the receipts-ledger
// device from /features. Every value here is verifiable: the KBO entry is the
// Belgian public company register, the script size is measured, the source is
// public, and the no-gates claim is the pricing page's published position.
const companyReceipts: Receipt[] = [
  {
    title: 'Belgian company',
    description:
      'Ciphera BV · KBO/BCE 1013.721.660 · De Kleetlaan 2, 1831 Diegem — the entity on every invoice, in the public register.',
    proof: {
      label: 'KBO register',
      href: 'https://kbopub.economie.fgov.be/kbopub/toonondernemingps.html?ondernemingsnummer=1013721660',
      external: true,
    },
  },
  {
    title: 'Open-source client',
    description: 'The dashboard and the tracking script are public — inspect every line before you run it.',
    proof: { label: 'Read the code', href: 'https://github.com/ciphera-net/pulse', external: true },
  },
  {
    title: 'Swiss infrastructure',
    description:
      'Analytics data is processed and stored in Switzerland, protected by the Swiss Federal Act on Data Protection.',
    proof: { label: 'Trust hub', href: 'https://ciphera.net/trust', external: true },
  },
  {
    title: 'A 5 KB script',
    description:
      'Measured, not rounded: 5 KB gzipped — about 25× lighter than Google Analytics. When it shrinks, this number changes.',
    proof: { label: 'Installation', href: '/installation' },
  },
  {
    title: 'No feature gates',
    description:
      'Every plan runs the full product — funnels, journeys, API, uptime monitoring, all of it. Plans differ on scale.',
    proof: { label: 'Pricing', href: '/pricing' },
  },
  {
    title: 'Cookie-free by architecture',
    description:
      'No cookies, no fingerprinting, no persistent identifiers — which is why sites running Pulse need no consent banner.',
    proof: { label: 'How that works', href: '/analytics-without-cookie-banner' },
  },
]

// The six comparison pages, each with the competitor's logo (the same CDN
// assets the /vs pages and the website's comparison posts use).
const vsLinks = [
  { slug: 'google-analytics', label: 'vs Google Analytics', description: 'A cookie-based tool versus a cookieless one, side by side.' },
  { slug: 'plausible', label: 'vs Plausible', description: 'Two privacy-first tools compared honestly — including where we differ.' },
  { slug: 'matomo', label: 'vs Matomo', description: 'Self-hosted heavyweight versus a 5 KB script.' },
  { slug: 'fathom', label: 'vs Fathom', description: 'Feature gates and pricing models, laid out.' },
  { slug: 'simple-analytics', label: 'vs Simple Analytics', description: 'Two EU-minded tools, measured against each other.' },
  { slug: 'umami', label: 'vs Umami', description: 'Open-source options compared: hosted, self-hosted, both.' },
]

export default function AboutPage() {
  return (
    <>
      {/* Header — eyebrow, semantic h1, short dek */}
      <section className="border-b border-border">
        <div className="px-6 pb-12 pt-16 text-center sm:pt-20">
          <Eyebrow label="Pulse · About" className="text-center" />
          <h1 className="mt-6 font-display text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
            About
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Pulse is privacy-first web analytics built by Ciphera BV in Belgium —
            open-source client, cookie-free, and counted on Swiss infrastructure.
          </p>
        </div>
      </section>

      {/* ── 01 · THE STORY ── */}
      <MarketingSection
        eyebrowNumber="01"
        eyebrowLabel="The story"
        heading="Built because we needed it."
      >
        <div className="mt-6 max-w-2xl space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
            Ciphera builds privacy tools. When our own products needed analytics, every
            option came with a catch: either it surveilled visitors into a cookie
            banner, or the useful parts sat behind an enterprise tier. So we built the
            analytics we wanted to run ourselves — one small script, no cookies,
            nothing to consent to — and opened the source.
          </p>
          <p>
            Pulse runs on the same principles as the rest of Ciphera: a European
            company, Swiss infrastructure, and claims that link to their proof.
          </p>
        </div>
      </MarketingSection>

      {/* ── 02 · RECEIPTS ── */}
      <MarketingSection
        eyebrowNumber="02"
        eyebrowLabel="The company"
        heading="Who you're dealing with, with receipts."
        dek="Not an about-page mood board — each fact links to the thing that proves it."
      >
        <ReceiptsLedger receipts={companyReceipts} />
      </MarketingSection>

      {/* ── 03 · THE PRODUCT ── */}
      <MarketingSection
        eyebrowNumber="03"
        eyebrowLabel="The product"
        heading="What Pulse measures today."
        dek="Visitors, pageviews, referrers, countries and devices — plus custom events, funnels and journeys, performance, and uptime monitoring with alerts. Every feature on every plan, the free one included."
      >
        <div className="mt-6 flex flex-wrap items-center gap-5">
          <ProofLink proof={{ label: 'Tour the features', href: '/features' }} />
          <ProofLink proof={{ label: 'Open the live demo', href: '/demo' }} />
        </div>

        {/* Real capture — the LIVE ciphera.net dashboard (same asset and framing
            as the homepage hero; real data, not a mockup). */}
        <div className="mx-auto mt-12 w-full max-w-4xl">
          <MacWindow>
            <Image
              src={cdnUrl('/marketing/dashboard-hero-aug-2x.png')}
              alt="The Pulse dashboard for ciphera.net — 30 days of real visitor and pageview data"
              width={2244}
              height={1922}
              unoptimized
              className="block w-full"
            />
          </MacWindow>
        </div>
      </MarketingSection>

      {/* ── 04 · COMPARE — the tables live on the /vs cluster, not here.
          Integrated hairline grid on the section frame; logo tiles use the
          header-dropdown ListItem device (bordered size-12 square). ── */}
      <MarketingSection
        eyebrowNumber="04"
        eyebrowLabel="Compare"
        heading="The comparisons live on the vs pages."
      >
        <HairlineGrid columns={3} className="mt-12">
          {vsLinks.map((link) => (
            <Link
              key={link.slug}
              href={`/vs/${link.slug}`}
              className="group flex items-start gap-4 bg-card p-6 transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
            >
              <div className="flex aspect-square size-12 shrink-0 items-center justify-center border border-border bg-card p-2">
                <Image
                  src={comparisonLogoUrl(link.slug)}
                  alt=""
                  width={32}
                  height={32}
                  unoptimized
                  className="max-h-8 max-w-8 object-contain"
                />
              </div>
              <div>
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {link.label}
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  />
                </span>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {link.description}
                </p>
              </div>
            </Link>
          ))}
        </HairlineGrid>
      </MarketingSection>

      {/* Closer — shared ember device (no border-b: footer's border-t owns the seam) */}
      <section>
        <HomeClosingCta eyebrow="Get started" secondaryHref="/demo" secondaryLabel="View live demo" />
      </section>
    </>
  )
}
