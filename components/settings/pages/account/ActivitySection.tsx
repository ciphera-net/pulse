'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { Button } from '@ciphera-net/facet'
import { ClockCounterClockwise } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { getUserActivity, type AuditLogEntry } from '@/lib/api/activity'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { formatDateTimeFull } from '@/lib/utils/formatDate'
import { KitBlock, KitRow, KitRows, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import { dayGroupLabel, dayKey, timeLabel } from './format'
import { LoadingRows } from './parts'

/** R40: the latest 8 on the page, then Show more. */
export const ACTIVITY_SHOWN = 8
const PAGE_SIZE = 20

// The events Ciphera ID lets a person see (id-backend PersonVisibleAuditEvents), in the copy deck's words (§12.6).
// Ciphera ID never sends an OAuth event, so none is named.
export const EVENT_LABELS: Record<string, string> = {
  login_success: 'Signed in',
  login_failure: 'Sign-in failed',
  password_change: 'Password changed',
  '2fa_enabled': 'Two-factor turned on',
  '2fa_disabled': 'Two-factor turned off',
  recovery_codes_regenerated: 'Recovery codes replaced',
  account_deleted: 'Account deleted',
  device_signed_out: 'Signed a browser out',
  other_devices_signed_out: 'Signed out everywhere else',
  sessions_revoked_by_operator: 'Ciphera ended your sessions',
  recovery_login: 'Signed in with the recovery phrase',
  passkey_clone_warning: 'Passkey may have been copied',
  user_created: 'Account created',
  email_change_requested: 'Email change asked for',
  email_change: 'Email changed',
  recovery_identity_enrolled: 'Recovery phrase set up',
  recovery_reset: 'Password reset with the recovery phrase',
  passkey_added: 'Passkey added',
  passkey_removed: 'Passkey removed',
  sign_in_used_twice: 'A browser was signed out: its sign-in was used twice',
}

const REASONS: Record<string, string> = {
  invalid_credentials: 'Wrong email or password',
  invalid_password: 'Wrong password',
  account_locked: 'Account locked',
  email_not_verified: 'Email not confirmed',
  invalid_2fa: 'Wrong two-factor code',
}

const METHODS: Record<string, string> = {
  opaque: 'Password',
  magic_link: 'Magic link',
  passkey: 'Passkey',
  recovery_phrase: 'Recovery phrase',
}

/**
 * Events whose label is the whole story. A sign-in used twice is recorded as a failure with the reuse classifier's
 * reason, which is the operator's: from the person's side nothing failed, a browser was signed out to protect them.
 */
const LABEL_IS_THE_STORY = new Set(['sign_in_used_twice'])

/** An event or reason this page does not know yet reads as words, never as a raw key. */
function sentenceCase(value: string): string {
  const words = value.replace(/[._]/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function failed(entry: AuditLogEntry): boolean {
  return entry.outcome === 'failure' && !LABEL_IS_THE_STORY.has(entry.event_type)
}

/**
 * The method, the reason a sign-in failed and the browser, as the server sends them. Never the IP address the same
 * entry carries. The browser arrives as a label already ("Chrome on macOS").
 */
function details(entry: AuditLogEntry): string {
  const method = entry.metadata?.method
  const reason = failed(entry) ? entry.metadata?.reason : undefined
  const parts = [
    method ? METHODS[method] ?? sentenceCase(method) : null,
    reason ? REASONS[reason] ?? sentenceCase(reason) : failed(entry) && entry.event_type !== 'login_failure' ? 'Failed' : null,
    entry.user_agent || null,
  ]
  return parts.filter((p): p is string => Boolean(p)).join(' · ')
}

/**
 * Security activity, on the page (R40): sign-ins and changes to how you sign in, grouped by day on the viewer's
 * calendar. The server decides what a person sees, so every entry it sends is shown; a second filter here would hide a
 * new event it starts to send on purpose.
 */
export default function ActivitySection() {
  const { user } = useAuth()
  const { zone } = useDisplayZone()
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [failedLoad, setFailedLoad] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [shown, setShown] = useState(ACTIVITY_SHOWN)

  const loadFirst = useCallback(async () => {
    setFailedLoad(false)
    try {
      const data = await getUserActivity(PAGE_SIZE, 0)
      setEntries(data.entries ?? [])
      setHasMore(data.has_more)
    } catch {
      setEntries(null)
      setFailedLoad(true)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    void loadFirst()
  }, [user, loadFirst])

  // Shows what is already here first, and asks the server for the next page only when that runs out.
  const showMore = async () => {
    if (!entries) return
    const target = shown + PAGE_SIZE
    if (target > entries.length && hasMore) {
      setLoadingMore(true)
      setMoreFailed(false)
      try {
        const data = await getUserActivity(PAGE_SIZE, entries.length)
        setEntries([...entries, ...(data.entries ?? [])])
        setHasMore(data.has_more)
      } catch {
        setMoreFailed(true)
        setLoadingMore(false)
        return
      }
      setLoadingMore(false)
    }
    setShown(target)
  }

  let body: React.ReactNode
  if (failedLoad) {
    body = (
      <KitRows>
        <KitRow
          label="Couldn't load your security activity"
          control={<Button variant="outline" size="sm" onClick={() => void loadFirst()}>Try again</Button>}
        />
      </KitRows>
    )
  } else if (entries === null) {
    body = <LoadingRows rows={3} />
  } else if (entries.length === 0) {
    body = (
      <KitRows>
        <KitRow label="No activity yet" caption="Sign-ins and changes to your password, two-factor and devices show here." />
      </KitRows>
    )
  } else {
    const visible = entries.slice(0, shown)
    body = (
      <KitRows>
        <KitBlock>
          <table data-account-activity="" className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="pb-2 font-medium">Event</th>
                <th scope="col" className="pb-2 font-medium">Details</th>
                <th scope="col" className="pb-2 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((e, i) => {
                const label = EVENT_LABELS[e.event_type] ?? sentenceCase(e.event_type)
                const first = i === 0 || dayKey(visible[i - 1].created_at, zone) !== dayKey(e.created_at, zone)
                return (
                  <Fragment key={e.id}>
                    {first && (
                      <tr data-account-day="">
                        <td colSpan={3} className="pb-1 pt-3 text-xs font-medium text-muted-foreground">
                          {dayGroupLabel(e.created_at, zone)}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-2 pr-4">{failed(e) ? <KitStatus tone="broken">{label}</KitStatus> : label}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{details(e)}</td>
                      <td
                        className="whitespace-nowrap py-2 text-right tabular-nums text-muted-foreground"
                        title={formatDateTimeFull(new Date(e.created_at), zone)}
                      >
                        {timeLabel(e.created_at, zone)}
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {(entries.length > shown || hasMore) && (
            <div className="flex flex-wrap items-center gap-3 pt-3">
              <Button variant="outline" size="sm" onClick={() => void showMore()} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Show more'}
              </Button>
              {moreFailed && <span role="alert" className="text-xs text-destructive">Couldn&apos;t load your security activity. Try again.</span>}
            </div>
          )}
        </KitBlock>
      </KitRows>
    )
  }

  return (
    <KitSection
      title="Security activity"
      description="Sign-ins and changes to how you sign in, from the last 180 days."
      icon={<ClockCounterClockwise />}
    >
      {body}
    </KitSection>
  )
}
