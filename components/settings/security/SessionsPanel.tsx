'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, toast } from '@ciphera-net/facet'
import { Devices } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { getUserSessions, revokeSession, type Session } from '@/lib/api/user'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { formatRelativeTime, formatDateTimeFull } from '@/lib/utils/formatDate'

/** "Chrome on macOS" from a user-agent string; "Unknown device" when there is none. */
export function describeSession(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device'
  let browser = ''
  if (ua.includes('Edg')) browser = 'Edge'
  else if (ua.includes('OPR') || ua.includes('Opera')) browser = 'Opera'
  else if (ua.includes('Chrome')) browser = 'Chrome'
  else if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Safari')) browser = 'Safari'
  let os = ''
  if (/iPhone|iPad/.test(ua)) os = 'iOS'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('Mac OS')) os = 'macOS'
  else if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Linux')) os = 'Linux'
  if (browser && os) return `${browser} on ${os}`
  return browser || os || 'Unknown device'
}

/**
 * Active sessions — everywhere this account is signed in, with a way out.
 *
 * Owner ruling 4 (PUL-28): signing another device out stays one click, and
 * signing THIS device out is now one click too, same as the account menu's
 * own Sign out. Revoking the current session signs this browser out via
 * logout(); revoking another only re-reads the list.
 */
export default function SessionsPanel() {
  const { logout } = useAuth()
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const data = await getUserSessions()
      setSessions(data.sessions ?? [])
    } catch {
      setSessions(null)
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const revoke = async (session: Session) => {
    setRevokingId(session.id)
    try {
      await revokeSession(session.id)
      if (session.is_current) {
        logout()
        return
      }
      toast.success('Signed out of that device.')
      await load()
    } catch {
      toast.error("Couldn't sign that device out. Try again.")
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <SettingsPanel title="Active sessions" description="Everywhere you're signed in right now.">
      {failed ? (
        <SettingsErrorState
          variant="banner"
          className="m-5"
          message="Couldn't load your sessions. Try again."
          onRetry={() => void load()}
        />
      ) : sessions === null ? (
        <SettingsLoadingState rows={2} />
      ) : sessions.length === 0 ? (
        <EmptyRow icon={<Devices weight="regular" />} title="No sessions" caption="Signing in creates one." />
      ) : (
        <PanelRows>
          {sessions.map((s) => (
            <PanelRow
              key={s.id}
              label={
                <span className="flex items-center gap-2">
                  {describeSession(s.user_agent)}
                  {s.is_current && <StatusChip tone="neutral">This device</StatusChip>}
                </span>
              }
              caption={
                <span title={`Signed in ${formatDateTimeFull(new Date(s.created_at))}`}>
                  <span className="font-mono">{s.client_ip}</span> · signed in {formatRelativeTime(s.created_at)}
                </span>
              }
              control={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={revokingId === s.id}
                  onClick={() => void revoke(s)}
                >
                  {revokingId === s.id ? 'Signing out…' : 'Sign out'}
                </Button>
              }
            />
          ))}
        </PanelRows>
      )}
    </SettingsPanel>
  )
}
