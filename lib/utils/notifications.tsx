import { AlertTriangleIcon, CheckCircleIcon } from '@ciphera-net/ui'
import { formatRelativeTime } from './formatDate'

/**
 * Formats a date string as a human-readable relative time (e.g. "5m ago", "2h ago").
 */
export function formatTimeAgo(dateStr: string): string {
  return formatRelativeTime(dateStr)
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
