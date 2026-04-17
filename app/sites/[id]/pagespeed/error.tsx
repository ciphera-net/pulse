'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function PageSpeedError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="PageSpeed data failed to load"
      message="We couldn't load the PageSpeed data. This might be a temporary issue — try again."
      onRetry={reset}
      error={error}
    />
  )
}
