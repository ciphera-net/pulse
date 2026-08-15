'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function PerformanceError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Performance data failed to load"
      message="We couldn't load the performance data. This might be a temporary issue — try again."
      onRetry={reset}
      error={error}
    />
  )
}
