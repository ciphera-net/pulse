'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function JourneysError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Journeys failed to load"
      message="We couldn't load the journey data. This might be a temporary issue — try again."
      onRetry={reset}
      error={error}
    />
  )
}
