'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth/context'
import { getUserActivity, type AuditLogEntry } from '@/lib/api/activity'
import { Button, Table, THead, TBody, TR, TH, TD } from '@ciphera-net/facet'
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
import { EmptyRow, SettingsPanel } from '@/components/settings/panels'
import { StatusChip, type ChipTone } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
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

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** Calendar-day bucket key (local) so adjacent same-day events share a group. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Mono date-group header label: "TODAY" / "YESTERDAY" / "05 MAY" (spec §6). */
function dayGroupLabel(d: Date): string {
  const now = new Date()
  if (dayKey(d) === dayKey(now)) return 'TODAY'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (dayKey(d) === dayKey(yesterday)) return 'YESTERDAY'
  const label = `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() !== now.getFullYear() ? `${label} ${d.getFullYear()}` : label
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
    <section className="space-y-4">
      <div className="min-w-0">
        <p className="font-mono text-micro-label uppercase text-muted-foreground">Security activity</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Recent security events on your account{totalCount > 0 ? ` (${totalCount})` : ''}.
        </p>
      </div>

      {loading ? (
        <SettingsLoadingState rows={5} />
      ) : error ? (
        <SettingsErrorState message={error} onRetry={handleRetry} />
      ) : entries.length === 0 ? (
        <SettingsPanel>
          <EmptyRow
            icon={<Shield weight="regular" />}
            title="No security activity yet"
            caption="Sign-ins, password changes, and device events will appear here over time."
          />
        </SettingsPanel>
      ) : (
        <>
          <Table aria-label="Security activity">
            <THead>
              <TR>
                <TH>Event</TH>
                <TH>Details</TH>
                <TH numeric>When</TH>
              </TR>
            </THead>
            <TBody>
              {entries.map((entry, i) => {
                const label = EVENT_LABELS[entry.event_type] || entry.event_type.replace(/_/g, ' ')
                const tone = getEventTone(entry.event_type, entry.outcome)
                const EventIcon = EVENT_ICONS[entry.event_type] || Shield
                const method = getMethodLabel(entry)
                const reason = getFailureReason(entry)
                const browser = entry.user_agent ? parseBrowserName(entry.user_agent) : null
                const os = entry.user_agent ? parseOS(entry.user_agent) : null
                const deviceStr = [browser, os].filter(Boolean).join(' on ')
                const created = new Date(entry.created_at)

                const prevKey = i > 0 ? dayKey(new Date(entries[i - 1].created_at)) : null
                const showGroup = dayKey(created) !== prevKey

                return (
                  <Fragment key={entry.id}>
                    {showGroup && (
                      <TR>
                        <TD
                          colSpan={3}
                          className="bg-muted px-5 py-2 font-mono text-micro-label uppercase text-muted-foreground"
                        >
                          {dayGroupLabel(created)}
                        </TD>
                      </TR>
                    )}
                    <TR>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <EventIcon
                            size={18}
                            weight="regular"
                            className={`shrink-0 ${tone === 'danger' ? 'text-destructive' : 'text-muted-foreground'}`}
                          />
                          <span className="font-medium text-foreground">{label}</span>
                          {entry.outcome === 'failure' && (
                            <StatusChip tone="danger" className="shrink-0">Failed</StatusChip>
                          )}
                        </div>
                      </TD>
                      <TD className="text-xs text-muted-foreground">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {method && (
                            // The repeated "opaque" auth-method chip is demoted to
                            // inline mono metadata (spec §6) — no lone status pill.
                            <span className="font-mono uppercase tracking-[0.06em] text-[11px]">
                              {method}
                            </span>
                          )}
                          {reason && <span>{reason}</span>}
                          {deviceStr && <span>{deviceStr}</span>}
                          {entry.ip_address && <span className="font-mono">{entry.ip_address}</span>}
                        </div>
                      </TD>
                      <TD
                        numeric
                        className="whitespace-nowrap text-xs text-muted-foreground"
                        title={formatDateTimeFull(created)}
                      >
                        {formatRelativeTime(entry.created_at)}
                      </TD>
                    </TR>
                  </Fragment>
                )
              })}
            </TBody>
          </Table>

          {hasMore && (
            <div className="flex justify-center pt-1">
              <Button variant="ghost" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
