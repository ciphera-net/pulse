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
 * Returns the batched payload for `PUT /auth/user/password/opaque`; the caller
 * (next-phase re-auth modal / settings adapter) posts it and handles the
 * all-sessions-revoked → re-login-required terminal state. Pure (no React), mirrors
 * id-frontend's handleUpdatePassword crypto (components/settings/ProfileSettings.tsx).
 */
export async function performOpaqueChangePassword(
  opts: OpaqueChangePasswordOptions
): Promise<OpaquePasswordChangePayload> {
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
    registration_upload_b64: uploadB64,
    credential_id: credentialId,
    opaque_wrapped_key: wraps.opaque,
  }
}
