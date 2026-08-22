// ---------------------------------------------------------------------------
// Site-time display for INSTANTS (owner decision 22-08-2026 — the
// site-timezone alignment design). A timestamp is a real moment; rendering it
// in the site's timezone is pure display conversion and always honest. The
// full stamp self-labels with the zone abbreviation so it can never silently
// disagree with a reader's expectation.
//
// Day-BUCKETED data is deliberately out of scope here: a frozen day row
// bucketed under a foreign calendar must never be relabelled — see
// Pulse/docs/plans/22-08-2026-site-timezone-alignment-design.md.
// ---------------------------------------------------------------------------

/** A zone Intl will accept, falling back to UTC — never throws. */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC'
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

/** "13 Aug 2026, 23:15 CEST" — full, self-labelled site-time stamp. */
export function formatSiteStamp(iso: string, tz: string | null | undefined): string {
  const zone = safeTimeZone(tz)
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: zone,
  })
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: zone,
    timeZoneName: 'short',
  })
  return `${date}, ${time}`
}

/** "13 Aug, 23:15" — compact variant; the page's status line carries the
 * zone-labelled stamp, so this one stays terse. */
export function formatSiteStampShort(iso: string, tz: string | null | undefined): string {
  const zone = safeTimeZone(tz)
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: zone })
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: zone,
  })
  return `${date}, ${time}`
}

/** "13 Aug" — day label for an instant (axis ticks and the like). */
export function formatSiteDay(iso: string, tz: string | null | undefined): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: safeTimeZone(tz),
  })
}
