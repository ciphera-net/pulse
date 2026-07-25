/**
 * Cookie-banner loss calculator — a client-side tool page. Indexable, unique
 * metadata, no backend. Outputs are arithmetic on the visitor's own inputs; no
 * studies, benchmarks or fabricated figures are cited.
 */

import type { Metadata } from 'next'
import { CookieBannerLossCalculator } from '@/components/marketing/seo/CookieBannerLossCalculator'
import { RelatedLinks } from '@/components/marketing/seo/RelatedLinks'
import { SeoPageCta } from '@/components/marketing/seo/SeoPageCta'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'

const SITE_URL = 'https://pulse.ciphera.net'

export const metadata: Metadata = {
  title: 'Cookie-banner loss calculator',
  description:
    'Estimate how many visitors your consent-gated analytics never counts. Enter your monthly visitors and consent-accept rate — the calculator does the arithmetic in your browser.',
  alternates: { canonical: '/tools/cookie-banner-loss-calculator' },
  openGraph: {
    title: 'Cookie-banner loss calculator | Pulse by Ciphera',
    description:
      'How many visitors does your cookie banner hide from analytics? Put in your own numbers and find out.',
    siteName: 'Pulse by Ciphera',
  },
}

const breadcrumb = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Cookie-banner loss calculator', item: `${SITE_URL}/tools/cookie-banner-loss-calculator` },
  ],
}

export default function CookieBannerLossCalculatorPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <MarketingSection>
        <div className="max-w-2xl">
          <p className="font-mono text-xs text-muted-foreground">Pulse · Tools</p>
          <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            Cookie-banner loss calculator
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
            A consent-gated analytics tool only counts the visitors who accept your cookie banner.
            Enter your own traffic and accept rate to estimate how many visitors go uncounted every
            month and year — and what a cookieless tool would have captured instead.
          </p>
        </div>

        <CookieBannerLossCalculator />
      </MarketingSection>

      <MarketingSection
        eyebrowNumber="01"
        eyebrowLabel="Why it happens"
        heading="Consent-gated analytics can only see the “yes” pile"
      >
        <div className="mt-6 max-w-3xl space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
            Cookie-based analytics does not load until a visitor accepts the consent banner. So
            anyone who declines, ignores it, or leaves before answering is never measured — they
            simply are not in the data. Your reported visitor total is really the count of people
            who opted in, which makes it both smaller than reality and biased toward the visitors
            most comfortable being tracked.
          </p>
          <p>
            The calculator above turns that into a number for your own site. It is deliberately just
            arithmetic — no study, no benchmark, no invented accept rate. Put in a rate you have
            actually measured and it will show the monthly and yearly gap. A cookieless tool such as
            Pulse removes the gap entirely by needing no banner and counting every visitor from the
            first pageview.
          </p>
        </div>
      </MarketingSection>

      <RelatedLinks
        links={[
          {
            label: 'Analytics without a cookie banner',
            description: 'Why removing the cookie removes the banner — and the blind spot with it.',
            href: '/analytics-without-cookie-banner',
          },
          {
            label: 'Cookieless analytics',
            description: 'The mechanism that lets Pulse measure everyone without a cookie.',
            href: '/cookieless-analytics',
          },
          {
            label: 'UTM builder',
            description: 'Tag your campaign links so Pulse can break traffic down by source.',
            href: '/tools/utm-builder',
          },
        ]}
      />

      <SeoPageCta
        title="Count every visitor, not just the “yes” pile"
        body="Pulse needs no cookie banner, so it measures everyone. Start free on the Hobby tier, or open the live demo to see the full picture on real traffic."
      />
    </>
  )
}
