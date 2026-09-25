'use client'

import { useCallback, useRef } from 'react'
import { isRealtimePeriod, periodOnLeavingRealtime, type PreviousView } from '@/lib/dashboard/realtimeRange'
import { DEFAULT_PERIOD, type Period } from './periodUrl'
import type { UrlDateRange } from './useUrlDateRange'

/**
 * The orb's switch into realtime and back — ONE implementation for every page that has
 * the orb as a toggle (the dashboard and Visitors). The share page's orb is display-only
 * and never calls this.
 *
 * Leaving realtime returns to the view the reader was on — not to the default.
 *
 * 🔴 This used to jump to DEFAULT_PERIOD, on the reasoning that the URL is the state and
 * a remembered period could disagree with a shared link. That was the wrong trade:
 * glancing at the live view is a detour, and a detour that silently rewrites where you
 * were is a bug. Somebody on "Last 7 days" who checks who is on the site now expects to
 * land back on Last 7 days.
 *
 * The previous view is held in a ref — deliberately NOT in the URL, which is what keeps a
 * shared ?period=realtime link honest: it carries the live view and nothing about the
 * sender's private history. A recipient has no ref, so they fall through to their OWN
 * stored view (or the default), which is the right answer for them rather than a
 * stranger's.
 *
 * The previous view is what was REQUESTED, span included for a custom range: a closest
 * view or a clamp re-derives itself from the request on return, and restoring the token
 * alone would send somebody on a hand-picked span back to a row of the same name but
 * different dates. Returning is a RESTORE, not a pick: it writes the URL and never the
 * memory — realtime is a mode, and nothing about entering or leaving it is remembered.
 */
export function useRealtimeToggle(
  range: Pick<UrlDateRange, 'period' | 'requested' | 'remembered' | 'setPeriod' | 'restoreView'>,
  fallback: Period = DEFAULT_PERIOD,
): { isLive: boolean; toggle: () => void } {
  const { period, requested, remembered, setPeriod, restoreView } = range
  const isLive = isRealtimePeriod(period)
  const previousRef = useRef<PreviousView | null>(null)

  const toggle = useCallback(() => {
    if (isLive) {
      const previous = previousRef.current
      previousRef.current = null
      restoreView(periodOnLeavingRealtime(previous, remembered, fallback))
      return
    }
    previousRef.current =
      requested.period === 'custom' && requested.range
        ? { period: 'custom', range: { start: requested.range.start, end: requested.range.end } }
        : { period: requested.period }
    setPeriod('realtime')
  }, [isLive, requested, remembered, fallback, setPeriod, restoreView])

  return { isLive, toggle }
}
