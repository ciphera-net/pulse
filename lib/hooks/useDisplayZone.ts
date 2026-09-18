'use client'

import { useMemo } from 'react'
import { usePreferences, type TimeDisplay } from '@/lib/hooks/usePreferences'
import { browserTimeZone } from '@/lib/utils/timezones'
import { safeTimeZone } from '@/lib/utils/siteTime'

/**
 * The zone every INSTANT on a page renders in, resolved from the person's
 * `time_display` preference (Account › Profile › Show times in).
 *
 * This is for instants only — a check stamp, an incident start, a "last seen".
 * Day-bucketed data (daily charts, uptime days, funnels, the visitor unit) is
 * the SITE's calendar, frozen at write time, and never follows this. Pass the
 * site's own timezone to those, not `zone`. See
 * Pulse/docs/plans/18-09-2026-display-timezone-design.md §2 and §4.3.
 */
export interface DisplayZone {
  mode: TimeDisplay
  /** IANA zone to hand to the siteTime formatters. */
  zone: string
  /** Short human label naming the zone, for a caption beside a stamp. */
  label: string
}

/**
 * Pure resolution, exported for tests and for non-hook callers.
 *
 * | mode    | with a site               | without a site (account pages) |
 * |---------|---------------------------|--------------------------------|
 * | site    | the site's zone           | the browser's zone             |
 * | local   | the browser's zone        | the browser's zone             |
 * | utc     | UTC                       | UTC                            |
 *
 * `site` without a site falls to the browser's zone on purpose: an account
 * page has no site calendar to honour, and rendering a device's last-seen
 * stamp in UTC for someone who chose "Site's timezone" would be a surprise.
 */
export function resolveDisplayZone(
  mode: TimeDisplay,
  siteTimezone: string | null | undefined,
  browserZone: string,
): DisplayZone {
  if (mode === 'utc') return { mode, zone: 'UTC', label: 'UTC' }
  if (mode === 'site' && siteTimezone) {
    const zone = safeTimeZone(siteTimezone)
    return { mode, zone, label: `Site's timezone · ${zone}` }
  }
  const zone = safeTimeZone(browserZone)
  return { mode, zone, label: `Your timezone · ${zone}` }
}

export function useDisplayZone(siteTimezone?: string | null): DisplayZone {
  const { timeDisplay } = usePreferences()
  // The browser's zone is read per render rather than memoised for the
  // session: it changes when a laptop crosses a border with the tab open, and
  // "My timezone" should follow it.
  const browserZone = browserTimeZone()
  return useMemo(
    () => resolveDisplayZone(timeDisplay, siteTimezone, browserZone),
    [timeDisplay, siteTimezone, browserZone],
  )
}
