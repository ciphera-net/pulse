/**
 * Format numbers with commas
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Get date range for last N days
 */
export function getDateRange(days: number): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  return {
    start: formatDate(start),
    end: formatDate(end),
  }
}

/**
 * Format "updated X ago" for polling indicators (e.g. "Just now", "12 seconds ago")
 */
export function formatUpdatedAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000)
  if (diff < 5) return 'Just now'
  if (diff < 60) return `${diff} seconds ago`
  if (diff < 120) return '1 minute ago'
  const minutes = Math.floor(diff / 60)
  return `${minutes} minutes ago`
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  return 'Just now'
}
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
