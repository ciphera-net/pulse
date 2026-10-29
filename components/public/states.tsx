'use client'

import Link from 'next/link'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { scopeHref, type SiteScope } from '@/lib/scope/SiteScope'

/**
 * The states of a public page that is not a page: plain, with nothing to configure and no
 * call to action beyond the one way back.
 */

/**
 * A page this scope does not show: an unknown address, a page its owner has not shared, or
 * one that is never public (a new funnel, an edit, Visitors). It renders inside the shell,
 * and links back to the first thing that IS shared, the dashboard when there is one.
 */
export function NotShared({ scope }: { scope: SiteScope }) {
  const target = scope.pages.includes('dashboard') ? 'dashboard' : scope.pages[0]
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <h1 className="text-title-2 font-semibold text-neutral-100">This page isn&apos;t shared.</h1>
      {target && (
        <Link
          href={scopeHref(scope, target)}
          className="text-sm text-brand-ink underline-offset-2 transition-colors duration-fast ease-apple hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
        >
          {target === 'dashboard' ? 'Go to the shared dashboard' : 'Go to what is shared'}
        </Link>
      )}
    </div>
  )
}

/** A whole-viewport notice: there is no site to put a shell around. */
export function StandaloneNotice({ title, description }: { title: string; description?: string }) {
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-title-2 font-semibold text-neutral-100">{title}</h1>
      {description && <p className="max-w-sm text-caption text-neutral-400">{description}</p>}
    </main>
  )
}

/** The view could not be read at all: say so, and let the reader try again. */
export function LoadFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-[100dvh] items-center justify-center">
      <ErrorCard title="This dashboard didn't load" description="Check your connection, then try again." onRetry={onRetry} />
    </main>
  )
}
