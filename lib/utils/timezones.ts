// ---------------------------------------------------------------------------
// The site-timezone list, shared by every place a person picks or is assigned a
// zone: Site › General, the two site-creation forms, and the display-zone
// resolver. One list, one detection, so three forms cannot disagree on what a
// zone is called or which one a browser is in (they did — see
// Pulse/docs/plans/18-09-2026-display-timezone-design.md §1.2).
//
// 🔴 THE LIST IS OURS, NOT THE BROWSER'S (21-09-2026, PULSE-5). It used to be
// `Intl.supportedValuesOf('timeZone')` — 418 rows in one unsearchable dropdown.
// Two things were wrong with that, and only one of them was the length:
//
//   1. 418 rows to scroll for a field every new site sets once.
//   2. The names were the BROWSER's. This ICU enumerates `Asia/Calcutta`,
//      `Asia/Saigon`, `Asia/Rangoon`, `Europe/Kiev`, `Asia/Katmandu` and
//      `America/Buenos_Aires` — never the modern spellings, though `Intl`
//      accepts those when asked directly. One estate site is stored as
//      `Asia/Saigon` for exactly that reason. A list we author uses the
//      current names; a list the browser hands us cannot.
//
// 🔑 WHAT THE SHORT LIST MAY NOT COST. A site's timezone decides its day
// boundary, so the list must be able to express every boundary that exists.
// Group the 418 zones by their (January, July) offset pair and there are 57
// distinct classes — 23 that observe DST, 34 fixed. The entries below cover
// all 57; `__tests__/timezones.test.ts` fails if a future edit drops one.
// Extra cities beyond that floor are there for recognition, not for reach:
// Madrid and Paris are the same class, and people look for their own city.
// ---------------------------------------------------------------------------

import { safeTimeZone } from '@/lib/utils/siteTime'

export interface TimezoneOption {
  value: string
  label: string
}

export interface TimezoneGroup {
  label: string
  options: TimezoneOption[]
}

/**
 * The curated zones, in display order: by region, then west to east within it.
 * Values are modern IANA names — `Intl` and Go's `time.LoadLocation` both
 * accept them, whatever this browser's ICU happens to enumerate.
 */
const CURATED: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['Europe', [
    'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Atlantic/Reykjavik', 'Atlantic/Azores',
    'Europe/Madrid', 'Europe/Paris', 'Europe/Brussels', 'Europe/Amsterdam', 'Europe/Berlin',
    'Europe/Zurich', 'Europe/Rome', 'Europe/Vienna', 'Europe/Prague', 'Europe/Warsaw',
    'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/Budapest', 'Europe/Belgrade',
    'Europe/Sofia', 'Europe/Athens', 'Europe/Helsinki', 'Europe/Bucharest', 'Europe/Kyiv',
    'Europe/Istanbul', 'Europe/Moscow',
  ]],
  ['North America', [
    'America/Adak', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Vancouver',
    'America/Phoenix', 'America/Denver', 'America/Chicago', 'America/Winnipeg', 'America/Mexico_City',
    'America/New_York', 'America/Toronto', 'America/Halifax', 'America/St_Johns', 'America/Miquelon',
    'America/Nuuk',
  ]],
  ['Latin America & Caribbean', [
    'Pacific/Easter', 'America/Lima', 'America/Bogota', 'America/Guatemala', 'America/Panama',
    'America/Havana', 'America/Santo_Domingo', 'America/Puerto_Rico', 'America/Caracas', 'America/La_Paz',
    'America/Santiago', 'America/Asuncion', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
    'America/Montevideo', 'America/Noronha',
  ]],
  ['Africa & Middle East', [
    'Atlantic/Cape_Verde', 'Africa/Dakar', 'Africa/Accra', 'Africa/Casablanca', 'Africa/Lagos',
    'Africa/Algiers', 'Africa/Tunis', 'Africa/Kinshasa', 'Africa/Cairo', 'Africa/Johannesburg',
    'Africa/Khartoum', 'Asia/Jerusalem', 'Asia/Beirut', 'Asia/Amman', 'Africa/Nairobi',
    'Africa/Addis_Ababa', 'Asia/Baghdad', 'Asia/Riyadh', 'Asia/Tehran', 'Asia/Dubai',
  ]],
  ['Asia', [
    'Asia/Tbilisi', 'Asia/Yerevan', 'Asia/Baku', 'Asia/Kabul', 'Asia/Karachi',
    'Asia/Tashkent', 'Asia/Almaty', 'Asia/Kolkata', 'Asia/Colombo', 'Asia/Kathmandu',
    'Asia/Dhaka', 'Asia/Yangon', 'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Ho_Chi_Minh',
    'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Manila', 'Asia/Hong_Kong', 'Asia/Shanghai',
    'Asia/Taipei', 'Asia/Seoul', 'Asia/Tokyo', 'Asia/Magadan',
  ]],
  ['Australia & Pacific', [
    'Australia/Perth', 'Australia/Eucla', 'Australia/Darwin', 'Australia/Adelaide', 'Australia/Brisbane',
    'Australia/Sydney', 'Australia/Melbourne', 'Australia/Hobart', 'Australia/Lord_Howe',
    'Pacific/Port_Moresby', 'Pacific/Guam', 'Pacific/Guadalcanal', 'Pacific/Norfolk', 'Pacific/Auckland',
    'Pacific/Chatham', 'Pacific/Fiji', 'Pacific/Tongatapu', 'Pacific/Apia', 'Pacific/Kiritimati',
    'Pacific/Pago_Pago', 'Pacific/Marquesas', 'Pacific/Gambier', 'Pacific/Pitcairn', 'Antarctica/Troll',
  ]],
  ['Coordinated Universal Time', ['UTC']],
] as const

/** "Europe/Brussels (GMT+2)" — the zone, then the offset it is on right now. */
function labelFor(tz: string, now: Date): string {
  const name = tz.replace(/_/g, ' ')
  let offset = ''
  try {
    offset =
      new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
        .formatToParts(now)
        .find(p => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    // A zone this runtime does not know: show the name alone rather than lose
    // the row. Never throws — this feeds a render.
    return name
  }
  return offset ? `${name} (${offset})` : name
}

/**
 * The curated zones as option groups, offsets resolved once per module load.
 * A zone this runtime rejects outright is dropped rather than rendered dead.
 */
export const TIMEZONE_GROUPS: TimezoneGroup[] = (() => {
  const now = new Date()
  const accepts = (tz: string) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz })
      return true
    } catch {
      return false
    }
  }
  return CURATED.map(([label, zones]) => ({
    label,
    options: zones.filter(accepts).map(tz => ({ value: tz, label: labelFor(tz, now) })),
  })).filter(g => g.options.length > 0)
})()

/** Every curated option, flattened — for membership checks and tests. */
export const TIMEZONE_OPTIONS: TimezoneOption[] = TIMEZONE_GROUPS.flatMap(g => g.options)

/**
 * The groups to render for a picker whose current value is `current`.
 *
 * 🔴 A STORED ZONE IS NEVER SILENTLY DROPPED. Sites created before this list
 * existed can hold any of the 418 — including the browser-spelled ones the
 * curated list deliberately does not offer (`Asia/Saigon`, `Europe/Kiev`). If
 * the stored zone is not curated it gets its own group at the top, so the
 * picker shows what the site actually uses instead of falling back to the
 * placeholder, and nothing is changed behind the owner's back.
 */
export function timezoneGroupsFor(current: string | null | undefined): TimezoneGroup[] {
  if (!current || TIMEZONE_OPTIONS.some(o => o.value === current)) return TIMEZONE_GROUPS
  return [
    { label: 'Current setting', options: [{ value: current, label: labelFor(current, new Date()) }] },
    ...TIMEZONE_GROUPS,
  ]
}

/**
 * The zone this browser is in, as a value the backend's `time.LoadLocation`
 * will accept. Never throws and never returns an empty string: an exotic or
 * unknown resolved zone falls to UTC rather than producing a 400 on site
 * creation or an omitted field (which is how sites ended up silently on UTC).
 *
 * The result is NOT forced onto the curated list — a browser reporting
 * `Asia/Saigon` prefills exactly that, and `timezoneGroupsFor` shows it.
 */
export function browserTimeZone(): string {
  try {
    return safeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return 'UTC'
  }
}

/**
 * The date picker's caption line (owner pick "A", options round 19-09-2026):
 * the one place the dashboard says that DAYS are the site's calendar, shown
 * only while a range is being chosen. One string, so every page agrees.
 */
export function siteDaysCaption(tz: string | null | undefined): string {
  return `Days follow the site's timezone · ${safeTimeZone(tz)}`
}
