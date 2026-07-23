/**
 * Category landing page — the TECHNICAL angle: how cookieless measurement
 * actually works. Distinct from the legal (/gdpr-compliant-analytics) and
 * consent-UX (/analytics-without-cookie-banner) pages that touch nearby queries.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { SeoHero } from '@/components/marketing/seo/SeoHero'
import { FaqBlock } from '@/components/marketing/seo/FaqBlock'
import { RelatedLinks } from '@/components/marketing/seo/RelatedLinks'
import { SeoPageCta } from '@/components/marketing/seo/SeoPageCta'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'

const SITE_URL = 'https://pulse.ciphera.net'

export const metadata: Metadata = {
  title: 'Cookieless analytics',
  description:
    'How cookieless web analytics works: no cookies, no persistent identifiers, no fingerprinting. Pulse counts visits accurately with sessionStorage only — here is the mechanism.',
  alternates: { canonical: '/cookieless-analytics' },
  openGraph: {
    title: 'Cookieless analytics — how it works | Pulse by Ciphera',
    description:
      'No cookies, no persistent identifiers, no fingerprinting. The mechanism behind accurate, privacy-first cookieless web analytics.',
    siteName: 'Pulse by Ciphera',
  },
}

const breadcrumb = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Cookieless analytics', item: `${SITE_URL}/cookieless-analytics` },
  ],
}

const faqs = [
  {
    question: 'How does cookieless analytics count visitors without cookies?',
    answer:
      'Pulse counts sessions, not persistent users. When a pageview arrives, the script records the page, referrer, device type, browser and a country derived from the IP at request time — then discards the IP. To group pageviews within a single visit it uses the browser’s sessionStorage, which is cleared when the tab closes and is never shared across sites. There is no cookie and no cross-visit identifier, so nothing follows a person from one day to the next.',
  },
  {
    question: 'Is cookieless analytics less accurate than cookie-based tracking?',
    answer:
      'For the numbers most teams actually use — pageviews, top pages, referrers, entry and exit pages, device and country breakdowns — cookieless is as accurate or more accurate, because it does not depend on consent and is not blocked by tracker-blockers the way cookie-based tools are. The trade-off is that it counts a returning visitor on a new day as a new session rather than stitching them into one long-lived profile. For product-level identity resolution you would still want a dedicated product-analytics tool.',
  },
  {
    question: 'Does Pulse use device fingerprinting instead of cookies?',
    answer:
      'No. Fingerprinting — combining signals like fonts, canvas and hardware to re-identify a browser — is just cookies by another name, and regulators treat it that way. Pulse does not fingerprint. That is the whole point: no cookies and no fingerprint means no consent banner is required, and no personal data is collected.',
  },
]

export default function CookielessAnalyticsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SeoHero
        eyebrow="Pulse · Cookieless analytics"
        title="Cookieless web analytics, explained"
        lede="No cookies, no localStorage identifiers, no fingerprinting — and still accurate traffic numbers. Here is exactly how cookieless measurement works, and why it means you never need a consent banner."
      />

      <MarketingSection
        eyebrowNumber="01"
        eyebrowLabel="The mechanism"
        heading="What “cookieless” actually means"
      >
        <div className="mt-6 max-w-3xl space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
            Traditional analytics writes a cookie — a small, persistent identifier stored on the
            visitor’s device — so it can recognise the same browser across pages, sessions and even
            other sites. That persistent identifier is what turns aggregate web analytics into
            personal data, and it is what triggers the consent requirement in the EU.
          </p>
          <p>
            Cookieless analytics removes that identifier entirely. Pulse’s tracking script sends a
            single anonymous event per pageview containing the page path, the referrer, the device
            type and browser, and a country resolved from the IP address at the moment of the
            request. The IP itself is never stored. To tie the pageviews of one visit together —
            so an entry page and an exit page belong to the same session — Pulse uses{' '}
            <code className="font-mono text-sm text-foreground/80">sessionStorage</code>, which the
            browser wipes the instant the tab closes and never exposes to any other domain.
          </p>
          <p>
            There is no cross-session key, no cross-site key, and no fingerprint. A visitor who
            returns tomorrow is counted as a fresh session rather than re-identified — which is
            precisely why the method collects no personal data and needs no cookie banner.
          </p>
        </div>
      </MarketingSection>

      <MarketingSection
        eyebrowNumber="02"
        eyebrowLabel="Accuracy"
        heading="Cookieless does not mean fewer insights"
      >
        <div className="mt-6 max-w-3xl space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
            The worry with dropping cookies is that the numbers get worse. In practice the opposite
            is usually true. Cookie-based analytics only ever sees the visitors who accept the
            consent banner, and it is the single most-blocked category of script in ad- and
            tracker-blockers. A cookieless script that needs no consent runs for everyone and is far
            less likely to be blocked, so it captures a more complete picture of real traffic.
          </p>
          <p>
            Pulse still gives you the reports teams look at every day: real-time visitors,
            pageviews, unique sessions, top pages, referrers and UTM campaigns, entry and exit
            pages, device, browser and country breakdowns, and custom events for the actions that
            matter. The tracking script is a couple of kilobytes and loads asynchronously, so it
            does not slow the page down. And because the dashboard and script are open (AGPL) with a{' '}
            <Link href="/demo" className="text-primary hover:text-primary/80">
              public live demo
            </Link>
            , you can inspect exactly what is measured rather than take it on trust.
          </p>
        </div>
      </MarketingSection>

      <FaqBlock items={faqs} />

      <RelatedLinks
        links={[
          {
            label: 'Analytics without a cookie banner',
            description: 'The consent-banner tax on your data — and how removing cookies removes it.',
            href: '/analytics-without-cookie-banner',
          },
          {
            label: 'GDPR-compliant analytics',
            description: 'Why collecting no personal data makes compliance structural, not a checkbox.',
            href: '/gdpr-compliant-analytics',
          },
          {
            label: 'Pulse vs Google Analytics',
            description: 'A cookie-based tool versus a cookieless one, compared side by side.',
            href: '/vs/google-analytics',
          },
        ]}
      />

      <SeoPageCta />
    </>
  )
}
