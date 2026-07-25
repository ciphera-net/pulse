import type { Metadata } from 'next'
import MarketingHome from '@/components/marketing/MarketingHome'

// * Server component homepage. Next.js does NOT self-canonicalise — every
// * indexable route must declare its own canonical or it inherits none. This
// * sets the self-referential canonical for `/`; `alternates` is a distinct
// * top-level metadata field, so declaring it does NOT replace the site-wide
// * `openGraph`/`twitter` blocks from the root layout (Next.js merges metadata
// * per top-level field), and the homepage keeps the full social card.
export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
}

// * Entity-graph JSON-LD. Both nodes reference the canonical Ciphera
// * Organization on ciphera.net (`@id #organization`) rather than minting a
// * competing Organization node, so the whole estate corroborates one entity.
const homepageSchema = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Pulse',
    alternateName: 'Ciphera Pulse',
    description:
      'Privacy-first, cookie-free web analytics. GDPR compliant by architecture, open source, hosted in the EU/Switzerland.',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: 'https://pulse.ciphera.net',
    // * Live pricing is tiered (Hobby free, then Solo/Team/Business scaling by
    // * pageview volume). A free tier exists, so lowPrice is 0; currency EUR.
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'EUR',
      lowPrice: '0',
      offerCount: 4,
    },
    publisher: { '@id': 'https://ciphera.net/#organization' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': 'https://pulse.ciphera.net/#website',
    url: 'https://pulse.ciphera.net',
    name: 'Pulse by Ciphera',
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
    </>
  )
}
