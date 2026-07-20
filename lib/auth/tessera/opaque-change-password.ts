import { Tessera } from '@ciphera-net/tessera'
import { ensureTessera } from './init'
import { makeOpaqueTransport } from './transport'
import { computeBlindIndex } from '@/lib/crypto/blind-index'

/** The body for `PUT /auth/user/password/opaque` (OpaquePasswordChangeHandler,
 *  id-backend internal/api/opaque_settings.go). The next-phase adapter POSTs this. */
export interface OpaquePasswordChangePayload {
  registration_upload_b64: string
  credential_id: string
  opaque_wrapped_key: string
}

/**
 * The result of an OPAQUE password change. Besides the PUT `payload`, we surface
 * the `userId` the internal re-auth actually resolved to. The SDK's changePassword
 * re-authenticates the OLD password via a full OPAQUE login (loginOpaque → the
 * transport's loginFinish), so the login/finish body — and its `user_id` — is
 * captured on the transport. The caller's session-swap guard compares this against
 * the session the user believes they are acting on: a fresh login/finish silently
 * REPLACES the JWT cookies, so if a different account's credentials were entered the
 * password PUT (cookie-authenticated) would otherwise land on the WRONG account.
 */
export interface OpaqueChangePasswordResult {
  payload: OpaquePasswordChangePayload
  /** The re-authenticated account's user_id from the internal login/finish body. */
  userId?: string
}

export interface OpaqueChangePasswordOptions {
  /** The account's current (login) email — drives the blind index for OPAQUE re-auth. */
  email: string
  /** Raw current password (UTF-8). The SDK re-authenticates with it internally. */
  oldPassword: string
  /** Raw new password (UTF-8). */
  newPassword: string
}

/**
 * Drive an OPAQUE password change: re-authenticate with the OLD password, run a
 * fresh OPAQUE registration under the NEW password, and re-wrap the SAME VMK from
 * the 'opaque' wrap into a new 'opaque' wrap under the new export_key. The vault is
 * NEVER re-encrypted and the recovery + passkey wraps stay valid.
 *
 * Returns the batched payload for `PUT /auth/user/password/opaque` plus the
 * re-authenticated `userId` (for the caller's session-swap guard); the caller
 * (re-auth modal / settings adapter) posts the payload and handles the
 * all-sessions-revoked → re-login-required terminal state. Pure (no React), mirrors
 * id-frontend's handleUpdatePassword crypto (components/settings/ProfileSettings.tsx).
 */
export async function performOpaqueChangePassword(
  opts: OpaqueChangePasswordOptions
): Promise<OpaqueChangePasswordResult> {
  await ensureTessera()
  const blindIndex = await computeBlindIndex(opts.email)
  const transport = makeOpaqueTransport({ blindIndex, mode: 'settings' })
  await new Tessera(transport).changePassword({
    email: opts.email,
    oldPassword: new TextEncoder().encode(opts.oldPassword),
    newPassword: new TextEncoder().encode(opts.newPassword),
  })
  const { uploadB64, wraps } = transport.drainSignupBuffer()
  const credentialId = transport.serverCredentialId()
  if (!uploadB64 || !credentialId || !wraps.opaque) {
    throw new Error('Password change did not complete. Please try again.')
  }
  return {
    payload: {
      registration_upload_b64: uploadB64,
      credential_id: credentialId,
      opaque_wrapped_key: wraps.opaque,
    },
    userId: transport.lastFinish()?.user_id,
  }
}
