'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Something went wrong"
      message="An unexpected error occurred. Please try again or go back to the dashboard."
      onRetry={reset}
    />
  )
}
