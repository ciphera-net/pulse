'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function SiteSettingsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Settings failed to load"
      message="We couldn't load your site settings. Please try again."
      onRetry={reset}
    />
  )
}
