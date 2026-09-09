import { Tessera } from '@ciphera-net/tessera'
import { ensureTessera } from './init'
import { makeOpaqueTransport } from './transport'
import { authFetch } from '@/lib/api/client'

/** The body for `PUT /auth/user/password/opaque` (OpaquePasswordChangeHandler,
 *  id-backend internal/api/opaque_settings.go). The next-phase adapter POSTs this. */
export interface OpaquePasswordChangePayload {
  registration_upload_b64: string
  credential_id: string
  opaque_wrapped_key: string
}

interface VaultResponse {
  encrypted_vault?: string
  opaque_wrapped_key?: string
}

/**
 * The re-auth purpose this ceremony proves.
 *
 * Its token is spendable NOWHERE — `PUT /auth/user/password/opaque` is not
 * token-gated, and its step-up is the OPAQUE re-registration itself, which
 * cannot be produced without the old password. The purpose exists because
 * `/auth/reauth/finish` requires one; reusing 'del' or 'enr' would leave a live
 * token for a destructive ceremony in JS hands after every password change.
 * Mirrors ReauthPurposePasswordChange in id-backend's opaque_reauth.go.
 */
const PASSWORD_REAUTH_PURPOSE = 'pwd'

/**
 * The SDK derives its own credential id from whatever string it is handed
 * (`credentialId = blindIndexString(email)`), and Pulse's transport THROWS THAT
 * AWAY: it posts `o.blindIndex` on the wire and takes the real OPAQUE identity
 * from the server-generated `credential_id`. Read the SDK if this looks unsafe —
 * `credentialId` reaches `loginStart`, `getWrap` and `putWraps` and nothing
 * else. It never enters `createLoginHandle(password)` or
 * `lh.finish(password, response)`, so it is not an AKE input; the AKE's inputs
 * are the password and the server's response.
 *
 * So a constant is correct here, and an email would be no more correct — only
 * more expensive (Argon2id over a longer string) and a reason to ask the user
 * for something the ceremony does not need.
 */
const SDK_CREDENTIAL_SEED = 'session'

export interface OpaqueChangePasswordResult {
  payload: OpaquePasswordChangePayload
}

export interface OpaqueChangePasswordOptions {
  /** Raw current password (UTF-8). The SDK re-authenticates with it internally. */
  oldPassword: string
  /** Raw new password (UTF-8). */
  newPassword: string
}

/**
 * Drive an OPAQUE password change: re-authenticate with the OLD password, run a
 * fresh OPAQUE registration under the NEW password, and re-wrap the SAME VMK
 * from the 'opaque' wrap into a new 'opaque' wrap under the new export_key. The
 * vault is NEVER re-encrypted and the recovery + passkey wraps stay valid.
 *
 * 🔴 `basePath: '/auth/reauth'` IS LOAD-BEARING, and running without it is the
 * bug this rewrite fixes. The SDK runs its OWN OPAQUE login inside
 * changePassword to re-derive the old export_key — the vault key is a
 * non-extractable CryptoKey and cannot be re-wrapped from a session alone. On
 * the DEFAULT base path that login hits the PRIMARY login endpoint, and two
 * things go wrong:
 *
 *   1. On an account with TOTP enabled, `/auth/opaque/login/finish` answers
 *      401 `require_2fa` (opaque_login.go:237-240) and nothing on this path
 *      supplies a code — so the password change failed for EVERY 2FA account,
 *      reporting a credential error for a correct password.
 *   2. Even without TOTP it issues fresh JWT cookies and SWAPS THE SESSION
 *      underneath a settings page, which is why the caller used to need a
 *      session-swap guard.
 *
 * This is the identical defect, cause and fix as recovery enrolment on
 * 03-09-2026 (see recovery-enrol.ts's own basePath comment). `enrolPasskey` had
 * always done it correctly; recovery enrolment was moved then; password change
 * was missed until 09-09-2026.
 *
 * ⚠️ `/auth/reauth/finish` returns ONLY `{reauth_token}` — no `encrypted_vault`,
 * no `opaque_wrapped_key`, and the OPAQUE session key is discarded server-side.
 * So the wrap is SEEDED from the session-authenticated vault read rather than
 * read off the login response, exactly as recovery enrolment seeds it.
 *
 * 🔑 No email, and none is asked for. `/auth/reauth/start` resolves the account
 * from the session when no blind index is sent (ciphera-id#95); the SDK's
 * credential id is discarded by the transport; and the AKE never sees either.
 * The identity is enforced server-side, twice: start refuses a blind index that
 * is not the session's account, and finish refuses unless the ceremony's
 * binding is the session's own user.
 */
export async function performOpaqueChangePassword(
  opts: OpaqueChangePasswordOptions
): Promise<OpaqueChangePasswordResult> {
  await ensureTessera()

  // The account's OPAQUE wrap. The SDK opens the vault key from THIS blob and
  // re-wraps that same key; without it, changePassword throws after the old
  // password has already been proven.
  const vault = await authFetch<VaultResponse>('/auth/user/vault', { skipAuthRetry: true })
  if (!vault?.opaque_wrapped_key) {
    throw new Error('This account has no encrypted vault, so its password cannot be changed here.')
  }

  const transport = makeOpaqueTransport({
    // Empty on purpose: the server reads this as "resolve the session's own
    // account". A non-empty value would still work — it takes the blind-index
    // branch and asserts the account matches — but there is nothing to put in
    // it, because nobody typed an email.
    blindIndex: '',
    mode: 'settings',
    basePath: '/auth/reauth',
    seedWraps: { opaque: vault.opaque_wrapped_key },
    loginExtras: { purpose: PASSWORD_REAUTH_PURPOSE },
  })

  await new Tessera(transport).changePassword({
    email: SDK_CREDENTIAL_SEED,
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
  }
}
