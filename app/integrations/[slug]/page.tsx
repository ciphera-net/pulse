/**
 * Per-integration install guide, generated from the registry. Gives every
 * integration a real destination (the old links sent all ~75 platforms to one
 * generic page) and a purpose to `docsSlug` / `snippet`. Statically generated.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRightIcon } from '@ciphera-net/facet'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'
import { TierBadge } from '@/components/integrations/TierBadge'
import {
  integrations,
  getIntegration,
  categoryLabels,
  supportTierDescriptions,
  integrationDocsUrl,
} from '@/lib/integrations'

const INSTALL_METHOD_LABEL: Record<string, string> = {
  'script-tag': 'Script tag',
  plugin: 'Official plugin',
  'custom-code-plan-gated': 'Custom code (paid plan)',
  'checkout-sandbox': 'Checkout Custom Pixel',
  'amp-config': 'AMP config',
  'gtm-tag': 'Tag Manager',
}

export function generateStaticParams() {
  return integrations.map((i) => ({ slug: i.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const integration = getIntegration(slug)
  if (!integration) return { title: 'Integration | Pulse' }
  const title = `${integration.name} analytics — install Pulse | Pulse`
  return {
    title,
    description: integration.description,
    openGraph: { title, description: integration.description, siteName: 'Pulse by Ciphera' },
  }
}

// * The static install tag shown on the guide. This is the generic universal
// * tag with a placeholder domain — the in-app snippet generator produces the
// * customized/SRI form. Framework-idiomatic wiring (snippet.code) is shown when
// * the platform has it.
function renderSnippet(code: string | undefined): string {
  if (code) return code.replace(/DOMAIN/g, 'example.com')
  return '<script defer data-domain="example.com" src="https://js.ciphera.net/script.js"></script>'
}

export default async function IntegrationGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const integration = getIntegration(slug)
  if (!integration) notFound()

  const docsUrl = integrationDocsUrl(integration)
  const related = integration.relatedIds
    .map((id) => getIntegration(id))
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
  const isPlugin = integration.installMethod === 'plugin'
  const hasNote = Boolean(integration.snippet?.note)
  const caveat =
    integration.supportTier === 'plan-gated' || integration.supportTier === 'special-handling'

  return (
    <>
      <MarketingSection>
        <div className="max-w-3xl">
          <Link
            href="/integrations"
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ← All integrations
          </Link>

          <div className="mt-8 flex items-center gap-4">
            <div className="shrink-0 [&_svg]:h-10 [&_svg]:w-10">{integration.icon}</div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {integration.name}
                </h1>
                <TierBadge tier={integration.supportTier} />
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {categoryLabels[integration.category]} · {INSTALL_METHOD_LABEL[integration.installMethod]}
              </p>
            </div>
          </div>

          <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {integration.description}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {supportTierDescriptions[integration.supportTier]}
          </p>
        </div>

        {/* Caveat banner for plan-gated / special-handling platforms. */}
        {caveat && hasNote && (
          <div className="mt-8 max-w-3xl rounded-none border border-amber-500/25 bg-amber-500/5 p-5">
            <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-amber-400">
              Before you start
            </p>
            <p className="text-sm leading-relaxed text-foreground">{integration.snippet?.note}</p>
          </div>
        )}

        {/* Install snippet or plugin CTA. */}
        <div className="mt-8 max-w-3xl">
          {isPlugin ? (
            <div className="rounded-none border border-border bg-card p-6">
              <p className="text-sm leading-relaxed text-foreground">{integration.snippet?.note}</p>
              {integration.snippet?.cta && (
                <a
                  href={integration.snippet.cta.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-none bg-brand-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-orange/90"
                >
                  {integration.snippet.cta.text}
                  <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </div>
          ) : (
            <div className="rounded-none border border-border overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-brand-orange via-brand-orange/60 to-transparent" />
              <div className="bg-neutral-950 p-5">
                <p className="mb-3 font-mono text-xs text-muted-foreground">
                  {integration.snippet?.label ?? 'Add to your site’s <head>'}
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[13px] leading-relaxed text-neutral-300">
                  {renderSnippet(integration.snippet?.code)}
                </pre>
              </div>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Set <code className="font-mono text-neutral-400">data-domain</code> to the domain you
            registered in Pulse. Configure feature toggles, SRI, and storage from the install panel
            in your dashboard.
          </p>
        </div>

        {/* Guides + CSP. */}
        <div className="mt-8 flex max-w-3xl flex-wrap items-center gap-4">
          {docsUrl && (
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-orange transition-colors hover:text-brand-orange/80"
            >
              {integration.name} guide →
            </a>
          )}
          <a
            href="https://help.ciphera.net/docs/pulse/csp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            CSP &amp; troubleshooting →
          </a>
        </div>
      </MarketingSection>

      {/* Related integrations. */}
      {related.length > 0 && (
        <MarketingSection>
          <p className="mb-6 font-mono text-xs text-muted-foreground">Related</p>
          <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => (
              <Link
                key={r.id}
                href={`/integrations/${r.id}`}
                className="flex items-center gap-3 bg-card p-4 transition-colors hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="shrink-0 [&_svg]:h-6 [&_svg]:w-6">{r.icon}</div>
                <span className="text-sm font-semibold text-foreground">{r.name}</span>
                <TierBadge tier={r.supportTier} className="ml-auto" />
              </Link>
            ))}
          </div>
        </MarketingSection>
      )}
    </>
  )
}
