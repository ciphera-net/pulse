'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth/context'
import { getUserActivity, type AuditLogEntry } from '@/lib/api/activity'
import { Button, Spinner } from '@ciphera-net/facet'
import {
  Shield,
  SignIn,
  ShieldWarning,
  Password,
  ShieldCheck,
  ShieldSlash,
  TrashSimple,
  type Icon,
} from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusChip, type ChipTone } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { formatRelativeTime, formatDateTimeFull } from '@/lib/utils/formatDate'

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

const EVENT_ICONS: Record<string, Icon> = {
  login_success: SignIn,
  login_failure: ShieldWarning,
  oauth_login_success: SignIn,
  oauth_login_failure: ShieldWarning,
  password_change: Password,
  '2fa_enabled': ShieldCheck,
  '2fa_disabled': ShieldSlash,
  recovery_codes_regenerated: Password,
  account_deleted: TrashSimple,
}

function getEventTone(eventType: string, outcome: string): ChipTone {
  if (outcome === 'failure') return 'danger'
  if (eventType === '2fa_enabled') return 'success'
  if (eventType === '2fa_disabled') return 'warning'
  if (eventType === 'account_deleted') return 'danger'
  if (eventType === 'recovery_codes_regenerated') return 'warning'
  return 'neutral'
}

// Icon-box tint, aligned to the StatusChip house palette (bg-{c}-900/30
// text-{c}-400) so the event glyph reads identically to its status chip.
const EVENT_BOX_TONE: Record<ChipTone, string> = {
  neutral: 'bg-neutral-800 text-neutral-400',
  success: 'bg-green-900/30 text-green-400',
  info: 'bg-blue-900/30 text-blue-400',
  warning: 'bg-amber-900/30 text-amber-400',
  danger: 'bg-red-900/30 text-red-400',
  brand: 'bg-brand-orange/10 text-brand-orange',
  purple: 'bg-purple-900/30 text-purple-400',
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
    setError('')
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

  const handleRetry = useCallback(() => {
    setLoading(true)
    fetchActivity(0, false).finally(() => setLoading(false))
  }, [fetchActivity])

  return (
    <div>
      <h2 className="text-base font-semibold text-white mb-1">Security Activity</h2>
      <p className="text-neutral-400 text-sm mb-6">
        Recent security events on your account{totalCount > 0 ? ` (${totalCount})` : ''}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : error ? (
        <SettingsErrorState message={error} onRetry={handleRetry} />
      ) : entries.length === 0 ? (
        <div className="bg-card border border-border">
          <EmptyState
            title="No security activity yet"
            description="Sign-ins, password changes, and device events will appear here over time."
            icon={<Shield weight="regular" />}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const label = EVENT_LABELS[entry.event_type] || entry.event_type.replace(/_/g, ' ')
            const tone = getEventTone(entry.event_type, entry.outcome)
            const EventIcon = EVENT_ICONS[entry.event_type] || Shield
            const method = getMethodLabel(entry)
            const reason = getFailureReason(entry)
            const browser = entry.user_agent ? parseBrowserName(entry.user_agent) : null
            const os = entry.user_agent ? parseOS(entry.user_agent) : null
            const deviceStr = [browser, os].filter(Boolean).join(' on ')

            return (
              <div
                key={entry.id}
                className="bg-card border border-border flex items-start gap-3 rounded-none px-4 py-3"
              >
                <div className={`flex-shrink-0 w-9 h-9 rounded-none flex items-center justify-center mt-0.5 ${EVENT_BOX_TONE[tone]}`}>
                  <EventIcon size={18} weight="regular" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white text-sm">
                      {label}
                    </span>
                    {method && <StatusChip tone="neutral">{method}</StatusChip>}
                    {entry.outcome === 'failure' && <StatusChip tone="danger">Failed</StatusChip>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400 flex-wrap">
                    {reason && <span>{reason}</span>}
                    {reason && (deviceStr || entry.ip_address) && <span>&middot;</span>}
                    {deviceStr && <span>{deviceStr}</span>}
                    {deviceStr && entry.ip_address && <span>&middot;</span>}
                    {entry.ip_address && <span>{entry.ip_address}</span>}
                  </div>
                </div>

                <div className="flex-shrink-0 text-right">
                  <span className="text-xs text-neutral-400" title={formatDateTimeFull(new Date(entry.created_at))}>
                    {formatRelativeTime(entry.created_at)}
                  </span>
                </div>
              </div>
            )
          })}

          {hasMore && (
            <div className="pt-2 text-center">
              <Button
                variant="ghost"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
