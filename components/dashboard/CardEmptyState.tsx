'use client'

import type { ComponentProps } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { REALTIME_EMPTY_LINE } from '@/lib/dashboard/realtimeRange'

/**
 * A dashboard card's empty state, realtime-aware.
 *
 * In realtime mode an empty block means "nobody in the last five minutes", not "no
 * data yet" — and the ordinary copy gives the wrong advice there ("Try expanding the
 * time range", an install prompt, "Nobody's linked to you yet", which reads as "never").
 * Owner decision 25-09-2026: every realtime block reads the one line instead.
 */
export default function CardEmptyState({
  live = false,
  ...props
}: ComponentProps<typeof EmptyState> & { live?: boolean }) {
  if (live) return <EmptyState icon={props.icon} title={REALTIME_EMPTY_LINE} className={props.className} />
  return <EmptyState {...props} />
}
