'use client'

import { Button } from '@ciphera-net/ui'

interface ErrorDisplayProps {
  title?: string
  message?: string
  onRetry?: () => void
  onGoHome?: boolean
}

/**
 * Shared error UI for route-level error.tsx boundaries.
 * Matches the visual style of the 404 page.
 */
export default function ErrorDisplay({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again or go back to the dashboard.',
  onRetry,
  onGoHome = true,
}: ErrorDisplayProps) {
  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-500/10 rounded-full blur-[128px] opacity-60" />
        <div
          className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.05]"
          style={{ maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }}
        />
      </div>

      <div className="text-center px-4 z-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 mb-6">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">
          {title}
        </h2>
        <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-md mx-auto mb-10 leading-relaxed">
          {message}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          {onRetry && (
            <Button variant="primary" onClick={onRetry} className="px-8 py-3">
              Try again
            </Button>
          )}
          {onGoHome && (
            <a href="/">
              <Button variant="secondary" className="px-8 py-3">
                Go to dashboard
              </Button>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
