/**
 * Category landing page — the LEGAL angle: the GDPR basis for privacy-first
 * analytics. Deliberately distinct from the technical (/cookieless-analytics)
 * and sovereignty (/eu-web-analytics) pages.
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
  title: 'GDPR-compliant analytics',
  description:
    'GDPR-compliant web analytics that collects no personal data. No cookies, no consent, no cross-site tracking — compliant by architecture, from an EU company with Swiss/EU data residency.',
  alternates: { canonical: '/gdpr-compliant-analytics' },
  openGraph: {
    title: 'GDPR-compliant analytics | Pulse by Ciphera',
    description:
      'Web analytics that collects no personal data as defined by GDPR — compliant by architecture, not by configuration.',
    siteName: 'Pulse by Ciphera',
  },
}

const breadcrumb = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'GDPR-compliant analytics', item: `${SITE_URL}/gdpr-compliant-analytics` },
  ],
}

const faqs = [
  {
    question: 'Is Pulse GDPR compliant?',
    answer:
      'Yes, by design. Pulse collects no personal data as defined by GDPR Article 4 — no cookies, no persistent identifiers, no fingerprinting, and no storage of raw IP addresses. Because there is no personal data and no cookie access, the processing does not require consent under the GDPR or the ePrivacy Directive. Compliance is a property of the architecture rather than something you configure.',
  },
  {
    question: 'Do I need a Data Processing Agreement (DPA) with Pulse?',
    answer:
      'A DPA governs a processor handling personal data on your behalf. Because Pulse is designed not to collect personal data, the surface a DPA would cover is minimal — but Ciphera BV is an EU company subject to the GDPR, and account and billing data is of course handled under EU law. Review your own regulatory obligations and, where required, put the appropriate agreements in place.',
  },
  {
    question: 'Where is the analytics data stored?',
    answer:
      'On Swiss and EU infrastructure. Data is not transferred to the United States, and Pulse does not depend on US-jurisdiction cloud providers in the processing path — which sidesteps the EU-to-US transfer problems that led several data-protection authorities to rule Google Analytics unlawful.',
  },
]

export default function GdprCompliantAnalyticsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SeoHero
        eyebrow="Pulse · GDPR-compliant analytics"
        title="GDPR-compliant web analytics"
        lede="Most analytics tools can be made GDPR-compliant with enough configuration, consent management and legal review. Pulse starts there: it collects no personal data, so compliance is structural rather than a setting you have to get right."
      />

      <MarketingSection
        eyebrowNumber="01"
        eyebrowLabel="The legal basis"
        heading="No personal data, no consent required"
      >
        <div className="mt-6 max-w-3xl space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
            The GDPR governs the processing of <em>personal data</em> — any information relating to
            an identified or identifiable person (Article 4). The consent obligation that puts a
            banner on so many sites actually comes from the ePrivacy Directive, which requires
            opt-in before storing or reading information on a user’s device, such as a cookie.
          </p>
          <p>
            Pulse is built to sit outside both triggers. It sets no cookies and reads nothing from
            the device beyond the current tab’s <code className="font-mono text-sm text-foreground/80">sessionStorage</code>,
            so the ePrivacy consent requirement does not apply. And it collects no personal data: IP
            addresses are used only to resolve a country at request time and are then discarded,
            there is no persistent identifier, and no visitor can be singled out or tracked across
            sites. With no personal data and no device access, there is no lawful-basis question to
            answer and no consent to collect.
          </p>
          <p>
            This is a different posture from &ldquo;GDPR-ready&rdquo;. You are not relying on a
            correctly-configured consent tool, a data-processing addendum and a region setting to
            stay compliant — the data that would create the obligation is simply never gathered.
          </p>
        </div>
      </MarketingSection>

      <MarketingSection
        eyebrowNumber="02"
        eyebrowLabel="Beyond the checkbox"
        heading="Compliant by architecture, operated in the EU"
      >
        <div className="mt-6 max-w-3xl space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
            Data minimisation is a GDPR principle, not just a nicety: you should collect only what
            you need. Pulse takes that literally by measuring traffic in aggregate and keeping no
            individual-level profiles. There is nothing to leak in a breach that could identify a
            visitor, nothing to hand over in a data-subject access request about a visitor, and
            nothing to delete on request — because it was never collected.
          </p>
          <p>
            Jurisdiction matters too. Pulse is operated by Ciphera BV, a Belgian company, with data
            held on{' '}
            <Link href="/eu-web-analytics" className="text-primary hover:text-primary/80">
              Swiss and EU infrastructure
            </Link>
            . Your analytics provider is inside the EU and subject to EU law, rather than a foreign
            company whose home jurisdiction can reach into the data. And because the dashboard and
            tracking client are open source, your data protection officer can verify what is
            collected instead of trusting a marketing claim.
          </p>
        </div>
      </MarketingSection>

      <FaqBlock items={faqs} />

      <RelatedLinks
        links={[
          {
            label: 'Cookieless analytics',
            description: 'The technical mechanism that lets Pulse measure traffic without any cookies.',
            href: '/cookieless-analytics',
          },
          {
            label: 'EU web analytics',
            description: 'Data sovereignty: an EU company, Swiss/EU residency, no US transfer.',
            href: '/eu-web-analytics',
          },
          {
            label: 'Pulse vs Google Analytics',
            description: 'Why GA needs consent in the EU — and what a compliant-by-default tool looks like.',
            href: '/vs/google-analytics',
          },
        ]}
      />

      <SeoPageCta
        title="GDPR-compliant analytics, out of the box"
        body="No cookies, no consent, no personal data. Start free on the Hobby tier, or open the live demo to see exactly what Pulse measures on real traffic."
      />
    </>
  )
}
