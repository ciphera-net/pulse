'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function VisitorDetailError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="This visitor failed to load"
      message="We couldn't load this visitor's journeys. This might be a temporary issue — try again."
      onRetry={reset}
      error={error}
    />
  )
}
