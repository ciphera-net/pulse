'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth/context'
import { getUserActivity, type AuditLogEntry } from '@/lib/api/activity'
import { Spinner } from '@ciphera-net/ui'

const PAGE_SIZE = 20

const EVENT_LABELS: Record<string, string> = {
  login_success: 'Sign in',
  login_failure: 'Failed sign in',
  oauth_login_success: 'OAuth sign in',
  oauth_login_failure: 'Failed OAuth sign in',
  password_change: 'Password changed',
  '2fa_enabled': '2FA enabled',
  '2fa_disabled': '2FA disabled',
  recovery_codes_regenerated: 'Recovery codes regenerated',
  account_deleted: 'Account deleted',
}

const EVENT_ICONS: Record<string, string> = {
  login_success: 'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9',
  login_failure: 'M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z',
  oauth_login_success: 'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9',
  oauth_login_failure: 'M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z',
  password_change: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
  '2fa_enabled': 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  '2fa_disabled': 'M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z',
  recovery_codes_regenerated: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
  account_deleted: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
}

function getEventColor(eventType: string, outcome: string): string {
  if (outcome === 'failure') return 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30'
  if (eventType === '2fa_enabled') return 'text-green-500 dark:text-green-400 bg-green-50 dark:bg-green-950/30'
  if (eventType === '2fa_disabled') return 'text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30'
  if (eventType === 'account_deleted') return 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30'
  if (eventType === 'recovery_codes_regenerated') return 'text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30'
  return 'text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800'
}

function getMethodLabel(entry: AuditLogEntry): string | null {
  const method = entry.metadata?.method
  if (!method) return null
  if (method === 'magic_link') return 'Magic link'
  if (method === 'passkey') return 'Passkey'
  return method as string
}

function getFailureReason(entry: AuditLogEntry): string | null {
  if (entry.outcome !== 'failure') return null
  const reason = entry.metadata?.reason
  if (!reason) return null
  const labels: Record<string, string> = {
    invalid_credentials: 'Invalid credentials',
    invalid_password: 'Wrong password',
    account_locked: 'Account locked',
    email_not_verified: 'Email not verified',
    invalid_2fa: 'Invalid 2FA code',
  }
  return labels[reason as string] || (reason as string).replace(/_/g, ' ')
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function parseBrowserName(ua: string): string {
  if (!ua) return 'Unknown'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Safari')) return 'Safari'
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera'
  return 'Browser'
}

function parseOS(ua: string): string {
  if (!ua) return ''
  if (ua.includes('Mac OS X')) return 'macOS'
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('Linux')) return 'Linux'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS'
  return ''
}

export default function SecurityActivityCard() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [offset, setOffset] = useState(0)

  const fetchActivity = useCallback(async (currentOffset: number, append: boolean) => {
    try {
      const data = await getUserActivity(PAGE_SIZE, currentOffset)
      const newEntries = data.entries ?? []
      setEntries(prev => append ? [...prev, ...newEntries] : newEntries)
      setTotalCount(data.total_count)
      setHasMore(data.has_more)
      setOffset(currentOffset + newEntries.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity')
    }
  }, [])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    fetchActivity(0, false).finally(() => setLoading(false))
  }, [user, fetchActivity])

  const handleLoadMore = async () => {
    setLoadingMore(true)
    await fetchActivity(offset, true)
    setLoadingMore(false)
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1">Security Activity</h2>
      <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-6">
        Recent security events on your account{totalCount > 0 ? ` (${totalCount})` : ''}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-6 text-center">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-neutral-300 dark:text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <p className="text-neutral-500 dark:text-neutral-400">No activity recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const label = EVENT_LABELS[entry.event_type] || entry.event_type.replace(/_/g, ' ')
            const color = getEventColor(entry.event_type, entry.outcome)
            const iconPath = EVENT_ICONS[entry.event_type] || EVENT_ICONS['login_success']
            const method = getMethodLabel(entry)
            const reason = getFailureReason(entry)
            const browser = entry.user_agent ? parseBrowserName(entry.user_agent) : null
            const os = entry.user_agent ? parseOS(entry.user_agent) : null
            const deviceStr = [browser, os].filter(Boolean).join(' on ')

            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3"
              >
                <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-0.5 ${color}`}>
                  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-neutral-900 dark:text-white text-sm">
                      {label}
                    </span>
                    {method && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                        {method}
                      </span>
                    )}
                    {entry.outcome === 'failure' && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                        Failed
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 flex-wrap">
                    {reason && <span>{reason}</span>}
                    {reason && (deviceStr || entry.ip_address) && <span>&middot;</span>}
                    {deviceStr && <span>{deviceStr}</span>}
                    {deviceStr && entry.ip_address && <span>&middot;</span>}
                    {entry.ip_address && <span>{entry.ip_address}</span>}
                  </div>
                </div>

                <div className="flex-shrink-0 text-right">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400" title={formatFullDate(entry.created_at)}>
                    {formatRelativeTime(entry.created_at)}
                  </span>
                </div>
              </div>
            )
          })}

          {hasMore && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
