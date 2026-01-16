/**
 * Format duration in seconds to "1m 30s" or "30s"
 */
export function formatDuration(seconds: number): string {
  if (!seconds) return '0s'
  
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  
  if (m > 0) {
    return `${m}m ${s}s`
  }
  return `${s}s`
}
