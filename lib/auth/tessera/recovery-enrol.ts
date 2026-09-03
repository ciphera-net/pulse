import { Tessera } from '@ciphera-net/tessera'
import { computeBlindIndex } from '@ciphera-net/auth/blind-index'
import { ensureTessera } from './init'
import { makeOpaqueTransport } from './transport'
import { performOpaqueReauth } from './opaque-reauth'

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

  // (2) The enrolment itself. A fresh transport: the re-auth one has spent its
  // ceremony and its buffered state belongs to that exchange, not this one.
  const transport = makeOpaqueTransport({ blindIndex, mode: 'settings' })
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
