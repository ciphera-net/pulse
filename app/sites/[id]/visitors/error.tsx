'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function VisitorsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Visitors failed to load"
      message="We couldn't load the visitor list. This might be a temporary issue — try again."
      onRetry={reset}
      error={error}
    />
  )
}
