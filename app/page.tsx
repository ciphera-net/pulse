import type { Metadata } from 'next'
import MarketingHome from '@/components/marketing/MarketingHome'
import { GA4LandingNotice } from '@/components/settings/import/GA4LandingNotice'
import { seoFor } from '@/lib/seo'

// * Server component homepage. Next.js does NOT self-canonicalise — every
// * indexable route must declare its own canonical or it inherits none. This
// * sets the self-referential canonical for `/`; `alternates` is a distinct
// * top-level metadata field, so declaring it does NOT replace the site-wide
// * `openGraph`/`twitter` blocks from the root layout (Next.js merges metadata
// * per top-level field), and the homepage keeps the full social card.
//
// * Level 1: merged with a WordPress stub for '/' when one exists (design
// * §4.3) — '/' matches only the literal root path, never as a prefix.
export const metadata: Metadata = seoFor('/', {
  alternates: {
    canonical: '/',
  },
})

// * Entity-graph JSON-LD. Both nodes reference the canonical Ciphera
// * Organization on ciphera.net (`@id #organization`) rather than minting a
// * competing Organization node, so the whole estate corroborates one entity.
const homepageSchema = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Pulse Analytics',
    alternateName: 'Pulse',
    description:
      'Privacy-first, cookie-free web analytics. GDPR compliant by architecture, open-source client, hosted in the EU/Switzerland.',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: 'https://pulse.ciphera.net',
    // * Live pricing is two plans (Personal free, then Business scaling by
    // * pageview volume). A free tier exists, so lowPrice is 0; currency EUR.
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'EUR',
      lowPrice: '0',
      offerCount: 2,
    },
    publisher: { '@id': 'https://ciphera.net/#organization' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': 'https://pulse.ciphera.net/#website',
    url: 'https://pulse.ciphera.net',
    name: 'Pulse Analytics',
    publisher: { '@id': 'https://ciphera.net/#organization' },
  },
]

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageSchema) }}
      />
      <MarketingHome />
      {/* A GA4 sign-in whose state failed to verify lands its popup here (PULSE-140). */}
      <GA4LandingNotice />
    </>
  )
}
