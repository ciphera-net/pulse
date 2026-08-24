'use client'

import { useEffect } from 'react'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { isChunkLoadError } from '@/lib/chunk-recovery'
import { useChunkRecovery } from '@/lib/hooks/useChunkRecovery'

interface InlineErrorDisplayProps {
  title: string
  description?: string
  onRetry?: () => void
  error?: Error
}

/**
 * In-shell counterpart to ErrorDisplay, for error.tsx boundaries whose LAYOUT
 * must survive the crash — settings (the tab rail stays usable) and setup (the
 * stepper keeps showing saved progress). Renders the approved ErrorCard device
 * instead of the full illustration page, but carries the same two contracts as
 * ErrorDisplay, because a boundary that drops them regresses silently:
 *
 * 1. The client-error beacon — a crash nobody reports is a crash that never
 *    gets fixed.
 * 2. The chunk-failure self-heal — a stale tab meeting a new deploy is a
 *    routine reload, not an error to show. Next.js delivers failed route
 *    imports to the NEAREST boundary, so any boundary that renders neither
 *    ErrorDisplay nor this component opts its whole segment out of recovery.
 */
export default function InlineErrorDisplay({ title, description, onRetry, error }: InlineErrorDisplayProps) {
  const chunkFailure = isChunkLoadError(error)
  const phase = useChunkRecovery(error)

  useEffect(() => {
    if (error && typeof window !== 'undefined') {
      navigator.sendBeacon?.(
        '/api/client-errors',
        new Blob([JSON.stringify({
          message: error.message,
          stack: error.stack?.slice(0, 500),
          url: window.location.href,
          timestamp: new Date().toISOString(),
          chunkRecovery: chunkFailure,
        })], { type: 'application/json' })
      )
    }
  }, [error, chunkFailure])

  // While the recovery reload is in flight (or still being decided), do not
  // flash the error card for what is really a routine self-heal.
  if (phase !== 'show') return null

  return (
    <div className="border border-neutral-800 bg-neutral-900/40 rounded-none">
      <ErrorCard title={title} description={description} onRetry={onRetry} />
    </div>
  )
}
