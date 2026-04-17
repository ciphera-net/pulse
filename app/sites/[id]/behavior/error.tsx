'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function BehaviorError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Behavior data failed to load"
      message="We couldn't load the frustration signals. This might be a temporary issue — try again."
      onRetry={reset}
      error={error}
    />
  )
}
