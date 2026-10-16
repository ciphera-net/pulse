'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth/context'
import { getUserActivity, type AuditLogEntry } from '@/lib/api/activity'
import { Button, Table, THead, TBody, TR, TD } from '@ciphera-net/facet'
import { SettingsTH } from '@/components/settings/panels/SettingsTH'
import {
  Shield,
  SignIn,
  SignOut,
  ShieldWarning,
  Password,
  ShieldCheck,
  ShieldSlash,
  TrashSimple,
  Key,
  Warning,
  type Icon,
} from '@phosphor-icons/react'
import { EmptyRow, SettingsPanel } from '@/components/settings/panels'
import { StatusChip, type ChipTone } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { formatRelativeTime, formatDateTimeFull } from '@/lib/utils/formatDate'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { zoneDayKey, zoneParts, shiftDayKey } from '@/lib/utils/siteTime'

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
  // Device identity (16-10-2026, OPS-17): the Devices tab's own actions,
  // surfaced here as activity.
  device_signed_out: 'Signed a browser out',
  other_devices_signed_out: 'Signed out of every other browser',
  sessions_revoked_by_operator: 'Sessions ended by Ciphera',
  recovery_login: 'Signed in with the recovery phrase',
  passkey_clone_warning: 'Passkey may have been copied',
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
  device_signed_out: SignOut,
  other_devices_signed_out: SignOut,
  sessions_revoked_by_operator: ShieldWarning,
  recovery_login: Key,
  passkey_clone_warning: Warning,
}

/**
 * Refresh-token bookkeeping ("refresh_token_reuse_benign",
 * "refresh_token_recovered", …) is not a person-meaningful event: it is the
 * token-rotation machinery doing its job, not something that happened TO
 * someone. The new `/auth/user/activity` allowlist already withholds these;
 * this filter is defence in depth against a build that still sends them.
 */
function isRefreshTokenNoise(eventType: string): boolean {
  return eventType.startsWith('refresh_token')
}

function getEventTone(eventType: string, outcome: string): ChipTone {
  if (outcome === 'failure') return 'danger'
  if (eventType === '2fa_enabled') return 'success'
  if (eventType === '2fa_disabled') return 'warning'
  if (eventType === 'account_deleted') return 'danger'
  if (eventType === 'recovery_codes_regenerated') return 'warning'
  if (eventType === 'sessions_revoked_by_operator') return 'warning'
  if (eventType === 'recovery_login') return 'warning'
  if (eventType === 'passkey_clone_warning') return 'danger'
  return 'neutral'
}

/** Sentence-cases a snake_case wire value ("refresh_token_reuse_benign" to
 * "Refresh token reuse benign") for an event type or failure reason this
 * tab's label maps do not know yet, instead of leaking the raw lowercase key. */
function sentenceCase(value: string): string {
  const words = value.replace(/[._]/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Never the protocol name: a sign-in method reads as what it IS to the
 *  person, never as what it is to the server (OPAQUE is "Password"). */
function getMethodLabel(entry: AuditLogEntry): string | null {
  const method = entry.metadata?.method
  if (!method) return null
  if (method === 'opaque') return 'Password'
  if (method === 'magic_link') return 'Magic link'
  if (method === 'passkey') return 'Passkey'
  if (method === 'recovery_phrase') return 'Recovery phrase'
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Calendar-day bucket key so adjacent same-day events share a group, in the
 * viewer's display-timezone preference (18-09-2026 design §4.3) rather than
 * always the browser's zone. Delegates to siteTime.ts's zone arithmetic —
 * `shiftDayKey` does calendar (not 24h-fixed) subtraction, so a DST
 * fall-back day's 25 hours cannot mislabel "Yesterday".
 */
function dayKey(d: Date, tz?: string): string {
  return zoneDayKey(d, tz)
}

/** Sentence-case date-group header label: "Today" / "Yesterday" / "05 May" (spec §6). */
function dayGroupLabel(d: Date, tz?: string): string {
  const now = new Date()
  const todayKey = zoneDayKey(now, tz)
  const dKey = zoneDayKey(d, tz)
  if (dKey === todayKey) return 'Today'
  if (dKey === shiftDayKey(todayKey, -1)) return 'Yesterday'
  const p = zoneParts(d, tz)
  const label = `${String(p.day).padStart(2, '0')} ${MONTHS[p.month - 1]}`
  return p.year !== zoneParts(now, tz).year ? `${label} ${p.year}` : label
}

export default function SecurityActivityCard() {
  const { user } = useAuth()
  const { zone } = useDisplayZone()
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
      const newEntries = (data.entries ?? []).filter((e) => !isRefreshTokenNoise(e.event_type))
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
                    <SettingsTH>Event</SettingsTH>
                    <SettingsTH>Details</SettingsTH>
                    <SettingsTH numeric>When</SettingsTH>
                  </TR>
                </THead>
                <TBody>
                  {entries.map((entry, i) => {
                    const label = EVENT_LABELS[entry.event_type] || sentenceCase(entry.event_type)
                    const tone = getEventTone(entry.event_type, entry.outcome)
                    const EventIcon = EVENT_ICONS[entry.event_type] || Shield
                    const method = getMethodLabel(entry)
                    const reason = getFailureReason(entry)
                    const created = new Date(entry.created_at)

                    const prevKey = i > 0 ? dayKey(new Date(entries[i - 1].created_at), zone) : null
                    const showGroup = dayKey(created, zone) !== prevKey

                    return (
                      <Fragment key={entry.id}>
                        {showGroup && (
                          <TR>
                            <TD
                              colSpan={3}
                              className="bg-muted px-5 py-2 text-xs font-semibold text-muted-foreground"
                            >
                              {dayGroupLabel(created, zone)}
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
                              {entry.user_agent && <span>{entry.user_agent}</span>}
                            </div>
                          </TD>
                          <TD
                            numeric
                            className="whitespace-nowrap text-xs text-muted-foreground"
                            title={formatDateTimeFull(created, zone)}
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
