'use client'

/**
 * The one-time recovery nudge on the Security tab, and the hook that decides
 * whether it is owed. The recovery status row itself lives in
 * components/settings/security/RecoveryPanel.tsx.
 */

import { useCallback, useState } from 'react'
import useSWR from 'swr'
import { Button } from '@ciphera-net/facet'
import { getRecoveryStatus } from '@/lib/api/recovery'
import { usePreferences } from '@/lib/hooks/usePreferences'

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
    <div role="status" className="rounded-none border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-sm text-foreground">
          Set up account recovery too? One phrase, written down once, is the only way back in if
          you forget your password.
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={onSetUp}>
            Set up
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  )
}
