'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function NotificationsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Notifications failed to load"
      message="We couldn't load your notifications. Please try again."
      onRetry={reset}
    />
  )
}
