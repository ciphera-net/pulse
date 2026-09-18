// ---------------------------------------------------------------------------
// IANA timezone helpers shared by every place a person picks or is assigned a
// zone: Site › General, the two site-creation forms, and the display-zone
// resolver. One list, one detection, so three forms cannot disagree on what a
// zone is called or which one a browser is in (they did — see
// Pulse/docs/plans/18-09-2026-display-timezone-design.md §1.2).
// ---------------------------------------------------------------------------

import { safeTimeZone } from '@/lib/utils/siteTime'

export interface TimezoneOption {
  value: string
  label: string
}

function build(tz: string, offset: string): TimezoneOption {
  return {
    value: tz,
    label: offset ? `${tz.replace(/_/g, ' ')} (${offset})` : tz.replace(/_/g, ' '),
  }
}

/**
 * Full IANA zone list with each zone's live short offset, resolved once per
 * module load. Feeds every timezone Select.
 */
export const TIMEZONE_OPTIONS: TimezoneOption[] = (() => {
  try {
    const now = new Date()
    const list = Intl.supportedValuesOf('timeZone').map(tz => {
      const offset =
        new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
          .formatToParts(now)
          .find(p => p.type === 'timeZoneName')?.value ?? ''
      return build(tz, offset)
    })
    // ICU's canonical list omits plain 'UTC' (measured: Node 24, Chromium), and
    // UTC is both the backend's default and a value people pick on purpose.
    if (!list.some(o => o.value === 'UTC')) list.unshift(build('UTC', 'GMT'))
    return list
  } catch {
    // Fallback for environments without Intl.supportedValuesOf.
    return [
      build('UTC', 'GMT'),
      build('Europe/London', 'GMT'),
      build('Europe/Brussels', 'GMT+1'),
      build('America/New_York', 'GMT-5'),
      build('America/Los_Angeles', 'GMT-8'),
      build('Asia/Tokyo', 'GMT+9'),
    ]
  }
})()

/**
 * The option list with `current` guaranteed present. A zone the browser's ICU
 * does not know (a backend value from another ICU) still needs a legible row so
 * a Select can show its value instead of the placeholder.
 */
export function timezoneOptionsFor(current: string | null | undefined): TimezoneOption[] {
  if (current && !TIMEZONE_OPTIONS.some(o => o.value === current)) {
    return [{ value: current, label: current.replace(/_/g, ' ') }, ...TIMEZONE_OPTIONS]
  }
  return TIMEZONE_OPTIONS
}

/**
 * The zone this browser is in, as a value the backend's `time.LoadLocation`
 * will accept. Never throws and never returns an empty string: an exotic or
 * unknown resolved zone falls to UTC rather than producing a 400 on site
 * creation or an omitted field (which is how sites ended up silently on UTC).
 */
export function browserTimeZone(): string {
  try {
    return safeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return 'UTC'
  }
}
