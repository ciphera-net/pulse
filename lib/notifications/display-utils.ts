/** Convert an ISO 3166-1 alpha-2 code to a human-readable country name. */
export function countryName(alpha2: string): string {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' })
    return dn.of(alpha2) ?? alpha2
  } catch {
    return alpha2
  }
}

/** Format a duration in seconds as a short human-readable string (e.g. "2m", "1.5h"). */
export function formatDowntime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

/** How many whole days remain until the given ISO timestamp (minimum 0). */
export function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (24 * 3600 * 1000)))
}
