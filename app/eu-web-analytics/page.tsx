/**
 * Category landing page — the EU-SOVEREIGNTY angle: data residency and
 * jurisdiction. Distinct from the legal GDPR page; focuses on where the data
 * lives and whose law reaches it.
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
  title: 'EU web analytics',
  description:
    'EU web analytics with data on Swiss/EU infrastructure, operated by an EU company (Ciphera BV, Belgium). No transfer to the US, no US-jurisdiction cloud in the path. Sovereign by design.',
  alternates: { canonical: '/eu-web-analytics' },
  openGraph: {
    title: 'EU web analytics | Pulse by Ciphera',
    description:
      'Data on Swiss/EU infrastructure, an EU company, no US transfer. Web analytics built for European data sovereignty.',
    siteName: 'Pulse by Ciphera',
  },
}

const breadcrumb = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'EU web analytics', item: `${SITE_URL}/eu-web-analytics` },
  ],
}

const faqs = [
  {
    question: 'Is my analytics data stored in the EU?',
    answer:
      'Yes. Pulse holds visitor data on Swiss and EU infrastructure. The data is not transferred to the United States, and there is no US-jurisdiction cloud provider in the processing path — the residency question that trips up US-based analytics tools does not arise.',
  },
  {
    question: 'Who operates Pulse, and under which law?',
    answer:
      'Pulse is a product of Ciphera BV, a Belgian company. That places the operator, and your data-protection relationship, inside the European Union under EU law — GDPR and NIS2 jurisdiction is Belgium/EU, not a foreign regime.',
  },
  {
    question: 'Does US law reach my analytics data with Pulse?',
    answer:
      'Frameworks like the US CLOUD Act let US authorities compel US companies to hand over data they control, wherever it is stored — which is the core of the Schrems II concern about EU-to-US transfers. Because Pulse is operated by an EU company on Swiss/EU infrastructure, without a US company controlling the data, that exposure does not apply.',
  },
]

export default function EuWebAnalyticsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SeoHero
        eyebrow="Pulse · EU web analytics"
        title="EU web analytics, sovereign by design"
        lede="For European teams, where the data lives and whose law reaches it is not a footnote. Pulse keeps visitor data on Swiss and EU infrastructure, operated by an EU company — no US transfer, no foreign jurisdiction over your analytics."
      />

      <MarketingSection
        eyebrowNumber="01"
        eyebrowLabel="Residency"
        heading="Where the data lives actually matters"
      >
        <div className="mt-6 max-w-3xl space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
            Data residency is not paperwork. Since the Schrems II ruling invalidated the EU-US
            Privacy Shield, European organisations have had to treat transfers of personal data to
            the United States as a genuine legal risk — and it is exactly that transfer question that
            led several data-protection authorities to rule against US-hosted analytics tools.
          </p>
          <p>
            Pulse removes the question rather than managing it. Visitor data is held on Swiss and EU
            infrastructure, and there is no US-jurisdiction cloud provider in the path. Nothing
            leaves for the United States, so there is no transfer mechanism to justify and no
            adequacy decision to depend on. And because Pulse is{' '}
            <Link href="/cookieless-analytics" className="text-primary hover:text-primary/80">
              cookieless
            </Link>
            , the data being kept in Europe is aggregate and non-personal in the first place.
          </p>
        </div>
      </MarketingSection>

      <MarketingSection
        eyebrowNumber="02"
        eyebrowLabel="Jurisdiction"
        heading="An EU company, not just EU servers"
      >
        <div className="mt-6 max-w-3xl space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
            EU hosting alone is not full sovereignty if the company controlling the data is subject
            to foreign law. Under the US CLOUD Act, a US company can be compelled to produce data it
            controls no matter where the servers sit. The operator’s jurisdiction, not just the
            data-centre’s location, is what decides who can reach your data.
          </p>
          <p>
            Pulse is operated by Ciphera BV, a Belgian company — so both the servers and the company
            responsible for them are in Europe. Ciphera builds deliberately on EU and Swiss
            infrastructure with the explicit goal of keeping US companies out of the critical path.
            If EU data sovereignty is a requirement rather than a preference, that combination — EU
            operator, Swiss/EU residency, no cookies — is the point of Pulse. The{' '}
            <Link href="/gdpr-compliant-analytics" className="text-primary hover:text-primary/80">
              GDPR basis
            </Link>{' '}
            explains the compliance side in full.
          </p>
        </div>
      </MarketingSection>

      <FaqBlock items={faqs} />

      <RelatedLinks
        links={[
          {
            label: 'GDPR-compliant analytics',
            description: 'The legal basis: no personal data, no consent, compliant by architecture.',
            href: '/gdpr-compliant-analytics',
          },
          {
            label: 'Pulse vs Google Analytics',
            description: 'Why a US-hosted tool creates the EU-transfer problem Pulse avoids.',
            href: '/vs/google-analytics',
          },
          {
            label: 'Cookieless analytics',
            description: 'How Pulse measures traffic without cookies or personal data.',
            href: '/cookieless-analytics',
          },
        ]}
      />

      <SeoPageCta
        title="Keep your analytics in Europe"
        body="EU company, Swiss/EU residency, no US transfer. Start free on the Hobby tier, or open the live demo to see Pulse on real traffic."
      />
    </>
  )
}
