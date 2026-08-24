'use client'

import InlineErrorDisplay from '@/components/InlineErrorDisplay'

/**
 * Settings error boundary — sits INSIDE SettingsShell (the segment layout), so
 * a crash in one tab keeps the header, sidebar and tab rail usable: the reader
 * can retry or simply pick another tab. Owner-approved shape (WS3 polish
 * round, 25-08-2026, option A over the full-page ErrorDisplay).
 */
export default function SettingsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <InlineErrorDisplay
      title="This settings page failed to load"
      description="Your settings are untouched — this is a loading problem, not a data problem. Retry, or pick another tab."
      onRetry={reset}
      error={error}
    />
  )
}
