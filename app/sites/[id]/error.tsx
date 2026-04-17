'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Dashboard failed to load"
      message="We couldn't load your site analytics. This might be a temporary issue — try again."
      onRetry={reset}
      error={error}
    />
  )
}
