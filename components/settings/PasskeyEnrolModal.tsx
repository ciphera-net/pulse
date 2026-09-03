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
import { ApiError } from '@/lib/api/client'
import { enrolPasskey } from '@/lib/auth/tessera/passkey-enrol'

/**
 * What to SHOW the user for a failed enrolment.
 *
 * 🔴 An `ApiError`'s `.message` MUST NOT be shown here. `lib/api/client.ts`
 * replaces every HTTP error message with `authMessageFromStatus(status)` before
 * it throws, and Facet maps 401 to "Session expired, please sign in again." The
 * most likely failure on this dialog is a mistyped password, which id-backend
 * answers 401 at `/auth/reauth/finish` — so rendering `err.message` verbatim
 * told a user with a perfectly healthy session to sign in again. Following that
 * instruction changes nothing, they return, retype the same wrong password, and
 * read the same sentence: a loop with no hint that the password is the problem.
 *
 * This is the rule `ReauthModal` already follows for the identical ceremony —
 * it discards `err.message` on purpose and writes its own. The modal's docblock
 * claims it fills ReauthModal's gap "the same way"; on error text it did the
 * opposite, and this is what makes the claim true.
 *
 * Plain `Error`s are the exception and are shown verbatim: those come from
 * `passkey-enrol.ts`, which throws deliberate, specific sentences ("This
 * account has no encrypted vault…", "…did not produce a vault key"). Those say
 * more than any generic text could.
 */
function enrolErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    // 0 is this client's own code for "the request never completed".
    if (err.status === 0) {
      return 'Could not reach Ciphera ID. Nothing was saved — check your connection and try again.'
    }
    if (err.status === 401 || err.status === 403) {
      return 'That email or password didn\u2019t match. Nothing was saved — please try again.'
    }
    if (err.status === 409) {
      // The one-passkey cap (ciphera-id#67). ProfileSettings refuses before the
      // modal opens, so reaching this means the count changed underneath us —
      // another tab, another device. Say the actionable thing, not "refused".
      return 'This account already has a passkey. Remove it before adding another.'
    }
    if (err.status === 429) {
      return 'Too many attempts. Nothing was saved — wait a moment and try again.'
    }
    return 'Ciphera ID refused the request. Nothing was saved — please try again.'
  }
  // A cancelled or dismissed biometric prompt. The browser's own text is
  // developer-facing, so it never reaches the user.
  if (err instanceof DOMException || (err as { name?: string })?.name === 'NotAllowedError') {
    return 'The passkey prompt was dismissed. Nothing was saved — try again when you are ready.'
  }
  if (err instanceof Error && err.message) return err.message
  return 'Passkey setup failed. Nothing was saved — please try again.'
}

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
        setError(enrolErrorMessage(err))
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
