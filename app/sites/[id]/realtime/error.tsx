'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function RealtimeError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Realtime view failed to load"
      message="We couldn't connect to the realtime data stream. Please try again."
      onRetry={reset}
    />
  )
}
