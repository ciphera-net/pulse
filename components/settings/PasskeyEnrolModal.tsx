'use client'

/**
 * PasskeyEnrolModal — collects what a passkey enrolment needs and drives the
 * ceremony.
 *
 * Facet's `onRegisterPasskey` is called with NOTHING: the shared component owns
 * the button and the list, not the credentials. Enrolment needs three things it
 * cannot get from the session:
 *
 *  - the SIGN-IN EMAIL, because Pulse's access token carries no email claim and
 *    id-backend stores no readable address (migration 045). Same gap ReauthModal
 *    fills, filled the same way: typed, never pre-filled, and self-validating —
 *    a wrong email is a wrong blind index, the OPAQUE ceremony fails, and
 *    nothing is written.
 *  - the PASSWORD, because a non-extractable VMK cannot be re-wrapped; the key
 *    has to be re-derived from a live OPAQUE ceremony.
 *  - a NAME, because a name is the only thing that will distinguish this
 *    credential from the next one in the list.
 *
 * The chrome is ReauthModal's, deliberately unchanged — same overlay, same card,
 * same field stack, same button pair. This surface introduces no new visual
 * vocabulary; it is the existing step-up dialog with two more inputs.
 */

import { useCallback, useState } from 'react'
import { Button, Input } from '@ciphera-net/facet'
import { enrolPasskey } from '@/lib/auth/tessera/passkey-enrol'

interface Pending {
  resolve: () => void
  reject: (err: Error) => void
}

/** True when a rejection came from the user closing the dialog (suppress toasts). */
export function isEnrolCancelled(err: unknown): boolean {
  return err instanceof Error && err.message === '__passkey_enrol_cancelled__'
}

export function usePasskeyEnrolModal(): {
  requestPasskeyEnrol: () => Promise<void>
  modal: React.ReactNode
} {
  const [pending, setPending] = useState<Pending | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestPasskeyEnrol = useCallback((): Promise<void> => {
    setEmail('')
    setPassword('')
    setName('')
    setError(null)
    setBusy(false)
    return new Promise<void>((resolve, reject) => setPending({ resolve, reject }))
  }, [])

  const close = useCallback(() => {
    setPending(null)
    // The password never outlives the dialog.
    setPassword('')
    setError(null)
    setBusy(false)
  }, [])

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!pending || busy) return
      if (!email.trim() || !password) {
        setError('Enter the email and password you sign in with.')
        return
      }
      setBusy(true)
      setError(null)
      try {
        await enrolPasskey({ email, password, displayName: name })
        const { resolve } = pending
        close()
        resolve()
      } catch (err) {
        // Nothing was written on any failure path — the server writes the
        // credential, the wrap and the salt in ONE statement or not at all, and
        // every client-side abort happens before that request is sent. Keep the
        // dialog open so the user can correct and retry.
        setBusy(false)
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Passkey setup failed. Nothing was saved — please try again.',
        )
      }
    },
    [pending, busy, email, password, name, close],
  )

  const onCancel = useCallback(() => {
    if (!pending) return
    const { reject } = pending
    close()
    reject(new Error('__passkey_enrol_cancelled__'))
  }, [pending, close])

  const modal = pending ? (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm border border-border bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Add a passkey</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the email and password you sign in with. We use them once to link this device to your
          encrypted vault — after that you can sign in with the passkey alone.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="passkey-email" className="block text-sm font-medium text-foreground/70">
              Sign-in email
            </label>
            <Input
              id="passkey-email"
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
            <label htmlFor="passkey-password" className="block text-sm font-medium text-foreground/70">
              Password
            </label>
            <Input
              id="passkey-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              required
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="passkey-name" className="block text-sm font-medium text-foreground/70">
              Passkey name <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="passkey-name"
              type="text"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="MacBook"
              maxLength={64}
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
              {busy ? 'Setting up…' : 'Continue'}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  ) : null

  return { requestPasskeyEnrol, modal }
}
