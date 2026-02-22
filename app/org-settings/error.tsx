'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function OrgSettingsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Organization settings failed to load"
      message="We couldn't load your organization settings. Please try again."
      onRetry={reset}
    />
  )
}
