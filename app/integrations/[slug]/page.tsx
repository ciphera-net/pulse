/**
 * @file Dynamic route for individual integration guide pages.
 *
 * Handles all 50 integration routes via [slug].
 * Exports generateStaticParams for static generation and
 * generateMetadata for per-page SEO (title, description, OG, JSON-LD).
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { integrations, getIntegration } from '@/lib/integrations'
import { getGuideContent } from '@/lib/integration-guides'
import { IntegrationGuide } from '@/components/IntegrationGuide'

// * ─── Static Params ───────────────────────────────────────────────
export function generateStaticParams() {
  return integrations.map((i) => ({ slug: i.id }))
}

// * ─── SEO Metadata ────────────────────────────────────────────────
interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const integration = getIntegration(slug)
  if (!integration) return {}

  const title = `How to Add Pulse Analytics to ${integration.name} | Pulse by Ciphera`
  const description = integration.seoDescription
  const url = `https://pulse.ciphera.net/integrations/${integration.id}`

  return {
    title,
    description,
    keywords: [
      `${integration.name} analytics`,
      `${integration.name} Pulse`,
      'privacy-first analytics',
      'website analytics',
      'Ciphera Pulse',
      integration.name,
    ],
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Pulse by Ciphera',
      type: 'article',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

// * ─── Page Component ──────────────────────────────────────────────
export default async function IntegrationPage({ params }: PageProps) {
  const { slug } = await params
  const integration = getIntegration(slug)
  if (!integration) return notFound()

  const content = getGuideContent(slug)
  if (!content) return notFound()

  // * HowTo JSON-LD for rich search snippets
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to Add Pulse Analytics to ${integration.name}`,
    description: integration.seoDescription,
    step: [
      {
        '@type': 'HowToStep',
        name: `Open your ${integration.name} project`,
        text: `Navigate to your ${integration.name} project and locate the file where you manage the HTML head or layout.`,
      },
      {
        '@type': 'HowToStep',
        name: 'Add the Pulse tracking script',
        text: 'Insert the Pulse analytics script tag with your data-domain attribute into the head section of your page.',
      },
      {
        '@type': 'HowToStep',
        name: 'Deploy and verify',
        text: 'Deploy your changes and visit your Pulse dashboard to verify that page views are being recorded.',
      },
    ],
    tool: {
      '@type': 'HowToTool',
      name: 'Pulse by Ciphera',
      url: 'https://pulse.ciphera.net',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <IntegrationGuide integration={integration}>
        {content}
      </IntegrationGuide>
    </>
  )
}
