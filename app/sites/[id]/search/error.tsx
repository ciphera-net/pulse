'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function SearchError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Search Console data failed to load"
      message="We couldn't load the Google Search Console data. This might be a temporary issue — try again."
      onRetry={reset}
    />
  )
}
