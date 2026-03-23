'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function CDNError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="CDN data failed to load"
      message="We couldn't load the BunnyCDN data. This might be a temporary issue — try again."
      onRetry={reset}
    />
  )
}
