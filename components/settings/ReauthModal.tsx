'use client'

/**
 * ReauthModal — step-up OPAQUE re-authentication for sensitive settings writes.
 *
 * Pulse logs in via an OAuth redirect to Ciphera ID, so it never runs OPAQUE and
 * never holds a VMK (the vault master key is a non-extractable CryptoKey that only
 * an OPAQUE login ceremony can reconstruct). The three sensitive settings writes —
 * password change, email change, delete account — need a *fresh* OPAQUE proof (and,
 * for email, a live VMK to re-seal the vault). This modal collects that proof at
 * the moment of the operation, then drops the key material.
 *
 * The one input Pulse cannot supply from the session is the LOGIN EMAIL: the access
 * token carries no `email` claim (id-backend token_issuance.go), and `ciphera_pii`
 * is display-only and usually absent for ZKE accounts. So the modal collects the
 * login email as typed user input (pre-filled from `ciphera_pii` when present, but
 * never load-bearing). This is self-validating: a wrong email → wrong blind index →
 * the OPAQUE ceremony fails with NO write, so a typo can never corrupt a vault.
 *
 * The password (and new password / new email) are already collected by the calling
 * surface (the Facet password form / email prompt, or AccountProfileTab's delete
 * panel) and handed in via the request — this modal does not re-prompt for them,
 * it only fills the email gap and drives the ceremony.
 *
 * Lockout guards (plan 20-07-2026 §A.4):
 *  - blind index is computed from the TYPED login email at op time (never a cache).
 *  - email change computes encrypted_vault, email_blind_index, and relay_blob from
 *    the SINGLE newEmail variable — currentEmail never leaks into the vault write.
 *  - the VMK handle lives only for the write, held in a ref and dropped in finally.
 *  - every OPAQUE sub-call uses skipAuthRetry (a 401 means bad password, not an
 *    expired token — auto-refresh would burn the single-use login state).
 *
 * Session-swap guard (WS2 hardening):
 *  The typed login email is free-form, so a user who knows a DIFFERENT account's
 *  email + password can drive a successful OPAQUE ceremony for THAT account. The
 *  ceremony's login/finish silently REPLACES the browser JWT cookies with the other
 *  identity, and every sensitive op (password PUT, email PUT, account DELETE) is
 *  cookie-authenticated — so without a guard the op would land on the wrong account.
 *  We therefore capture the CURRENT session's user id (JWT `sub`, always present even
 *  when the email claim is absent) BEFORE the ceremony, read the re-authenticated
 *  user id from the OPAQUE finish body, and refuse to mutate anything unless they
 *  match. This gates ALL three ops.
 *
 * Org-context restore (WS2 hardening):
 *  login/finish issues an ORG-SCOPED access token bound to the user's PRIMARY org
 *  (id-backend issueOrgScopedAccessToken → pickPrimaryOrg = alphabetically-first
 *  membership), NOT the org the user was actively viewing. For the email op — the
 *  only op whose session survives (password → all sessions revoked → re-login;
 *  delete → account gone) — we re-establish the pre-ceremony org via switch-context
 *  so the change never silently moves the user to a different workspace.
 */

import { useCallback, useRef, useState } from 'react'
import { Button, Input } from '@ciphera-net/facet'
import apiRequest from '@/lib/api/client'
import { computeBlindIndex } from '@/lib/crypto/blind-index'
import { encryptVaultH } from '@/lib/crypto/vault-ops'
import { getRelayPublicKey, sealForRelay } from '@/lib/crypto/relay'
import { performOpaqueLogin } from '@/lib/auth/tessera/opaque-login'
import { performOpaqueChangePassword } from '@/lib/auth/tessera/opaque-change-password'
import { getSessionAction, setSessionAction } from '@/app/actions/auth'
import { switchContext } from '@/lib/api/organization'
import { logger } from '@/lib/utils/logger'
import type { VaultKeyHandle } from '@/lib/auth/vault-key'

/** The current session as the server sees it (JWT claims), captured before the
 *  OPAQUE ceremony overwrites the auth cookies. */
type SessionSnapshot = Awaited<ReturnType<typeof getSessionAction>>

/**
 * Thrown when the re-authenticated account does not match the account the user is
 * signed in as. Distinct from a bad-password failure so the modal can surface the
 * precise "different account" message. No write has happened when this is thrown.
 */
class SessionSwapError extends Error {
  constructor() {
    super('__reauth_session_swap__')
    this.name = 'SessionSwapError'
  }
}

/**
 * Fail the re-auth unless the ceremony re-authenticated the SAME account the user
 * is signed in as. Fails CLOSED: a missing expected sub (no session) or a missing
 * finish user_id both count as a mismatch — we never mutate on an unverifiable id.
 */
function assertSameAccount(expectedSub: string | undefined, reauthedUserId: string | undefined): void {
  if (!expectedSub || !reauthedUserId || expectedSub !== reauthedUserId) {
    throw new SessionSwapError()
  }
}

/**
 * Re-establish the org context the user held before the ceremony. The email op's
 * login/finish leaves an access token scoped to the PRIMARY org; switch-context
 * re-issues a token for the org the user was actually in and re-writes the cookie.
 *
 * Best-effort and non-silent: the login/finish token is itself a fully valid,
 * org-scoped session (never a broken half-scoped one), so a failed restore is
 * logged — never swallowed — but does not fail the (already-committed) email change.
 * The app's org-wall effect reconciles from whatever org the surviving token carries.
 */
async function restoreOrgContext(sessionBefore: SessionSnapshot): Promise<void> {
  try {
    const targetOrg = sessionBefore?.org_id ?? ''
    const { access_token } = await switchContext(targetOrg || null)
    await setSessionAction(access_token)
  } catch (e) {
    logger.error('reauth: failed to restore org context after email change', e)
  }
}

/**
 * The op the modal must prove. The password / new-password / new-email inputs are
 * collected by the calling surface and passed in — the modal only adds the login
 * email + the OPAQUE ceremony.
 *
 *  - password: re-register under the new password (VMK re-wrapped internally) and
 *    PUT the new OPAQUE record. All sessions are revoked on success.
 *  - email:    fresh OPAQUE login → live VMK → re-seal the vault under newEmail and
 *    PUT the three real fields.
 *  - delete:   fresh OPAQUE login as a proof only; the VMK is dropped immediately
 *    and the caller performs the DELETE (keeping its own 409 handling).
 */
export type ReauthRequest =
  | { op: 'password'; oldPassword: string; newPassword: string }
  | { op: 'email'; password: string; newEmail: string }
  | { op: 'delete'; password: string }

interface Pending {
  request: ReauthRequest
  resolve: () => void
  reject: (err: Error) => void
}

/** Read the display-only email from the cross-subdomain ciphera_pii cookie (prefill only). */
function prefillEmail(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(/(?:^|;\s*)ciphera_pii=([^;]+)/)
  if (!match) return ''
  try {
    const pii = JSON.parse(atob(match[1])) as { email?: string }
    return pii.email ?? ''
  } catch {
    return ''
  }
}

function b64encode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

const TITLES: Record<ReauthRequest['op'], string> = {
  password: 'Confirm your password change',
  email: 'Confirm your email change',
  delete: 'Confirm account deletion',
}

const BLURBS: Record<ReauthRequest['op'], string> = {
  password:
    'Enter the email you sign in with to verify it’s you. You’ll be signed out of all devices and asked to sign in again with your new password.',
  email:
    'Enter the email you currently sign in with. We use it to unlock your encrypted vault and re-seal it under your new address — nothing is changed if it doesn’t match.',
  delete:
    'Enter the email you sign in with to prove it’s you. This does not delete anything on its own — deletion runs only after the check passes.',
}

/**
 * useReauthModal — returns an imperative `requestReauth(request)` that opens the
 * modal and resolves when the OPAQUE ceremony (and, for password/email, the write)
 * succeeds, or rejects on cancel / failure. Render `{modal}` once in the consumer.
 *
 * Consumers:
 *  - password/email: await requestReauth(...) then handle the terminal UX (password
 *    → sign in again; email → refresh). The write happens inside the modal.
 *  - delete: await requestReauth({op:'delete', password}) for the proof, then call
 *    deleteAccount() yourself (so the 409 owns-organizations handling stays local).
 */
export function useReauthModal(): {
  requestReauth: (request: ReauthRequest) => Promise<void>
  modal: React.ReactNode
} {
  const [pending, setPending] = useState<Pending | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The VMK handle lives only for the duration of one write. Non-extractable —
  // there are no key bytes to wipe; nulling the ref lets the GC reclaim it.
  const handleRef = useRef<VaultKeyHandle | null>(null)

  const requestReauth = useCallback((request: ReauthRequest): Promise<void> => {
    setEmail(prefillEmail())
    setError(null)
    setBusy(false)
    return new Promise<void>((resolve, reject) => {
      setPending({ request, resolve, reject })
    })
  }, [])

  const close = useCallback(() => {
    setPending(null)
    setEmail('')
    setError(null)
    setBusy(false)
  }, [])

  const runCeremony = useCallback(
    async (request: ReauthRequest, loginEmail: string, sessionBefore: SessionSnapshot): Promise<void> => {
      const trimmed = loginEmail.trim()
      // The account the user believes they are acting on. login/finish inside the
      // ceremony will overwrite the auth cookies, so this MUST be read beforehand.
      const expectedSub = sessionBefore?.id

      if (request.op === 'password') {
        // OPAQUE re-registration under the new password; the SDK re-wraps the SAME
        // VMK internally (vault untouched). Then PUT the new record. skipAuthRetry:
        // a retry would re-post single-use registration state and fail.
        const { payload, userId } = await performOpaqueChangePassword({
          email: trimmed,
          oldPassword: request.oldPassword,
          newPassword: request.newPassword,
        })
        // Session-swap guard: the internal re-auth may have signed us in as another
        // account. Refuse the PUT unless it resolved to THIS account.
        assertSameAccount(expectedSub, userId)
        await apiRequest('/auth/user/password/opaque', {
          method: 'PUT',
          body: JSON.stringify(payload),
          skipAuthRetry: true,
        })
        return
      }

      if (request.op === 'email') {
        // Fresh OPAQUE login yields a live VMK handle + the already-decrypted vault.
        const { handle, vaultData, finish } = await performOpaqueLogin({
          email: trimmed,
          password: request.password,
          blindIndex: await computeBlindIndex(trimmed),
        })
        handleRef.current = handle
        try {
          // Session-swap guard: gate the vault re-seal + PUT on the login/finish
          // user_id matching the current session. Runs before ANY mutation.
          assertSameAccount(expectedSub, finish.user_id)
          // Lockout guard #3: encrypted_vault, email_blind_index, and relay_blob are
          // ALL derived from the single newEmail variable — currentEmail (trimmed)
          // never leaks into the vault write.
          const newEmail = request.newEmail.trim()
          vaultData.email = newEmail
          const encrypted_vault = await encryptVaultH(handle, vaultData)
          const email_blind_index = await computeBlindIndex(newEmail)
          const relayPublicKey = await getRelayPublicKey()
          const relay_blob = b64encode(await sealForRelay(newEmail, relayPublicKey))
          await apiRequest('/auth/user/email', {
            method: 'PUT',
            body: JSON.stringify({ encrypted_vault, email_blind_index, relay_blob }),
            skipAuthRetry: true,
          })
          // Org-context restore: login/finish reset the token to the PRIMARY org.
          // Re-establish the org the user was actually in so the email change never
          // silently moves them to a different workspace.
          await restoreOrgContext(sessionBefore)
        } finally {
          handleRef.current = null
        }
        return
      }

      // delete: a fresh OPAQUE login is the proof; drop the VMK immediately. The
      // caller performs the DELETE after this resolves (keeps its 409 handling).
      const { handle, finish } = await performOpaqueLogin({
        email: trimmed,
        password: request.password,
        blindIndex: await computeBlindIndex(trimmed),
      })
      handleRef.current = handle
      handleRef.current = null
      // Session-swap guard: refuse to let the caller DELETE unless the proof
      // resolved to THIS account. Throwing here rejects requestReauth(), so the
      // caller's deleteAccount() never runs.
      assertSameAccount(expectedSub, finish.user_id)
    },
    []
  )

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!pending || busy) return
      if (!email.trim()) {
        setError('Enter the email you sign in with.')
        return
      }
      setBusy(true)
      setError(null)
      try {
        // Capture the current session BEFORE the ceremony — its login/finish will
        // overwrite the auth cookies. `sub` drives the session-swap guard; `org_id`
        // drives the post-op org-context restore.
        const sessionBefore = await getSessionAction()
        await runCeremony(pending.request, email, sessionBefore)
        const { resolve } = pending
        close()
        resolve()
      } catch (err) {
        // No write happened on a failed ceremony. Keep the modal open so the user
        // can correct the email/password and retry — never a silent close.
        handleRef.current = null
        setBusy(false)
        if (err instanceof SessionSwapError) {
          setError(
            'You signed in as a different account. Nothing was changed — use THIS account’s sign-in email.'
          )
        } else {
          setError(
            err instanceof Error && /network/i.test(err.message)
              ? 'Network error. Please try again.'
              : 'That email or password didn’t match. Nothing was changed — please try again.'
          )
        }
      }
    },
    [pending, busy, email, runCeremony, close]
  )

  const onCancel = useCallback(() => {
    if (!pending) return
    const { reject } = pending
    handleRef.current = null
    close()
    reject(new Error('__reauth_cancelled__'))
  }, [pending, close])

  const modal = pending ? (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm border border-border bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">{TITLES[pending.request.op]}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{BLURBS[pending.request.op]}</p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="reauth-email" className="block text-sm font-medium text-foreground/70">
              Sign-in email
            </label>
            <Input
              id="reauth-email"
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

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? 'Verifying…' : 'Verify'}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  ) : null

  return { requestReauth, modal }
}

/** True when a rejection came from the user cancelling the modal (suppress toasts). */
export function isReauthCancelled(err: unknown): boolean {
  return err instanceof Error && err.message === '__reauth_cancelled__'
}
