// The Data page's words (copy deck §8, Pulse/docs/plans/05-11-2026-settings-copy-deck.md), and the small pure
// helpers that pick between them. Kept out of the components so the tests read the same strings the page prints.

export type ServiceKey = 'gsc' | 'bing' | 'bunny'

export const SERVICE_NAME: Record<ServiceKey, string> = {
  gsc: 'Google Search Console',
  bing: 'Bing Webmaster Tools',
  bunny: 'Bunny CDN',
}

/** What each service brings: the caption of a service that is not connected (§8.2, §8.7). */
export const SERVICE_BRINGS: Record<ServiceKey, string> = {
  gsc: 'The Google searches that bring visitors: queries, clicks, impressions and average position.',
  bing: 'Daily clicks and impressions from Bing search.',
  bunny: 'Bandwidth, requests, cache hit rate and errors from your Bunny pull zone.',
}

export const CONNECT_LABEL: Record<ServiceKey, string> = {
  gsc: 'Connect with Google',
  bing: 'Connect Bing',
  bunny: 'Connect Bunny CDN',
}

export const COULDNT_CHECK: Record<ServiceKey, string> = {
  gsc: "Couldn't check Search Console. The connection is unchanged.",
  bing: "Couldn't check Bing. The connection is unchanged.",
  bunny: "Couldn't check Bunny CDN. The connection is unchanged.",
}

export const DISCONNECT_DIALOG: Record<ServiceKey, { title: string; description: string; done: string; failure: string }> = {
  gsc: {
    title: 'Disconnect Search Console?',
    description:
      "Pulse deletes its copy of your search data and stops updating it. Your data in Google is untouched, and connecting again fetches it again. After 6 seconds this can't be undone.",
    done: 'Search Console disconnected',
    failure: "Couldn't disconnect Search Console. Try again.",
  },
  bing: {
    title: 'Disconnect Bing?',
    description:
      "Pulse deletes its copy of your Bing numbers and the API key, and stops updating them. Connecting again fetches them again. After 6 seconds this can't be undone.",
    done: 'Bing disconnected',
    failure: "Couldn't disconnect Bing. Try again.",
  },
  bunny: {
    title: 'Disconnect Bunny CDN?',
    description:
      "Pulse deletes its copy of your CDN numbers and the API key, and stops updating them. Connecting again fetches up to a year back. After 6 seconds this can't be undone.",
    done: 'Bunny CDN disconnected',
    failure: "Couldn't disconnect Bunny CDN. Try again.",
  },
}

export const GSC_POPUP_BLOCKED = 'Your browser blocked the Google window. Allow pop-ups for Pulse and try again.'
export const GSC_COULDNT_START = "Couldn't start Google sign-in. Try again."

/** Back from Google: the `?gsc=` code the OAuth callback lands with (§8.2). */
export const GSC_CALLBACK: Record<string, { type: 'success' | 'error'; text: string }> = {
  connected: { type: 'success', text: 'Search Console connected' },
  denied: { type: 'error', text: 'Google sign-in was cancelled, so nothing was connected.' },
  no_property: {
    type: 'error',
    text: 'This Google account has no Search Console property for this site. Use another account, or add the site in Search Console.',
  },
  token_error: { type: 'error', text: "Couldn't connect Search Console. Try again." },
  error: { type: 'error', text: "Couldn't connect Search Console. Try again." },
}

const SHORT: Record<ServiceKey, string> = { gsc: 'Search Console', bing: 'Bing', bunny: 'Bunny CDN' }

/**
 * A service's problem line in the deck's words, with R31's Connect again (§8.2, §8.7). The server writes Go errors
 * into `error_message` (finding 2), so the page never prints it as it comes: each known message, in today's server
 * words or already in the deck's, maps to its line, and anything else gets a line that claims only what the status
 * says. Null when there is no message.
 */
export function problemLine(service: ServiceKey, s: { status?: string; error_message?: string | null }): string | null {
  const raw = s.error_message?.trim()
  if (!raw) return null
  const parked = s.status === 'error'
  if (service === 'gsc') {
    if (/^Failed to (decrypt|parse stored) tokens|^Pulse can't read its access to Google/i.test(raw)) {
      return "Pulse can't read its access to Google. Connect again."
    }
    if (/^Google token refresh failed|^Google didn't accept/i.test(raw)) {
      return "Google didn't accept Pulse's access. Pulse tries again up to 5 times. If this stays, connect again."
    }
    if (/^Failed to fetch search analytics|^Google didn't send/i.test(raw)) {
      return "Google didn't send your search data. Pulse tries again up to 5 times. If this stays, connect again."
    }
    if (/^Failed to store refreshed tokens|^Pulse couldn't save its access/i.test(raw)) {
      return "Pulse couldn't save its access to Google. Connect again."
    }
  }
  if (service === 'bing') {
    if (/^Could not decrypt the stored API key|^Pulse can't read the stored API key/i.test(raw)) {
      return "Pulse can't read the stored API key. Connect again."
    }
    if (/^Bing (rejected|refused) the API key/i.test(raw)) {
      return 'Bing refused the API key, maybe because a new one was made. Connect again with the current key from Bing Webmaster Tools: Settings, API Access.'
    }
    // The server says it has stopped trying in either set of words.
    const exhausted = /Pulse tried \d+ times|after \d+ tries/i.test(raw)
    if (/^Failed to fetch Bing search data|^Bing didn't send/i.test(raw)) {
      return exhausted
        ? "Bing didn't send your search data after 5 tries. Connect again."
        : "Bing didn't send your search data. Pulse tries again on its own."
    }
    const days = raw.match(/^Stored (\d+) of (\d+) days returned by Bing|^Pulse saved (\d+) of the (\d+) days/i)
    if (days) {
      const n = days[1] ?? days[3]
      const m = days[2] ?? days[4]
      return exhausted
        ? `Pulse saved ${n} of the ${m} days Bing sent after 5 tries. Connect again.`
        : `Pulse saved ${n} of the ${m} days Bing sent. It tries again on its own.`
    }
  }
  if (service === 'bunny') {
    if (/^Failed to decrypt API key|^Pulse can't read the stored API key/i.test(raw)) {
      return "Pulse can't read the stored API key. Connect again."
    }
    // One server message covers a refused key and a passing failure (finding 2); only a refused key parks the
    // connection (status error), so the status splits them.
    if (/invalid API key|^Bunny refused the API key/i.test(raw) || (parked && /^Failed to fetch CDN statistics/i.test(raw))) {
      return 'Bunny refused the API key. Connect again with a current key.'
    }
    if (/^Failed to fetch CDN statistics|^Bunny didn't send/i.test(raw)) {
      return "Bunny didn't send your CDN numbers. Pulse tries again on its own."
    }
  }
  return parked
    ? `Pulse stopped updating ${SHORT[service]}. Connect again.`
    : `The last update from ${SHORT[service]} didn't finish. Pulse tries again on its own.`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "3 Nov", with the year when it is not this year's (§2), in the viewer's zone. */
export function dayText(iso: string, now: Date, zone?: string): string {
  const fmt = (d: Date) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d)
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
    return { y: get('year'), m: get('month'), d: get('day') }
  }
  const at = fmt(new Date(iso))
  const today = fmt(now)
  return at.y === today.y ? `${at.d} ${MONTHS[at.m - 1]}` : `${at.d} ${MONTHS[at.m - 1]} ${at.y}`
}

/** §2's one time format: just now, 27 min ago, 3 h ago, 2 days ago, then 3 Nov. */
export function agoText(iso: string, now: Date, zone?: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'Unknown'
  const mins = Math.floor((now.getTime() - at.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`
  return dayText(iso, now, zone)
}

// ─── Export (§8.4) ──────────────────────────────────────────────────────────

export const EXPORT_COULDNT = "Couldn't make the file. Try again."

/**
 * The download's failure in the deck's words. `apiRequestBlob` fills the error with the server's own `error` text
 * (finding 4), lowercase and with its own vocabulary, so each known refusal maps to its line and anything else reads
 * as the generic one. A request that never arrived (status 0) says so.
 */
export function exportErrorText(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status
  if (status === 0) return "Pulse can't be reached. Check your connection and try again."
  const raw = err instanceof Error ? err.message : ''
  if (/too large to make in one go/i.test(raw)) {
    return 'This file is too large to make in one go. Pick a shorter range, fewer tables or fewer rows per table.'
  }
  if (/^hourly rows over this range/i.test(raw)) return 'Hourly rows over this range would pass 50,000. Pick a shorter range or daily rows.'
  const week = raw.match(/^week rows cover at most (\d+) days/i)
  if (week) return `Weekly rows cover at most ${week[1]} days. Pick a shorter range or monthly rows.`
  const month = raw.match(/^month rows cover at most (\d+) days/i)
  if (month) return `Monthly rows cover at most ${month[1]} days. Pick a shorter range.`
  if (/^only the daily table covers more than a year/i.test(raw)) return 'Over more than a year, only the daily summary can be exported.'
  if (/^an export covers at most/i.test(raw)) return 'A file covers at most 10 years.'
  return EXPORT_COULDNT
}
