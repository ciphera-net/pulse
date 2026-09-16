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

/** Sentence-cases a snake_case wire value ("refresh_token_reuse_benign" to
 * "Refresh token reuse benign") for an event type or failure reason this
 * tab's label maps do not know yet, instead of leaking the raw lowercase key. */
function sentenceCase(value: string): string {
  const words = value.replace(/[._]/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
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
  return labels[reason as string] || sentenceCase(reason as string)
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Calendar-day bucket key (local) so adjacent same-day events share a group. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Sentence-case date-group header label: "Today" / "Yesterday" / "05 May" (spec §6). */
function dayGroupLabel(d: Date): string {
  const now = new Date()
  if (dayKey(d) === dayKey(now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (dayKey(d) === dayKey(yesterday)) return 'Yesterday'
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
      setError(err instanceof Error ? err.message : "Couldn't load your security activity.")
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
    <>
      {loading ? (
        <SettingsLoadingState rows={5} />
      ) : error ? (
        <SettingsErrorState
          title="Couldn't load your security activity"
          message={error}
          onRetry={handleRetry}
        />
      ) : (
        <SettingsPanel
          title="Security activity"
          description={`${totalCount.toLocaleString()} event${totalCount === 1 ? '' : 's'} on your account.`}
        >
          {entries.length === 0 ? (
            <EmptyRow
              icon={<Shield weight="regular" />}
              title="No security activity yet"
              caption="Sign-ins, password changes, and device events will appear here over time."
            />
          ) : (
            <>
              <Table aria-label="Security activity" containerClassName="border-0">
                <THead>
                  <TR>
                    <TH>Event</TH>
                    <TH>Details</TH>
                    <TH numeric>When</TH>
                  </TR>
                </THead>
                <TBody>
                  {entries.map((entry, i) => {
                    const label = EVENT_LABELS[entry.event_type] || sentenceCase(entry.event_type)
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
                              className="bg-muted px-5 py-2 text-xs font-semibold text-muted-foreground"
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
                              {/* nowrap: the crushed EVENT column broke "Sign in"
                                  across two lines, doubling every row's height and
                                  reading as two separate events. */}
                              <span className="whitespace-nowrap font-medium text-foreground">{label}</span>
                              {entry.outcome === 'failure' && (
                                <StatusChip tone="danger" dot className="shrink-0">Failed</StatusChip>
                              )}
                            </div>
                          </TD>
                          <TD className="text-xs text-muted-foreground">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              {method && (
                                // The auth method is a word in the caption, not a
                                // chip and not small caps: the row already carries
                                // its state in the status chip.
                                <span className="font-medium">{sentenceCase(method)}</span>
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
                <div className="flex justify-center border-t border-border py-3">
                  <Button variant="ghost" onClick={handleLoadMore} disabled={loadingMore}>
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              )}
            </>
          )}
        </SettingsPanel>
      )}
    </>
  )
}
