/**
 * @file Dynamic route for individual integration guide pages.
 *
 * Renders MDX content from content/integrations/*.mdx via next-mdx-remote.
 * Exports generateStaticParams for static generation and
 * generateMetadata for per-page SEO (title, description, OG, JSON-LD).
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import rehypeMdxCodeProps from 'rehype-mdx-code-props'
import { CodeBlock } from '@ciphera-net/ui'
import { integrations, getIntegration } from '@/lib/integrations'
import { getIntegrationGuide } from '@/lib/integration-content'
import { IntegrationGuide } from '@/components/IntegrationGuide'

// * ─── MDX Components ────────────────────────────────────────────
// Maps markdown code fences to CodeBlock. The `filename` meta is passed
// as a prop via rehype-mdx-code-props (e.g. ```tsx filename="app.tsx").
const mdxComponents = {
  pre: ({ children }: { children: React.ReactNode }) => children,
  code: ({ children, className, filename, ...props }: {
    children: React.ReactNode
    className?: string
    filename?: string
    [key: string]: unknown
  }) => {
    // Block code (inside <pre>) has className like "language-tsx"
    if (className?.startsWith('language-') || filename) {
      return (
        <CodeBlock filename={filename || 'code'}>
          {String(children).replace(/\n$/, '')}
        </CodeBlock>
      )
    }
    // Inline code
    return <code className={className} {...props}>{children}</code>
  },
}

// * ─── Static Params ─────────────────────────────────────────────
export function generateStaticParams() {
  return integrations
    .filter((i) => i.dedicatedPage)
    .map((i) => ({ slug: i.id }))
}

// * ─── SEO Metadata ──────────────────────────────────────────────
interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const guide = getIntegrationGuide(slug)
  if (!guide) return {}

  const title = `How to Add Pulse Analytics to ${guide.title} | Pulse by Ciphera`
  const description = guide.description
  const url = `https://pulse.ciphera.net/integrations/${guide.slug}`

  return {
    title,
    description,
    keywords: [
      `${guide.title} analytics`,
      `${guide.title} Pulse`,
      'privacy-first analytics',
      'website analytics',
      'Ciphera Pulse',
      guide.title,
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

// * ─── Page Component ────────────────────────────────────────────
export default async function IntegrationPage({ params }: PageProps) {
  const { slug } = await params
  const integration = getIntegration(slug)
  const guide = getIntegrationGuide(slug)
  if (!integration || !guide) return notFound()

  // * HowTo JSON-LD for rich search snippets
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to Add Pulse Analytics to ${integration.name}`,
    description: guide.description,
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
        <MDXRemote
          source={guide.content}
          components={mdxComponents}
          options={{ mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeMdxCodeProps] } }}
        />
      </IntegrationGuide>
    </>
  )
}
