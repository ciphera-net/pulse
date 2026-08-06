import type { Metadata } from 'next'
import Image from 'next/image'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'
import { MacWindow } from '@/components/marketing/system/MacWindow'
import { ReceiptsLedger, ProofLink, type Receipt } from '@/components/marketing/ReceiptsLedger'
import { RelatedLinks } from '@/components/marketing/seo/RelatedLinks'
import { HomeClosingCta } from '@/components/marketing/HomeClosingCta'
import { Eyebrow } from '@/components/marketing/system/Eyebrow'
import { cdnUrl } from '@/lib/cdn'

const description =
  'Pulse is privacy-first web analytics built by Ciphera BV in Belgium — open source, cookie-free, and counted on Swiss infrastructure.'

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
    title: 'Open source',
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

const vsLinks = [
  { label: 'vs Google Analytics', description: 'A cookie-based tool versus a cookieless one, side by side.', href: '/vs/google-analytics' },
  { label: 'vs Plausible', description: 'Two privacy-first tools compared honestly — including where we differ.', href: '/vs/plausible' },
  { label: 'vs Matomo', description: 'Self-hosted heavyweight versus a 5 KB script.', href: '/vs/matomo' },
  { label: 'vs Fathom', description: 'Feature gates and pricing models, laid out.', href: '/vs/fathom' },
  { label: 'vs Simple Analytics', description: 'Two EU-minded tools, measured against each other.', href: '/vs/simple-analytics' },
  { label: 'vs Umami', description: 'Open-source options compared: hosted, self-hosted, both.', href: '/vs/umami' },
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
            open source, cookie-free, and counted on Swiss infrastructure.
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
        dek="Visitors, pageviews, referrers, countries and devices — plus custom events, funnels and journeys, PageSpeed, uptime monitoring and email reports. Every feature on every plan, the free one included."
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
              alt="The Pulse dashboard for ciphera.net — 30 days of real visitor, pageview and engagement data"
              width={2244}
              height={1922}
              unoptimized
              className="block w-full"
            />
          </MacWindow>
        </div>
      </MarketingSection>

      {/* ── 04 · COMPARE — the tables live on the /vs cluster, not here ── */}
      <RelatedLinks
        eyebrowNumber="04"
        eyebrow="Compare"
        heading="The comparisons live on the vs pages."
        links={vsLinks}
      />

      {/* Closer — shared ember device (no border-b: footer's border-t owns the seam) */}
      <section>
        <HomeClosingCta eyebrow="Get started" secondaryHref="/demo" secondaryLabel="View live demo" />
      </section>
    </>
  )
}
