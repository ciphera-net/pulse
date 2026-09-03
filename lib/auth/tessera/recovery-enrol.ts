import { Tessera } from '@ciphera-net/tessera'
import { computeBlindIndex } from '@ciphera-net/auth/blind-index'
import { ensureTessera } from './init'
import { makeOpaqueTransport } from './transport'
import { performOpaqueReauth } from './opaque-reauth'
import { authFetch } from '@/lib/api/client'

interface VaultResponse {
  encrypted_vault?: string
  opaque_wrapped_key?: string
}

/** The re-auth purpose an enrolment must prove.
 *
 *  The server stores "<purpose>:<userID>" and compares BOTH halves at consume,
 *  so a token minted to unlock the vault ('ulk'), enrol a passkey ('pky'),
 *  change the email ('eml') or delete the account ('del') is refused here — and
 *  is spent by the attempt either way. */
const RECOVERY_REAUTH_PURPOSE = 'enr'

export interface EnrolRecoveryOptions {
  /** The email the user SIGNS IN with. Pulse cannot supply this from the
   *  session — the access token carries no email claim and id-backend stores no
   *  readable address — so it is typed, exactly as the passkey dialog does.
   *  Self-validating: a wrong email is a wrong blind index and the ceremony
   *  fails with nothing written. */
  email: string
  password: string
}

/**
 * Enrol (or ROTATE) this account's recovery identity, and return the phrase to
 * show ONCE.
 *
 * Two ceremonies, in this order, and both are necessary:
 *
 *   1. A re-auth ceremony against `/auth/reauth/*` for purpose 'enr'. Enrolling
 *      installs a PERMANENT SECOND WAY INTO THE ACCOUNT, so a live session must
 *      not be enough on its own — a stolen laptop would otherwise be able to
 *      mint itself a recovery phrase. The token is single-use and purpose-bound.
 *
 *   2. `enrolRecoveryIdentity`, which mints the phrase, registers it as a second
 *      OPAQUE identity, and re-wraps the SAME vault key under its entropy. The
 *      vault is never re-encrypted. Record and wrap travel in ONE request that
 *      the server writes in one statement, because an account holding one
 *      without the other passes recovery login and then cannot decrypt — the
 *      half-written state ciphera-id#68 exists to make unrepresentable.
 *
 * 🔑 The password is needed for BOTH, and not merely for the proof: the vault
 * key is a non-extractable CryptoKey, so it cannot be re-wrapped from a session
 * and has to be re-derived from a live OPAQUE ceremony.
 *
 * 🔴 THE RETURNED PHRASE IS THE ONLY COPY. The server holds a record that can
 * VERIFY it and a wrap sealed under its entropy; neither can reproduce it. Show
 * it once, and never log it.
 */
export async function enrolRecoveryIdentity(opts: EnrolRecoveryOptions): Promise<string> {
  await ensureTessera()
  const email = opts.email.trim()
  const blindIndex = await computeBlindIndex(email)

  // (1) Prove a fresh password for THIS purpose.
  const reauthToken = await performOpaqueReauth({
    email,
    password: opts.password,
    blindIndex,
    purpose: RECOVERY_REAUTH_PURPOSE,
  })

  // (2) The account's OPAQUE wrap. The SDK opens the vault key from THIS blob and
  // re-wraps that same key; without it, enrolment throws after the password has
  // already been spent.
  const vault = await authFetch<VaultResponse>('/auth/user/vault', { skipAuthRetry: true })
  if (!vault?.opaque_wrapped_key) {
    throw new Error('This account has no encrypted vault to attach a recovery phrase to.')
  }

  // (3) The enrolment itself.
  //
  // 🔴 `basePath: '/auth/reauth'` IS LOAD-BEARING, and omitting it is the bug this
  // comment exists to prevent recurring. The SDK runs its OWN OPAQUE login inside
  // enrolRecoveryIdentity to re-derive the export_key — the vault key is a
  // non-extractable CryptoKey and cannot be re-wrapped from a session. With the
  // default base path that login hits the PRIMARY login endpoint, and two things
  // go wrong:
  //
  //   1. On an account with TOTP enabled, /auth/opaque/login/finish answers
  //      401 `require_2fa` and the enrolment fails with a message about the
  //      password. Measured 03-09-2026 on a real account, which is how this was
  //      found: the dialog said "That email or password didn't match" for a
  //      correct email and a correct password.
  //   2. Even without TOTP it would issue fresh JWT cookies and SWAP THE SESSION
  //      underneath a settings page.
  //
  // /auth/reauth/* is the dedicated password-proof ceremony: session-authed, no
  // 2FA gate, no cookies. `enrolPasskey` has always done this; this did not.
  //
  // The finish body on that path carries no vault material, so the wrap is seeded
  // from the fetch above rather than read off the response.
  const transport = makeOpaqueTransport({
    blindIndex,
    mode: 'login',
    basePath: '/auth/reauth',
    seedWraps: { opaque: vault.opaque_wrapped_key },
    loginExtras: { purpose: RECOVERY_REAUTH_PURPOSE },
  })
  const { recoveryPhrase } = await new Tessera(transport).enrolRecoveryIdentity({
    email,
    password: new TextEncoder().encode(opts.password),
    reauthToken,
  })

  if (!recoveryPhrase) {
    // Loud-fail rather than returning an empty string a UI would render as a
    // blank phrase panel and a user would "save".
    throw new Error('Recovery setup did not produce a phrase. Nothing was saved.')
  }
  return recoveryPhrase
}
