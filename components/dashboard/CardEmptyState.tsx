'use client'

import type { ComponentProps } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { REALTIME_EMPTY_LINE } from '@/lib/dashboard/realtimeRange'
import { canWrite, useOptionalSiteScope } from '@/lib/scope/SiteScope'

/**
 * A dashboard card's empty state, realtime-aware and scope-aware.
 *
 * In realtime mode an empty block means "nobody in the last five minutes", not "no
 * data yet" — and the ordinary copy gives the wrong advice there ("Try expanding the
 * time range", an install prompt, "Nobody's linked to you yet", which reads as "never").
 * Owner decision 25-09-2026: every realtime block reads the one line instead.
 *
 * In a public view (the demo, a share link) the reader is not the site's owner, so the
 * ordinary copy gives the wrong advice there too: an install button that leads to settings
 * the reader cannot open, and sentences that speak to the owner ("Tag your links…"). An
 * empty block there says there is nothing yet, and nothing else: the action and the
 * description are dropped, and a title that addresses the owner is replaced by
 * `publicTitle`. It is decided HERE, from the ambient scope, so a card added later cannot
 * forget it. (PUL-34 Phase 2: no link to settings or Visitors anywhere in a public view.)
 */
export default function CardEmptyState({
  live = false,
  publicTitle,
  ...props
}: ComponentProps<typeof EmptyState> & {
  live?: boolean
  /** The title in a public view, where the ordinary one speaks to the owner ("Nobody's linked to you yet"). */
  publicTitle?: string
}) {
  const scope = useOptionalSiteScope()
  if (live) return <EmptyState icon={props.icon} title={REALTIME_EMPTY_LINE} className={props.className} />
  if (scope && !canWrite(scope)) {
    return <EmptyState icon={props.icon} title={publicTitle ?? props.title} className={props.className} />
  }
  return <EmptyState {...props} />
}
