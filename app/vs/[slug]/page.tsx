/**
 * The comparison cluster — one statically-generated template renders every
 * "Pulse vs <competitor>" page from lib/comparisons. Mirrors the
 * /integrations/[slug] pattern (generateStaticParams + generateMetadata +
 * BreadcrumbList JSON-LD). Every page carries the required honest "when the
 * competitor is the better choice" section.
 */

import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckIcon } from '@ciphera-net/facet'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'
import { VerdictTable } from '@/components/marketing/seo/VerdictTable'
import { WhyPulseGrid } from '@/components/marketing/seo/WhyPulseGrid'
import { RelatedLinks, type RelatedLink } from '@/components/marketing/seo/RelatedLinks'
import { SeoPageCta } from '@/components/marketing/seo/SeoPageCta'
import { SeoCtaButtons } from '@/components/marketing/seo/SeoCtaButtons'
import { cdnUrl } from '@/lib/cdn'
import { comparisons, comparisonLogoUrl, getComparison } from '@/lib/comparisons'

const SITE_URL = 'https://pulse.ciphera.net'

export function generateStaticParams() {
  return comparisons.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const comparison = getComparison(slug)
  if (!comparison) return { title: 'Compare' }
  const title = `Pulse vs ${comparison.name}`
  return {
    title,
    description: comparison.metaDescription,
    alternates: { canonical: `/vs/${slug}` },
    openGraph: {
      title: `${title} | Pulse by Ciphera`,
      description: comparison.metaDescription,
      siteName: 'Pulse by Ciphera',
    },
  }
}

// Category / directory cross-links shown at the foot of every comparison. The
// GA page swaps in the EU-sovereignty angle since it already targets the GA
// switch query itself.
function relatedFor(slug: string): RelatedLink[] {
  const links: RelatedLink[] = [
    {
      label: 'Cookieless analytics',
      description: 'How Pulse measures traffic accurately without setting a single cookie.',
      href: '/cookieless-analytics',
    },
    {
      label: 'GDPR-compliant analytics',
      description: 'The legal basis: no personal data, no consent, compliant by architecture.',
      href: '/gdpr-compliant-analytics',
    },
    slug === 'google-analytics'
      ? {
          label: 'EU web analytics',
          description: 'Data sovereignty for European teams — EU company, Swiss/EU residency.',
          href: '/eu-web-analytics',
        }
      : {
          label: 'Google Analytics alternative',
          description: 'Leaving GA? What you keep, what you drop, and how to switch in minutes.',
          href: '/google-analytics-alternative',
        },
    {
      label: 'All 75 integrations',
      description: 'One script tag for Next.js, WordPress, Shopify and 70+ more stacks.',
      href: '/integrations',
    },
  ]
  return links
}

export default async function ComparisonPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const comparison = getComparison(slug)
  if (!comparison) notFound()

  const title = `Pulse vs ${comparison.name}`
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: title, item: `${SITE_URL}/vs/${slug}` },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

      {/* Hero + above-the-fold verdict table */}
      <MarketingSection>
        <div className="max-w-2xl">
          <p className="font-mono text-xs text-muted-foreground">Pulse · Compare</p>
          {/* Logo pair — information design, matching the ciphera.net comparison
              posts: the Pulse mark, a muted "vs", the competitor mark. */}
          <div className="mt-6 flex items-center gap-3">
            <Image
              src={cdnUrl('/pulse_icon_no_margins.png')}
              alt="Pulse"
              width={28}
              height={28}
              unoptimized
              className="h-7 w-7 rounded-sm object-contain"
            />
            <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
              vs
            </span>
            <Image
              src={comparisonLogoUrl(comparison.slug)}
              alt={comparison.name}
              width={28}
              height={28}
              unoptimized
              className="h-7 w-7 rounded-sm object-contain"
            />
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            {title}
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {comparison.tagline}
          </p>
        </div>

        <VerdictTable
          competitor={comparison.name}
          competitorLogo={comparisonLogoUrl(comparison.slug)}
          rows={comparison.rows}
        />

        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {comparison.verdict}{' '}
          <Link href="/pricing" className="text-primary hover:text-primary/80">
            See Pulse pricing
          </Link>
          . Prices for {comparison.name} were checked against their public pricing page on
          2026-07-21 and can change — confirm the current figure with the vendor.
        </p>

        <div className="mt-8">
          <SeoCtaButtons />
        </div>
      </MarketingSection>

      {/* Why teams pick Pulse — the contrast paragraph + the constant differentiators */}
      <MarketingSection
        eyebrowNumber="01"
        eyebrowLabel="Why teams pick Pulse"
        heading={`What Pulse does that ${comparison.name} doesn’t`}
      >
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
          {comparison.pulseEdge}
        </p>
        <WhyPulseGrid />
      </MarketingSection>

      {/* Required honest section: when the competitor wins */}
      <MarketingSection eyebrowNumber="02" eyebrowLabel="The honest case">
        <div className="max-w-3xl border border-border bg-card p-8">
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {comparison.whenBetter.heading}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {comparison.whenBetter.body}
          </p>
          <ul className="mt-6 space-y-4">
            {comparison.whenBetter.points.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <CheckIcon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                <span className="text-sm leading-relaxed text-foreground/90">{point}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            If none of the above is a dealbreaker, Pulse gives you cookieless, banner-free
            analytics from an EU company with Swiss/EU data residency — and you can check it
            yourself on the{' '}
            <Link href="/demo" className="text-primary hover:text-primary/80">
              live demo
            </Link>
            .
          </p>
        </div>
      </MarketingSection>

      <RelatedLinks links={relatedFor(slug)} />

      <SeoPageCta
        title={`Switch from ${comparison.name} without the banner`}
        body="Start free on the Hobby tier — one script tag, no cookies, no consent banner. Or open the live demo first and see Pulse running on real traffic."
      />
    </>
  )
}
