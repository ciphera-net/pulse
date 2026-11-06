'use client'

import { useCallback, useState } from 'react'
import { Button, Input, RecoveryPhraseDisplay } from '@ciphera-net/facet'
import { enrolRecoveryIdentity } from '@/lib/auth/tessera/recovery-enrol'
import { MODAL_SCROLL_CLASS, MODAL_CENTER_CLASS, MODAL_PANEL_CLASS } from '@/components/settings/modalChrome'
import { recoveryEnrolErrorMessage } from './errors'

/**
 * Setting up a recovery phrase, and showing it once: the old settings' dialog (RecoveryEnrolModal, removed with them) in
 * the copy deck's words (§12.5). The ceremony is unchanged (`lib/auth/tessera/recovery-enrol.ts`).
 *
 * 🔴 The dialog never closes itself after the phrase is made: the phrase panel owns the exit, because closing on the
 * person's behalf would discard the only copy of a secret the server cannot reproduce. The panel is Facet's
 * `RecoveryPhraseDisplay`, the one id.ciphera.net shows at sign-up, so its words exist once.
 */
interface Pending {
  resolve: () => void
  reject: (err: Error) => void
}

const CANCELLED = '__recovery_enrol_cancelled__'

export function isRecoveryEnrolCancelled(err: unknown): boolean {
  return err instanceof Error && err.message === CANCELLED
}

export function useRecoveryEnrolDialog(): {
  /** `replacing`: a phrase is already set up, and the new one replaces it. */
  requestRecoveryEnrol: (options?: { replacing?: boolean }) => Promise<void>
  modal: React.ReactNode
} {
  const [pending, setPending] = useState<Pending | null>(null)
  const [replacing, setReplacing] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Non-null once made. Its presence is the second step, and the only copy. */
  const [phrase, setPhrase] = useState<string | null>(null)

  const requestRecoveryEnrol = useCallback((options?: { replacing?: boolean }): Promise<void> => {
    setReplacing(Boolean(options?.replacing))
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
        // Not resolved here: the person has not seen the phrase yet. The phrase panel resolves once they confirm.
        setPassword('')
      } catch (err) {
        // The server writes the record and the wrap in one statement or not at all.
        setError(recoveryEnrolErrorMessage(err))
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
    reject(new Error(CANCELLED))
  }, [pending, close])

  const modal = pending ? (
    <div className={MODAL_SCROLL_CLASS} role="dialog" aria-modal="true" aria-label="Set up a recovery phrase">
      <div className={MODAL_CENTER_CLASS}>
        <div className={MODAL_PANEL_CLASS}>
          {phrase ? (
            <RecoveryPhraseDisplay phrase={phrase} recoveryAvailable confirmation="acknowledge" onConfirmed={onConfirmed} />
          ) : (
            <>
              <h2 className="text-lg font-semibold text-foreground">Set up a recovery phrase</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                You get 24 words to write down. If you forget your password, they&apos;re the only way to set a new one:
                Ciphera can&apos;t reset it for you. Enter the email and password you sign in with.
              </p>
              {replacing && (
                <p className="mt-2 text-sm text-muted-foreground">Your old phrase stops working once the new one is made.</p>
              )}
              <form onSubmit={onSubmit} className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="account-recovery-email" className="block text-sm font-medium text-foreground">Sign-in email</label>
                  <Input
                    id="account-recovery-email"
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
                  <label htmlFor="account-recovery-password" className="block text-sm font-medium text-foreground">Password</label>
                  <Input
                    id="account-recovery-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    required
                    disabled={busy}
                  />
                </div>
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <Button type="submit" disabled={busy || !email.trim() || !password}>
                    {busy ? 'Setting up…' : 'Create phrase'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
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
