import { AlertTriangleIcon, CheckCircleIcon } from '@ciphera-net/ui'

/**
 * Formats a date string as a human-readable relative time (e.g. "5m ago", "2h ago").
 */
export function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString()
}

/**
 * Returns the icon for a notification type (alert for down/degraded/billing, check for success).
 */
export function getTypeIcon(type: string) {
  if (type.includes('down') || type.includes('degraded') || type.startsWith('billing_')) {
    return <AlertTriangleIcon className="w-4 h-4 shrink-0 text-amber-500" aria-hidden="true" />
  }
  return <CheckCircleIcon className="w-4 h-4 shrink-0 text-emerald-500" aria-hidden="true" />
}
