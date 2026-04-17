'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function ShareError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Dashboard failed to load"
      message="We couldn't load this public dashboard. It may be temporarily unavailable — try again."
      onRetry={reset}
      error={error}
    />
  )
}
