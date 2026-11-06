'use client'

import { useCallback, useState } from 'react'
import { Button, Input } from '@ciphera-net/facet'
import {
  beginPasskeyEnrol,
  completePasskeyEnrol,
  abandonPasskeyEnrol,
  type PasskeyEnrolHandle,
} from '@/lib/auth/tessera/passkey-enrol'
import { MODAL_SCROLL_CLASS, MODAL_CENTER_CLASS, MODAL_PANEL_CLASS } from '@/components/settings/modalChrome'
import { passkeyEnrolErrorMessage } from './errors'

/**
 * Adding a passkey: the old settings' two-step dialog (PasskeyEnrolModal, removed with them) with the copy deck's words
 * (§12.4, §12.9). The ceremony is unchanged and lives in `lib/auth/tessera/passkey-enrol.ts`.
 *
 * 🔑 THE BIOMETRIC COMES FIRST (R1, 03-09-2026). Whether an authenticator can produce a PRF secret cannot be known
 * before the ceremony, and two providers people use fail every time, so a failed attempt costs one tap rather than an
 * email, a password and a tap. Abandoning after it signals the provider to forget the credential.
 *
 * The email is asked for because Pulse's session carries no address (zero-knowledge), and the password because a
 * non-extractable vault key can only be re-wrapped from a live OPAQUE ceremony.
 */
interface Pending {
  resolve: () => void
  reject: (err: Error) => void
}

const CANCELLED = '__passkey_enrol_cancelled__'

/** True when the rejection came from closing the dialog, which is not a failure. */
export function isPasskeyEnrolCancelled(err: unknown): boolean {
  return err instanceof Error && err.message === CANCELLED
}

export function usePasskeyEnrolDialog(): { requestPasskeyEnrol: () => Promise<void>; modal: React.ReactNode } {
  const [pending, setPending] = useState<Pending | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Null until the biometric has succeeded; its presence is the second step. */
  const [handle, setHandle] = useState<PasskeyEnrolHandle | null>(null)

  const requestPasskeyEnrol = useCallback((): Promise<void> => {
    setEmail('')
    setPassword('')
    setName('')
    setError(null)
    setBusy(false)
    setHandle(null)
    return new Promise<void>((resolve, reject) => setPending({ resolve, reject }))
  }, [])

  const close = useCallback(() => {
    setPending(null)
    // The password never outlives the dialog.
    setPassword('')
    setError(null)
    setBusy(false)
    setHandle(null)
  }, [])

  const onBegin = useCallback(async () => {
    if (!pending || busy) return
    setBusy(true)
    setError(null)
    try {
      setHandle(await beginPasskeyEnrol())
    } catch (err) {
      setError(passkeyEnrolErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [pending, busy])

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!pending || busy || !handle) return
      if (!email.trim() || !password) {
        setError('Enter the email and password you sign in with.')
        return
      }
      setBusy(true)
      setError(null)
      try {
        await completePasskeyEnrol(handle, { email, password, displayName: name })
        const { resolve } = pending
        close()
        resolve()
      } catch (err) {
        // Nothing was written (one statement or none). Keep the handle: a mistyped password must not cost another tap.
        setBusy(false)
        setError(passkeyEnrolErrorMessage(err))
      }
    },
    [pending, busy, handle, email, password, name, close],
  )

  const onCancel = useCallback(() => {
    if (!pending) return
    if (handle) abandonPasskeyEnrol(handle)
    const { reject } = pending
    close()
    reject(new Error(CANCELLED))
  }, [pending, handle, close])

  const modal = pending ? (
    <div className={MODAL_SCROLL_CLASS} role="dialog" aria-modal="true" aria-labelledby="account-passkey-title">
      <div className={MODAL_CENTER_CLASS}>
        <div className={MODAL_PANEL_CLASS}>
          <h2 id="account-passkey-title" className="text-lg font-semibold text-foreground">Add a passkey</h2>
          {!handle ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Your device or password manager makes the passkey first, so you see at once whether it can unlock your
                profile. Nothing is saved yet.
              </p>
              {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
              <div className="flex gap-2 pt-5">
                <Button type="button" onClick={() => void onBegin()} disabled={busy}>
                  {busy ? 'Waiting for your device…' : 'Continue'}
                </Button>
                <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                {`${handle.profile ? handle.profile.name : 'That passkey'} can unlock your profile. Enter the email and password you sign in with to link it. They're used once.`}
              </p>
              <form onSubmit={onSubmit} className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="account-passkey-email" className="block text-sm font-medium text-foreground">Sign-in email</label>
                  <Input
                    id="account-passkey-email"
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
                  <label htmlFor="account-passkey-password" className="block text-sm font-medium text-foreground">Password</label>
                  <Input
                    id="account-passkey-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    required
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="account-passkey-name" className="block text-sm font-medium text-foreground">
                    Passkey name <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <Input
                    id="account-passkey-name"
                    type="text"
                    value={name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                    placeholder="MacBook"
                    maxLength={64}
                    disabled={busy}
                  />
                </div>
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <Button type="submit" disabled={busy || !email.trim() || !password}>
                    {busy ? 'Setting up…' : 'Link passkey'}
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

  return { requestPasskeyEnrol, modal }
}
