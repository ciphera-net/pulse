'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function FunnelsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Funnels failed to load"
      message="We couldn't load your funnels. This might be a temporary issue — try again."
      onRetry={reset}
    />
  )
}
