'use client'

import { useEffect } from 'react'
import { Button } from '@ciphera-net/facet'
import { cdnUrl } from '@/lib/cdn'
import { isChunkLoadError } from '@/lib/chunk-recovery'
import { useChunkRecovery } from '@/lib/hooks/useChunkRecovery'

interface ErrorDisplayProps {
  title?: string
  message?: string
  onRetry?: () => void
  onGoHome?: boolean
  error?: Error
}

/**
 * Shared error UI for route-level error.tsx boundaries.
 * Matches the visual style of the 404 page.
 *
 * 🔑 CHUNK-FAILURE SELF-HEAL LIVES HERE, not in the individual error.tsx files.
 * Next.js App Router delivers a failed route import to the NEAREST error boundary
 * (measured 18-08-2026 — no global event fires), and this app has ten of them, one
 * per dashboard section. Every one of them renders this component with the error
 * prop, so recovering here covers them all — including boundaries added later, as
 * long as they follow the same convention. A chunk failure is a stale tab meeting a
 * new deploy, not an app bug: reload once (guarded, see lib/chunk-recovery.ts) to
 * pick up the current build; if the guard blocks, fall through to this visible UI.
 */
export default function ErrorDisplay({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again or go back to the dashboard.',
  onRetry,
  onGoHome = true,
  error,
}: ErrorDisplayProps) {
  const chunkFailure = isChunkLoadError(error)
  const phase = useChunkRecovery(error)

  useEffect(() => {
    if (error && typeof window !== "undefined") {
      navigator.sendBeacon?.(
        "/api/client-errors",
        new Blob([JSON.stringify({
          message: error.message,
          stack: error.stack?.slice(0, 500),
          url: window.location.href,
          timestamp: new Date().toISOString(),
          // Distinguish routine deploy-staleness self-heals from real crashes.
          chunkRecovery: chunkFailure,
        })], { type: "application/json" })
      );
    }
  }, [error, chunkFailure]);

  // While the recovery reload is in flight (or still being decided), do not flash
  // "Something went wrong" for what is really a routine self-heal.
  if (phase !== 'show') return null

  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-500/10 rounded-full blur-[128px] opacity-60" />
        <div
          className="absolute inset-0 bg-grid-pattern opacity-[0.05]"
          style={{ maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }}
        />
      </div>

      <div className="text-center px-4 z-10">
        <img
          src={cdnUrl('/illustrations/server-down.png')}
          alt="Something went wrong"
          className="w-80 h-auto mx-auto mb-8"
        />

        <h2 className="text-2xl font-bold text-white mb-4">
          {title}
        </h2>
        <p className="text-lg text-neutral-400 max-w-md mx-auto mb-10 leading-relaxed">
          {message}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          {onRetry && (
            <Button variant="default" onClick={onRetry} className="px-8 py-3">
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
