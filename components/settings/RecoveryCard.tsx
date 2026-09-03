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
import { Button } from '@ciphera-net/facet'
import { getRecoveryStatus } from '@/lib/api/recovery'

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
 * A single, dismissible nudge shown once after a passkey is enrolled.
 *
 * 🔑 WHY THERE AND NOWHERE ELSE. Somebody who has just enrolled a passkey has
 * demonstrably just thought about getting into their account, which is the one
 * moment recovery is worth raising. It is not a banner and does not live on the
 * dashboard — #504 removed a banner from that surface today, and re-adding one
 * for this would reverse a decision hours old.
 *
 * ⚠️ The dismissal is per BROWSER, not per account: localStorage is the right
 * weight for a nudge and the wrong weight for anything else. Worst case on a
 * second device is that a user sees this once more; the server holds the real
 * state and the card above always tells the truth.
 */
const NUDGE_KEY = 'ciphera.recovery-nudge.dismissed'

function alreadyDismissed(): boolean {
  try {
    return localStorage.getItem(NUDGE_KEY) === '1'
  } catch {
    // Private windows and blocked site data throw on access. A nudge that
    // cannot remember being dismissed is worse than no nudge, so stay quiet.
    return true
  }
}

export function useRecoveryNudge(): {
  shouldNudge: boolean
  dismissNudge: () => void
  markPasskeyEnrolled: () => void
} {
  const [armed, setArmed] = useState(false)

  // 🔑 localStorage is read when the nudge is ARMED, not on mount. Reading it in
  // an effect would mean a state write on every mount of the Security tab for a
  // value that only matters after a passkey enrolment succeeds — and it would
  // have to be read before the server is even known to be reachable. Arming
  // happens inside a click handler, which is well past hydration, so there is
  // no SSR mismatch to guard against either.
  const markPasskeyEnrolled = useCallback(() => setArmed(!alreadyDismissed()), [])

  const dismissNudge = useCallback(() => {
    setArmed(false)
    try {
      localStorage.setItem(NUDGE_KEY, '1')
    } catch {
      // Nothing to do — it simply may reappear next time.
    }
  }, [])

  return { shouldNudge: armed, dismissNudge, markPasskeyEnrolled }
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
