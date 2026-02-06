/**
 * @file Shared layout component for individual integration guide pages.
 *
 * Provides the background atmosphere, back-link, header (logo + title),
 * prose-styled content area, and a related integrations section.
 */

import Link from 'next/link'
import { ArrowLeftIcon, ArrowRightIcon } from '@ciphera-net/ui'
import { type ReactNode } from 'react'
import { type Integration, getIntegration } from '@/lib/integrations'

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

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden selection:bg-brand-orange/20">
      {/* * --- ATMOSPHERE (Background) --- */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-orange/10 rounded-full blur-[128px] opacity-60" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neutral-500/10 dark:bg-neutral-400/10 rounded-full blur-[128px] opacity-40" />
        <div
          className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.05]"
          style={{ maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }}
        />
      </div>

      <div className="flex-grow w-full max-w-4xl mx-auto px-4 pt-12 pb-10 z-10">
        <Link
          href="/integrations"
          className="inline-flex items-center text-sm text-neutral-500 hover:text-brand-orange mb-8 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          Back to Integrations
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
            {headerIcon}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 dark:text-white">
            {integration.name} Integration
          </h1>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          {children}
        </div>

        {/* * --- Related Integrations --- */}
        {relatedIntegrations.length > 0 && (
          <div className="mt-16 pt-10 border-t border-neutral-200 dark:border-neutral-800">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white mb-6">
              Related Integrations
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {relatedIntegrations.map((related) => (
                <Link
                  key={related.id}
                  href={`/integrations/${related.id}`}
                  className="group flex items-center gap-4 p-4 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 rounded-xl hover:border-brand-orange/50 dark:hover:border-brand-orange/50 transition-all duration-300"
                >
                  <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg shrink-0 [&_svg]:w-6 [&_svg]:h-6">
                    {related.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-neutral-900 dark:text-white block">
                      {related.name}
                    </span>
                    <span className="text-sm text-neutral-500 dark:text-neutral-400 truncate block">
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
