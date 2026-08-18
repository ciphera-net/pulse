'use client'

import ErrorDisplay from '@/components/ErrorDisplay'

// Chunk-failure self-healing happens inside ErrorDisplay (shared by every route
// boundary), not here — see components/ErrorDisplay.tsx and lib/chunk-recovery.ts.
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorDisplay
      title="Something went wrong"
      message="An unexpected error occurred. Please try again or go back to the dashboard."
      onRetry={reset}
      error={error}
    />
  )
}
