'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

// No "go to dashboard" link here: the marketing page frames /demo, and a link to / would load
// that page inside its own frame. Retrying is the one way on.
export default function DemoError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="The demo failed to load"
      message="We couldn't load this page of the demo. It may be temporarily unavailable. Try again."
      onRetry={reset}
      onGoHome={false}
      error={error}
    />
  )
}
