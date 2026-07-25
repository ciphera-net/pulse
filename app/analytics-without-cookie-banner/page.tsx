/**
 * Category landing page — the CONSENT-BANNER UX angle: the cost of the banner
 * itself and the data it hides. Distinct from the technical and legal pages;
 * links to the cookie-banner loss calculator tool.
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
  title: 'Analytics without a cookie banner',
  description:
    'Web analytics that needs no cookie consent banner. Because Pulse sets no cookies, it is exempt from ePrivacy consent — no banner, and it counts every visitor, not just those who opt in.',
  alternates: { canonical: '/analytics-without-cookie-banner' },
  openGraph: {
    title: 'Analytics without a cookie banner | Pulse by Ciphera',
    description:
      'No cookies means no consent banner — and no blind spot for the visitors who would have said no. Here is what the banner actually costs.',
    siteName: 'Pulse by Ciphera',
  },
}

const breadcrumb = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Analytics without a cookie banner', item: `${SITE_URL}/analytics-without-cookie-banner` },
  ],
}

const faqs = [
  {
    question: 'Why doesn’t Pulse need a cookie consent banner?',
    answer:
      'The consent banner exists because of the ePrivacy Directive, which requires opt-in before a site stores or reads information on a visitor’s device — the classic example being a cookie. Pulse sets no cookies and reads nothing persistent from the device, so that requirement does not apply. No cookie access means no banner.',
  },
  {
    question: 'Do cookie banners actually hurt analytics accuracy?',
    answer:
      'Yes. A consent-gated analytics tool only runs after the visitor clicks accept, so every visitor who declines, ignores the banner, or bounces before answering is invisible to it. The exact loss depends on your audience and banner design, but it is never zero. A cookieless tool that needs no banner measures everyone from the first pageview.',
  },
  {
    question: 'What about ePrivacy, PECR and future cookie laws?',
    answer:
      'The consent rules attach to storing or reading data on the device (cookies and equivalents like fingerprinting), not to measuring traffic as such. By avoiding device storage and personal data entirely, Pulse stays on the exempt side of ePrivacy and its national implementations such as the UK’s PECR — rather than depending on a consent tool to keep you compliant as the rules tighten.',
  },
]

export default function AnalyticsWithoutCookieBannerPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SeoHero
        eyebrow="Pulse · No cookie banner"
        title="Web analytics without a cookie banner"
        lede="The consent banner is not just an annoyance — it is a hole in your data. Because Pulse sets no cookies, it needs no banner, and it counts every visitor instead of only the ones who click “accept”."
      />

      <MarketingSection
        eyebrowNumber="01"
        eyebrowLabel="The hidden cost"
        heading="A banner is a blind spot, not just a nuisance"
      >
        <div className="mt-6 max-w-3xl space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
            Everyone knows cookie banners are bad for the visitor experience — the extra click, the
            dark-pattern &ldquo;reject&rdquo; buried two menus deep, the layout shift on load. What is
            less obvious is what they do to your numbers. A cookie-based analytics tool cannot run
            until the visitor consents, so the moment someone declines or simply leaves without
            answering, that session never reaches your dashboard.
          </p>
          <p>
            The result is a systematic undercount that you cannot see, because the missing visitors
            are missing from the tool doing the counting. Your &ldquo;total visitors&rdquo; is really
            &ldquo;visitors who accepted tracking&rdquo; — a different, smaller, and biased number.
            You can put your own traffic and accept-rate into the{' '}
            <Link href="/tools/cookie-banner-loss-calculator" className="text-primary hover:text-primary/80">
              cookie-banner loss calculator
            </Link>{' '}
            to see the size of the gap for your site. It is only arithmetic on your inputs — but the
            arithmetic is sobering.
          </p>
        </div>
      </MarketingSection>

      <MarketingSection
        eyebrowNumber="02"
        eyebrowLabel="The fix"
        heading="Remove the cookie, remove the banner"
      >
        <div className="mt-6 max-w-3xl space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
            The banner is downstream of the cookie. Remove the cookie and the legal trigger for the
            banner goes with it. Pulse is built cookieless from the ground up: it measures traffic
            with no cookies, no persistent identifiers and no fingerprinting, so there is nothing to
            ask consent for — and{' '}
            <Link href="/cookieless-analytics" className="text-primary hover:text-primary/80">
              nothing lost to accuracy
            </Link>{' '}
            in the trade.
          </p>
          <p>
            That means a cleaner first impression for every visitor, a page that does not jump as a
            consent dialog loads, and — crucially — a visitor count that reflects everyone who
            actually came, not just those who opted in. It is the rare privacy win that also makes
            your data better rather than worse.
          </p>
        </div>
      </MarketingSection>

      <FaqBlock items={faqs} />

      <RelatedLinks
        links={[
          {
            label: 'Cookie-banner loss calculator',
            description: 'Estimate how many visitors a consent-gated tool never counts on your site.',
            href: '/tools/cookie-banner-loss-calculator',
          },
          {
            label: 'Cookieless analytics',
            description: 'The mechanism that lets Pulse measure everyone without a single cookie.',
            href: '/cookieless-analytics',
          },
          {
            label: 'GDPR-compliant analytics',
            description: 'Why no cookies and no personal data means no consent question to answer.',
            href: '/gdpr-compliant-analytics',
          },
        ]}
      />

      <SeoPageCta
        title="Ditch the banner, keep the data"
        body="Pulse needs no cookie banner because it sets no cookies. Start free on the Hobby tier, or open the live demo to see it running on real traffic."
      />
    </>
  )
}
