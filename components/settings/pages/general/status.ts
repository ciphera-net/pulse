import type { InstallStatusResponse } from '@/lib/api/sites'
import { knownCauses, INGEST_CAUSE_PHRASE } from '@/lib/ingest-causes'

/**
 * General's one status for the tracking script (settings overhaul, copy deck §3.3 and §4.4), as a state and the fact
 * behind it. Pure, so every state is pinned by a test: the page only draws what this returns.
 */
export type ScriptState =
  | { kind: 'checking' }
  | { kind: 'error' }
  | { kind: 'waiting'; caption: string }
  /** An event in the last day; `here` while someone has been on the site in the last 5 minutes (R7's halo). */
  | { kind: 'receiving'; caption: string; here: boolean }
  /** Active, but the last event is a day to 14 days old (§4.4: the words follow the age of the last event). */
  | { kind: 'quiet'; label: string }
  | { kind: 'stopped'; label: string }

const DAY = 86_400_000

/** One time format (copy deck §2): just now, 27 min ago, 3 h ago, 2 days ago, 3 Nov. */
export function ago(iso: string, now: number = Date.now()): string {
  const s = (now - Date.parse(iso)) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 7 * 86400) {
    const d = Math.floor(s / 86400)
    return `${d} day${d === 1 ? '' : 's'} ago`
  }
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function scriptState(
  install: InstallStatusResponse | undefined,
  failed: boolean,
  domain: string,
  now: number = Date.now(),
): ScriptState {
  if (!install) return failed ? { kind: 'error' } : { kind: 'checking' }
  if (install.install_status === 'never_installed') {
    return { kind: 'waiting', caption: `Open ${domain} in a browser and it shows here within seconds.` }
  }
  const last = install.last_event_at
  if (install.install_status === 'stalled') {
    // The server calls a site stalled once its last event is 14 days old; with no stamp, that is the least it can be.
    const days = last ? Math.floor((now - Date.parse(last)) / DAY) : 14
    return { kind: 'stopped', label: `No events for ${days} day${days === 1 ? '' : 's'}` }
  }
  if (!last) return { kind: 'quiet', label: 'Last event not recorded' }
  const age = now - Date.parse(last)
  if (age < DAY) return { kind: 'receiving', caption: `Last event ${ago(last, now)}`, here: age < 5 * 60_000 }
  return { kind: 'quiet', label: `Last event ${ago(last, now)}` }
}

/**
 * The turned-away line, or null when nothing was: only the three causes a site owner may be told, in their published
 * order (copy deck §3.3). A cause this build does not know is skipped, never printed.
 */
export function turnedAwayLine(rejected: boolean | undefined, causes: readonly unknown[] | undefined): string | null {
  if (!rejected) return null
  const known = knownCauses(causes)
  if (known.length === 0) return null
  return `Some events were turned away in the last 7 days: ${known.map((c) => INGEST_CAUSE_PHRASE[c]).join(', ')}.`
}
