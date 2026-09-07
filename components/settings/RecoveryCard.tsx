'use client'

/**
 * The Account-recovery row on the Security tab, and the one-time nudge.
 *
 * Facet owns the Security tab, so this renders as a SIBLING beneath it — the
 * same way the modals already do. It reuses the card chrome the rest of that
 * tab uses (`border border-border bg-card`) and adds no new visual vocabulary:
 * a heading, a sentence, a button, and a state word.
 *
 * 🔑 Status is NULLABLE and rendered as a distinct third state, never defaulted.
 * `null` means "not known yet", and showing "Not set up" while the answer is
 * still in flight would tell a user who IS enrolled that they are not — and
 * invite them to enrol again, which rotates a phrase they already wrote down.
 * A loading state is better than wrong data.
 */

import { useCallback, useEffect, useState } from 'react'
import useSWR from 'swr'
import { Button } from '@ciphera-net/facet'
import { getRecoveryStatus } from '@/lib/api/recovery'
import { usePreferences } from '@/lib/hooks/usePreferences'

interface Props {
  /** Opens the enrolment dialog; resolves once the phrase is confirmed. */
  onEnrol: () => Promise<void>
}

export default function RecoveryCard({ onEnrol }: Props) {
  const [enrolled, setEnrolled] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setFailed(false)
      setEnrolled((await getRecoveryStatus()).enrolled)
    } catch {
      // No silent failure: an unknown status is shown as unknown. Guessing
      // "not set up" would push an enrolled user into rotating their phrase.
      setEnrolled(null)
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const run = useCallback(async () => {
    setBusy(true)
    try {
      await onEnrol()
      await load()
    } catch {
      // The dialog reports its own failures, and a cancel is not one. Either
      // way the status is re-read, because an enrolment may have landed before
      // whatever went wrong.
      await load()
    } finally {
      setBusy(false)
    }
  }, [onEnrol, load])

  return (
    <section className="mt-6 border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-md">
          <h3 className="text-sm font-semibold text-foreground">Account recovery</h3>
          {enrolled === null ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {failed
                ? 'Could not check whether recovery is set up. Reload to try again.'
                : 'Checking…'}
            </p>
          ) : enrolled ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Set up. Your recovery phrase can get you back in if you forget your password. Setting
              it up again replaces the phrase you have — only do that if you have lost it.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Not set up. Your vault is end-to-end encrypted, so if you forget your password Ciphera
              cannot reset it for you. A recovery phrase is the only way back in.
            </p>
          )}
        </div>
        <Button type="button" onClick={run} disabled={busy || enrolled === null}>
          {busy ? 'Working…' : enrolled ? 'Replace phrase' : 'Set up recovery'}
        </Button>
      </div>
    </section>
  )
}

/**
 * A dismissible nudge to set up account recovery.
 *
 * 🔴 IT NO LONGER WAITS FOR A PASSKEY. It used to be armed only inside the
 * passkey-enrolment success handler, on the reasoning that somebody who has
 * just enrolled a passkey has demonstrably been thinking about getting into
 * their account. True, and it left everybody else out: a person who never
 * touches the passkey flow was never once asked to set up recovery, in a
 * product where forgetting a password with no recovery phrase loses the
 * account outright. The trigger is now the account's own state — not enrolled,
 * not previously dismissed — so it reaches the people the old one missed.
 *
 * 🔴 THE DISMISSAL IS PER ACCOUNT NOW, not per browser. It was a single
 * localStorage key with no user id in it, so on a shared profile one person's
 * dismissal silenced it for everybody, and on a second computer it was owed
 * again. It lives in `user_preferences.recovery_prompt_dismissed_at`
 * (pulse-backend migration 180).
 *
 * 🔑 Three states, and only one of them shows anything. While either the
 * enrolment status or the dismissal stamp is still in flight, the nudge stays
 * hidden — appearing and then vanishing is worse than arriving a moment late.
 *
 * Still not a banner and still not on the dashboard: #504 removed one from that
 * surface deliberately. Reaching people who never open Settings → Security is a
 * separate question, and an owner's to answer.
 */
export function useRecoveryNudge(): {
  shouldNudge: boolean
  dismissNudge: () => void
  /**
   * Kept so the passkey flow can still surface the nudge in the moment it is
   * most relevant, even before the preferences fetch has resolved. It no longer
   * decides WHETHER the nudge is owed — the account state does.
   */
  markPasskeyEnrolled: () => void
} {
  const [dismissedHere, setDismissedHere] = useState(false)
  const { recoveryPromptDismissed, stamp } = usePreferences()
  // Its own read of the enrolment status, on the SAME SWR key the card could
  // share — one request, whichever mounts first. `undefined` while in flight and
  // on failure, which keeps the nudge silent rather than guessing.
  const { data: status } = useSWR<{ enrolled: boolean }>(
    'recovery-status',
    getRecoveryStatus,
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  )

  const dismissNudge = useCallback(() => {
    // Optimistic: the nudge closes on the click, not on the round trip. A
    // failed write is reported by stamp() and means it returns next session —
    // visible and harmless, unlike pretending it saved.
    setDismissedHere(true)
    void stamp({ recovery_prompt_dismissed_at: new Date().toISOString() })
  }, [stamp])

  const markPasskeyEnrolled = useCallback(() => setDismissedHere(false), [])

  const shouldNudge =
    status?.enrolled === false && recoveryPromptDismissed === 'no' && !dismissedHere

  return { shouldNudge, dismissNudge, markPasskeyEnrolled }
}

export function RecoveryNudge({
  onSetUp,
  onDismiss,
}: {
  onSetUp: () => void
  onDismiss: () => void
}) {
  return (
    <div role="status" className="mt-6 border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-sm text-foreground">
          Set up account recovery too? One phrase, written down once — it is the only way back in if
          you forget your password.
        </p>
        <div className="flex gap-2">
          <Button type="button" onClick={onSetUp}>
            Set up
          </Button>
          <Button type="button" variant="secondary" onClick={onDismiss}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  )
}
