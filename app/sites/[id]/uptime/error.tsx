'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function UptimeError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Uptime page failed to load"
      message="We couldn't load your uptime monitors. This might be a temporary issue — try again."
      onRetry={reset}
      error={error}
    />
  )
}
