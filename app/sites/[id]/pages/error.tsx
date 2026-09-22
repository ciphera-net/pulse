'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function PagesError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Pages failed to load"
      message="We couldn't load this site's pages. This might be a temporary issue — try again."
      onRetry={reset}
      error={error}
    />
  )
}
