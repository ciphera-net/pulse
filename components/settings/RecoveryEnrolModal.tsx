'use client'

/**
 * RecoveryEnrolModal — sets up a recovery phrase, and shows it once.
 *
 * Two steps, in this order and for the same reason the passkey dialog has two:
 * the expensive, irreversible thing goes last. Here it is inverted, though —
 * there is no device to interrogate, so the password comes first and the phrase
 * is what must not be lost. The dialog therefore refuses to close itself after
 * minting: the phrase panel owns the exit, because closing on the user's behalf
 * would discard the only copy of a secret the server cannot reproduce.
 *
 * The chrome is PasskeyEnrolModal's, deliberately unchanged — same overlay, same
 * card, same field stack, same button pair. This surface introduces no new
 * visual vocabulary. The phrase panel itself is Facet's `RecoveryPhraseDisplay`,
 * the SAME component id.ciphera.net renders at signup, so the safety-critical
 * wording exists once rather than twice.
 */

import { useCallback, useState } from 'react'
import { Button, Input, RecoveryPhraseDisplay } from '@ciphera-net/facet'
import { ApiError } from '@/lib/api/client'
import { enrolRecoveryIdentity } from '@/lib/auth/tessera/recovery-enrol'
import { MODAL_SCROLL_CLASS, MODAL_CENTER_CLASS, MODAL_PANEL_CLASS } from '@/components/settings/modalChrome'

/**
 * What to SHOW the user for a failed enrolment.
 *
 * 🔴 An `ApiError`'s `.message` MUST NOT be shown. `lib/api/client.ts` replaces
 * every HTTP error message with `authMessageFromStatus(status)` before throwing,
 * and Facet maps 401 to "Session expired, please sign in again." The most likely
 * failure here is a mistyped password, which id-backend answers 401 at
 * `/auth/reauth/finish` — so rendering `err.message` would tell a user with a
 * perfectly healthy session to sign in again, and following that instruction
 * changes nothing. Same rule, and the same reason, as PasskeyEnrolModal.
 */
function enrolErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    // 0 is this client's own code for "the request never completed".
    if (err.status === 0) {
      return 'Could not reach Ciphera ID. Nothing was saved — check your connection and try again.'
    }
    if (err.status === 401 || err.status === 403) {
      return 'That email or password didn’t match. Nothing was saved — please try again.'
    }
    if (err.status === 429) {
      return 'Too many attempts. Nothing was saved — wait a moment and try again.'
    }
    return 'Ciphera ID refused the request. Nothing was saved — please try again.'
  }
  // The ceremony's own sentences are deliberate and specific; they say more
  // than any generic text could.
  if (err instanceof Error && err.message) return err.message
  return 'Recovery setup failed. Nothing was saved — please try again.'
}

interface Pending {
  resolve: () => void
  reject: (err: Error) => void
}

/** True when a rejection came from the user closing the dialog. */
export function isRecoveryEnrolCancelled(err: unknown): boolean {
  return err instanceof Error && err.message === '__recovery_enrol_cancelled__'
}

export function useRecoveryEnrolModal(): {
  requestRecoveryEnrol: () => Promise<void>
  modal: React.ReactNode
} {
  const [pending, setPending] = useState<Pending | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Non-null once minted. Its presence IS the step, and the only copy. */
  const [phrase, setPhrase] = useState<string | null>(null)

  const requestRecoveryEnrol = useCallback((): Promise<void> => {
    setEmail('')
    setPassword('')
    setError(null)
    setBusy(false)
    setPhrase(null)
    return new Promise<void>((resolve, reject) => setPending({ resolve, reject }))
  }, [])

  const close = useCallback(() => {
    setPending(null)
    // Neither the password nor the phrase outlives the dialog.
    setPassword('')
    setPhrase(null)
    setError(null)
    setBusy(false)
  }, [])

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!pending || busy || phrase) return
      if (!email.trim() || !password) {
        setError('Enter the email and password you sign in with.')
        return
      }
      setBusy(true)
      setError(null)
      try {
        setPhrase(await enrolRecoveryIdentity({ email, password }))
        // 🔴 Deliberately NOT resolving or closing here. The enrolment has
        // succeeded server-side, but the user has not yet seen the phrase — and
        // it is the only copy in existence. The phrase panel resolves instead,
        // after they have confirmed they wrote it down.
        setPassword('')
      } catch (err) {
        // The server writes the record and the wrap in ONE statement or not at
        // all, so nothing partial exists on any failure path. Keep the dialog
        // open so the user can correct and retry.
        setError(enrolErrorMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [pending, busy, phrase, email, password],
  )

  const onConfirmed = useCallback(() => {
    if (!pending) return
    const { resolve } = pending
    close()
    resolve()
  }, [pending, close])

  const onCancel = useCallback(() => {
    if (!pending) return
    const { reject } = pending
    close()
    reject(new Error('__recovery_enrol_cancelled__'))
  }, [pending, close])

  const modal = pending ? (
    <div
      className={MODAL_SCROLL_CLASS}
      role="dialog"
      aria-modal="true"
    >
      {/* 🔴 SCROLLING IS ON THE OUTER ELEMENT, CENTERING ON THIS ONE, and they
          must not be combined. `flex items-center` on a scroll container
          overflows a too-tall child EQUALLY IN BOTH DIRECTIONS, and the half
          above the scroll origin is unreachable — `scrollTop` cannot go
          negative. The bottom scrolls, the top is simply gone.

          Measured 03-09-2026 on a real user's laptop: the recovery-phrase
          panel's own heading was clipped off the top of the screen while she
          was copying down the only existing copy of her recovery phrase. On a
          shorter window it would have cut WORDS.

          `min-h-full` is what keeps short dialogs centred: the wrapper fills
          the viewport when the content is small, and grows past it when the
          content is tall, so the scroll container can reach all of it. */}
      <div className={MODAL_CENTER_CLASS}>
        <div className={MODAL_PANEL_CLASS}>
          {phrase ? (
            // Facet's component, the same one id.ciphera.net shows at signup.
            // `recoveryAvailable` is service policy and is passed in, never
            // assumed by the component: recovery IS available now, and this
            // phrase can be used at id.ciphera.net/recover today.
            <RecoveryPhraseDisplay
              phrase={phrase}
              recoveryAvailable
              onConfirmed={onConfirmed}
            />
          ) : (
            <>
              <h2 className="text-lg font-semibold text-foreground">Set up account recovery</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We&apos;ll give you a recovery phrase to write down. It&apos;s the only way back into
                your account if you forget your password — Ciphera cannot reset it for you. Enter the
                email and password you sign in with to begin.
              </p>

              <form onSubmit={onSubmit} className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="recovery-email" className="block text-sm font-medium text-foreground/70">
                    Sign-in email
                  </label>
                  <Input
                    id="recovery-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoFocus
                    required
                    disabled={busy}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="recovery-password" className="block text-sm font-medium text-foreground/70">
                    Password
                  </label>
                  <Input
                    id="recovery-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    required
                    disabled={busy}
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button type="submit" disabled={busy || !email.trim() || !password}>
                    {busy ? 'Setting up…' : 'Create my recovery phrase'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  ) : null

  return { requestRecoveryEnrol, modal }
}
