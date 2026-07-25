/**
 * Free UTM builder — a client-side tool page. Indexable, unique metadata, no
 * backend: the form assembles the URL entirely in the browser.
 */

import type { Metadata } from 'next'
import { UtmBuilder } from '@/components/marketing/seo/UtmBuilder'
import { RelatedLinks } from '@/components/marketing/seo/RelatedLinks'
import { SeoPageCta } from '@/components/marketing/seo/SeoPageCta'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'

const SITE_URL = 'https://pulse.ciphera.net'

export const metadata: Metadata = {
  title: 'UTM builder',
  description:
    'A free UTM link builder. Add campaign source, medium and name to any URL and copy the tagged link — assembled in your browser, tracked automatically in Pulse.',
  alternates: { canonical: '/tools/utm-builder' },
  openGraph: {
    title: 'Free UTM builder | Pulse by Ciphera',
    description:
      'Build tagged campaign URLs in seconds. Free, browser-only, and read automatically by Pulse’s cookieless analytics.',
    siteName: 'Pulse by Ciphera',
  },
}

const breadcrumb = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'UTM builder', item: `${SITE_URL}/tools/utm-builder` },
  ],
}

export default function UtmBuilderPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <MarketingSection>
        <div className="max-w-2xl">
          <p className="font-mono text-xs text-muted-foreground">Pulse · Tools</p>
          <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            UTM link builder
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Add campaign tags to any URL so you can tell exactly which link, channel and campaign
            sent each visitor. Fill in the fields, copy the tagged link, and Pulse will break the
            traffic down by source, medium and campaign automatically — no cookies required.
          </p>
        </div>

        <UtmBuilder />
      </MarketingSection>

      <MarketingSection
        eyebrowNumber="01"
        eyebrowLabel="Reference"
        heading="What each UTM parameter means"
      >
        <div className="mt-8 grid gap-px border border-border bg-border sm:grid-cols-2">
          {[
            { param: 'utm_source', body: 'Where the traffic comes from — the site or platform, e.g. newsletter, twitter, google.' },
            { param: 'utm_medium', body: 'The marketing channel or link type, e.g. email, cpc, social, referral, banner.' },
            { param: 'utm_campaign', body: 'The specific campaign, launch or promotion this link belongs to, e.g. spring_launch.' },
            { param: 'utm_term', body: 'Optional. Paid-search keywords associated with the ad that carried this link.' },
            { param: 'utm_content', body: 'Optional. Separates links to the same URL — which button, image or A/B variant was clicked.' },
            { param: 'Base URL', body: 'The page you are sending people to. Existing query strings and fragments are preserved.' },
          ].map((item) => (
            <div key={item.param} className="bg-card p-6">
              <p className="font-mono text-sm text-foreground">{item.param}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </MarketingSection>

      <RelatedLinks
        links={[
          {
            label: 'Cookie-banner loss calculator',
            description: 'See how many visitors a consent-gated analytics tool never counts.',
            href: '/tools/cookie-banner-loss-calculator',
          },
          {
            label: 'Cookieless analytics',
            description: 'How Pulse tracks campaigns and traffic without setting a single cookie.',
            href: '/cookieless-analytics',
          },
          {
            label: 'All 75 integrations',
            description: 'Add Pulse to Next.js, WordPress, Shopify and 70+ more with one script tag.',
            href: '/integrations',
          },
        ]}
      />

      <SeoPageCta
        title="See your campaigns in Pulse"
        body="Tag your links here, then watch each source, medium and campaign break down in a cookieless, GDPR-native dashboard. Start free, or explore the live demo first."
      />
    </>
  )
}
