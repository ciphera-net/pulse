'use client'

import InlineErrorDisplay from '@/components/InlineErrorDisplay'

/**
 * Setup wizard error boundary — sits inside the setup layout, so the stepper
 * survives and a brand-new customer can see exactly where they are and that
 * completed steps are kept. Owner-approved shape (WS3 polish round,
 * 25-08-2026, option A over the full-page ErrorDisplay).
 */
export default function SetupError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <InlineErrorDisplay
      title="Setup hit a snag"
      description="Nothing was lost — your progress is saved. Retry to continue where you left off."
      onRetry={reset}
      error={error}
    />
  )
}
