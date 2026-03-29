/**
 * @file Shared layout component for individual integration guide pages.
 *
 * Provides the background atmosphere, back-link, header (logo + title),
 * category badge, prose-styled content area, and a related integrations section.
 * Styling matches ciphera-website /learn article layout for consistency.
 */

import Link from 'next/link'
import { ArrowLeftIcon, ArrowRightIcon } from '@ciphera-net/ui'
import { type ReactNode } from 'react'
import { type Integration, getIntegration, categoryLabels } from '@/lib/integrations'

interface IntegrationGuideProps {
  /** Integration metadata (name, icon, etc.) */
  integration: Integration
  /** Guide content rendered inside the prose area */
  children: ReactNode
}

/**
 * Renders the full-page layout for a single integration guide,
 * including related integrations at the bottom.
 */
export function IntegrationGuide({ integration, children }: IntegrationGuideProps) {
  // * Scale the icon up for the detail-page header (w-10 h-10)
  const headerIcon = (
    <div className="[&_svg]:w-10 [&_svg]:h-10">
      {integration.icon}
    </div>
  )

  // * Resolve related integrations from IDs
  const relatedIntegrations = integration.relatedIds
    .map((id) => getIntegration(id))
    .filter((i): i is Integration => i !== undefined)
    .slice(0, 4)

  const categoryLabel = categoryLabels[integration.category]

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden">
      {/* * --- ATMOSPHERE (Background) --- */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neutral-400/10 rounded-full blur-[128px] opacity-40" />
        <div
          className="absolute inset-0 bg-grid-pattern opacity-[0.05]"
          style={{ maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }}
        />
      </div>

      <div className="flex-grow w-full max-w-4xl mx-auto px-4 pt-20 pb-10 z-10">
        {/* * --- Back link --- */}
        <Link
          href="/integrations"
          className="inline-flex items-center text-sm text-neutral-500 hover:text-brand-orange mb-8 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          Back to Integrations
        </Link>

        {/* * --- Category + Official site badges --- */}
        <div className="flex items-center gap-2 mb-4">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border"
            style={{
              color: integration.brandColor,
              borderColor: `${integration.brandColor}33`,
              backgroundColor: `${integration.brandColor}15`,
            }}
          >
            <div className="[&_svg]:w-3.5 [&_svg]:h-3.5">{integration.icon}</div>
            {integration.name}
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full border border-neutral-700 bg-neutral-800 text-xs text-neutral-400">
            {categoryLabel}
          </span>
        </div>

        {/* * --- Title --- */}
        <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-8">
          {integration.name} Integration
        </h1>

        {/* * --- Prose content (matches ciphera-website /learn styling) --- */}
        <div className="prose prose-invert prose-neutral max-w-none prose-headings:text-white prose-a:text-brand-orange prose-a:no-underline hover:prose-a:underline prose-strong:text-white prose-code:text-brand-orange prose-code:bg-neutral-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
          {children}

          <hr className="my-8 border-neutral-800" />
          <h3>Optional: Frustration Tracking</h3>
          <p>
            Detect rage clicks and dead clicks by adding the frustration tracking
            add-on after the core script:
          </p>
          <pre><code>{`<script defer src="https://pulse.ciphera.net/script.frustration.js"></script>`}</code></pre>
          <p>
            No extra configuration needed. Add <code>data-no-rage</code> or{' '}
            <code>data-no-dead</code> to disable individual signals.
          </p>
        </div>

        {/* * --- Related Integrations --- */}
        {relatedIntegrations.length > 0 && (
          <div className="mt-16 pt-10 border-t border-neutral-800">
            <h2 className="text-xl font-bold text-white mb-6">
              Related Integrations
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {relatedIntegrations.map((related) => (
                <Link
                  key={related.id}
                  href={`/integrations/${related.id}`}
                  className="group flex items-center gap-4 p-4 bg-neutral-900/50 backdrop-blur-sm border border-neutral-800 rounded-xl hover:border-brand-orange/50 transition-all duration-300"
                >
                  <div className="p-2 bg-neutral-800 rounded-lg shrink-0 [&_svg]:w-6 [&_svg]:h-6">
                    {related.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-white block">
                      {related.name}
                    </span>
                    <span className="text-sm text-neutral-400 truncate block">
                      {related.description}
                    </span>
                  </div>
                  <ArrowRightIcon className="w-4 h-4 text-neutral-400 group-hover:text-brand-orange shrink-0 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
