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

// ─── Zone arithmetic ────────────────────────────────────────────────────────
// Minute-precision wall-clock parts of an instant in a zone, and the ms of a
// zone's midnight — what day-bucketed UIs need to clip, label and re-anchor
// ranges in the SITE's calendar without trusting the viewer's.

const zoneFormatters = new Map<string, Intl.DateTimeFormat>()

function zoneFormatter(zone: string): Intl.DateTimeFormat {
  let f = zoneFormatters.get(zone)
  if (!f) {
    // hourCycle 'h23', not hour12:false — the latter can render midnight as
    // "24", which corrupts every derived key below.
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    zoneFormatters.set(zone, f)
  }
  return f
}

export interface ZoneParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/** The wall-clock parts of an instant in the given zone (minute precision). */
export function zoneParts(d: Date, tz: string | null | undefined): ZoneParts {
  const parts = zoneFormatter(safeTimeZone(tz)).formatToParts(d)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** "YYYY-MM-DD" — which calendar day an instant falls on in the zone. */
export function zoneDayKey(d: Date, tz: string | null | undefined): string {
  const p = zoneParts(d, tz)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

function zoneOffsetMs(zone: string, atMs: number): number {
  const p = zoneParts(new Date(atMs), zone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  return asUtc - Math.floor(atMs / 60_000) * 60_000
}

/**
 * The instant (ms) of the zone's midnight for a "YYYY-MM-DD" day. Two-pass
 * offset resolution so a DST transition between the UTC guess and the real
 * midnight cannot shift the answer by the transition amount.
 */
export function zoneDayStartMs(dateStr: string, tz: string | null | undefined): number {
  const zone = safeTimeZone(tz)
  const utcGuess = Date.parse(dateStr + 'T00:00:00Z')
  const off1 = zoneOffsetMs(zone, utcGuess)
  const candidate = utcGuess - off1
  const off2 = zoneOffsetMs(zone, candidate)
  return off2 === off1 ? candidate : utcGuess - off2
}

/** "YYYY-MM-DD" shifted by whole days — pure date-string math, no zones. */
export function shiftDayKey(dateStr: string, days: number): string {
  const d = new Date(Date.parse(dateStr + 'T00:00:00Z') + days * 86_400_000)
  return d.toISOString().slice(0, 10)
}
