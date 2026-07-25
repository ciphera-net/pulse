/**
 * Category landing page — the SWITCHING angle: leaving Google Analytics. Focused
 * on migration and what changes, distinct from the head-to-head at
 * /vs/google-analytics (which it links to prominently).
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
  title: 'Google Analytics alternative',
  description:
    'A privacy-first Google Analytics alternative: cookieless, no consent banner, EU company, Swiss/EU data residency. Keep the reports you use, drop the compliance overhead.',
  alternates: { canonical: '/google-analytics-alternative' },
  openGraph: {
    title: 'A privacy-first Google Analytics alternative | Pulse by Ciphera',
    description:
      'Cookieless, banner-free, EU-based analytics. What you keep when you leave Google Analytics, and how to switch in minutes.',
    siteName: 'Pulse by Ciphera',
  },
}

const breadcrumb = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Google Analytics alternative', item: `${SITE_URL}/google-analytics-alternative` },
  ],
}

const faqs = [
  {
    question: 'Why do teams switch away from Google Analytics?',
    answer:
      'Usually three reasons. First, the consent banner: GA sets cookies, so in the EU it needs opt-in consent, which both harms the visitor experience and means GA only counts people who accept. Second, compliance risk: EU data-protection authorities have found Google Analytics unlawful in several rulings over EU-to-US data transfers. Third, the data model — GA4 shares data across Google services and is built around the advertising ecosystem, which many teams simply do not want.',
  },
  {
    question: 'Is it hard to migrate from Google Analytics to Pulse?',
    answer:
      'No. You add one small script tag to your site — Pulse has ready-made guides for Next.js, WordPress, Shopify and more than 70 other stacks — and register your domain. There is no consent-mode wiring, no tag-manager container to untangle, and no cookie banner to configure. You can run both tools side by side for a while to compare numbers before removing GA.',
  },
  {
    question: 'Will I lose data or features by leaving Google Analytics?',
    answer:
      'You keep the reports most teams use daily: real-time visitors, pageviews, sessions, top pages, referrers and UTM campaigns, and device, browser and country breakdowns, plus custom events. Historical GA data stays in GA; Pulse starts collecting from install. If your analytics primarily feed Google Ads audiences and conversions, that is the one case where GA’s ecosystem is genuinely hard to replace — we say so plainly on the comparison page.',
  },
]

export default function GoogleAnalyticsAlternativePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SeoHero
        eyebrow="Pulse · Google Analytics alternative"
        title="A privacy-first Google Analytics alternative"
        lede="Keep the traffic reports you actually use. Drop the cookies, the consent banner and the EU-to-US transfer risk. Pulse is a cookieless, GDPR-native analytics tool from an EU company — a clean replacement for GA4 for teams that don’t live inside Google Ads."
      />

      <MarketingSection
        eyebrowNumber="01"
        eyebrowLabel="Why leave GA"
        heading="What Google Analytics costs you in the EU"
      >
        <div className="mt-6 max-w-3xl space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
            Google Analytics is free and enormously capable, but in Europe it comes with strings.
            Because GA relies on cookies, EU law requires opt-in consent before it can run — so a
            banner greets every visitor, and GA only ever counts the ones who click &ldquo;accept&rdquo;.
            The visitors who decline, or who bounce off the banner, are invisible to it.
          </p>
          <p>
            There is a compliance dimension too. Several EU data-protection authorities have found
            Google Analytics unlawful in specific rulings, centred on the transfer of European
            visitor data to the United States. And GA4’s data model is built for the advertising
            ecosystem: data flows into the wider Google stack, which is exactly the arrangement a
            growing number of teams are trying to move away from.
          </p>
        </div>
      </MarketingSection>

      <MarketingSection
        eyebrowNumber="02"
        eyebrowLabel="The switch"
        heading="One script tag, no banner, EU by default"
      >
        <div className="mt-6 max-w-3xl space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
            Moving to Pulse is deliberately dull. You drop a two-kilobyte script into your site —
            there are step-by-step{' '}
            <Link href="/integrations" className="text-primary hover:text-primary/80">
              integration guides
            </Link>{' '}
            for Next.js, WordPress, Shopify and 70-plus other platforms — register your domain, and
            you are collecting. No consent-mode configuration, no cookie banner, no tag-manager
            archaeology. Because Pulse sets no cookies and stores no personal data, there is nothing
            to gate behind consent in the first place.
          </p>
          <p>
            You keep the numbers that matter and gain an EU home for them: Pulse is operated by
            Ciphera BV in Belgium with data on Swiss/EU infrastructure. If you want the honest,
            row-by-row breakdown — including the one scenario where GA is still the better pick — the{' '}
            <Link href="/vs/google-analytics" className="text-primary hover:text-primary/80">
              Pulse vs Google Analytics
            </Link>{' '}
            page lays it all out.
          </p>
        </div>
      </MarketingSection>

      <FaqBlock items={faqs} />

      <RelatedLinks
        links={[
          {
            label: 'Pulse vs Google Analytics',
            description: 'The full side-by-side, including when GA is still the better choice.',
            href: '/vs/google-analytics',
          },
          {
            label: 'Analytics without a cookie banner',
            description: 'How many visitors a consent-gated tool never sees — with the arithmetic.',
            href: '/analytics-without-cookie-banner',
          },
          {
            label: 'All 75 integrations',
            description: 'Migration guides for Next.js, WordPress, Shopify and 70+ more.',
            href: '/integrations',
          },
        ]}
      />

      <SeoPageCta
        title="Leave GA without the banner"
        body="Add one script tag, keep your daily reports, lose the cookies and the consent prompt. Start free, or run Pulse alongside GA first to compare."
      />
    </>
  )
}
