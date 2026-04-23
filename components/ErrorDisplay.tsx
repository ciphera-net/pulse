'use client'

import { useEffect } from 'react'
import { Button } from '@ciphera-net/ui'
import { cdnUrl } from '@/lib/cdn'

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
 */
export default function ErrorDisplay({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again or go back to the dashboard.',
  onRetry,
  onGoHome = true,
  error,
}: ErrorDisplayProps) {
  useEffect(() => {
    if (error && typeof window !== "undefined") {
      navigator.sendBeacon?.(
        "/api/client-errors",
        new Blob([JSON.stringify({
          message: error.message,
          stack: error.stack?.slice(0, 500),
          url: window.location.href,
          timestamp: new Date().toISOString(),
        })], { type: "application/json" })
      );
    }
  }, [error]);

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
