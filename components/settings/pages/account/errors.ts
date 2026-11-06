import { ApiError } from '@/lib/api/client'
import { readStatus } from '@/lib/api/status'
import { isInvalidCredentials } from '@/lib/auth/tessera/errors'
import { PasskeyPrfUnsupportedError } from '@/lib/auth/tessera/passkey-enrol'
import type { DeletionBlocker } from '@/lib/api/user'

/**
 * Every failure the Account page can meet, in the copy deck's words (§12.9). Never Facet's `getAuthErrorMessage`:
 * it always returns its own sentence, so a wrong password read "Invalid credentials" and a fallback never showed.
 *
 * 🔴 A WRONG PASSWORD ARRIVES WITH NO HTTP STATUS. OPAQUE detects it inside the browser's own key exchange and
 * `…/finish` is never sent, so each mapper names what carries a status (or never reached the server) first and
 * falls back to the password.
 */

const TOO_MANY = 'Too many tries in a short time. Wait about a minute and try again.'
const NO_CONNECTION = 'Couldn\'t connect. Check your connection and try again.'
const ID_DOWN = 'Couldn\'t reach Ciphera ID. Nothing changed. Try again.'

function isNetworkError(err: unknown): boolean {
  return err instanceof Error && /network|fetch/i.test(err.message)
}

/** Unlocking the profile with the password. */
export function unlockErrorMessage(err: unknown): string {
  if (err instanceof Error && /no OPAQUE vault/.test(err.message)) return 'This account has no encrypted profile to unlock.'
  const status = readStatus(err)
  if (status === 429) return TOO_MANY
  if (status === 401 || status === 403) return 'That password didn\'t match. Try again.'
  if (status !== null && status >= 500) return ID_DOWN
  if (status !== null) return `Couldn't unlock (error ${status}). Try again.`
  if (isNetworkError(err)) return NO_CONNECTION
  return 'That password didn\'t match. Try again.'
}

/** Stage 1 of an email change. Every branch says nothing changed: stage 1 changes nothing about the account. */
export function emailChangeErrorMessage(err: unknown): string {
  if (err instanceof Error && /no encrypted vault/i.test(err.message)) {
    return 'This account has no encrypted profile, so its address can\'t be changed here.'
  }
  const status = readStatus(err)
  if (status === 429) return TOO_MANY
  if (status === 401 || status === 403) return 'That password didn\'t match. Nothing changed.'
  if (status === 502) return 'Couldn\'t send the link to that address. Nothing changed. Check the address and try again.'
  if (status === 503) return 'Email changes aren\'t working right now. Nothing changed. Try again later.'
  if (status !== null && status >= 500) return ID_DOWN
  if (status === 400) return 'That address was refused. Nothing changed. Check it and try again.'
  if (isNetworkError(err)) return NO_CONNECTION
  return 'That password didn\'t match. Nothing changed.'
}

/** The password step before removing the passkey or deleting the account. */
export function reauthErrorMessage(err: unknown): string {
  const status = readStatus(err)
  if (status === 429) return TOO_MANY
  if (status !== null && status >= 500) return ID_DOWN
  if (isNetworkError(err)) return NO_CONNECTION
  if (status !== null && status !== 401 && status !== 403) return 'Couldn\'t confirm your password. Try again.'
  return 'That password didn\'t match. Try again.'
}

/** The password change ceremony. */
export function changePasswordErrorMessage(err: unknown): string {
  if (isInvalidCredentials(err)) return 'Your current password didn\'t match. Nothing changed.'
  if (err instanceof Error && /no encrypted vault/i.test(err.message)) {
    return 'This account has no encrypted profile, so its password can\'t be changed here.'
  }
  if (readStatus(err) === 429) return TOO_MANY
  return 'Couldn\'t change your password. Try again.'
}

/** Saving your name re-seals the encrypted profile, which needs it unlocked. */
export function saveNameErrorMessage(err: unknown): string {
  if (err instanceof Error && /Unlock your profile/i.test(err.message)) return 'Unlock your profile to change your name.'
  if (err instanceof Error && /no encrypted vault/i.test(err.message)) {
    return 'This account has no encrypted profile, so its name can\'t be saved here.'
  }
  return 'Couldn\'t save your name. Try again.'
}

// The dialogs' shared words (§12.9, "dialogs").
const DIALOG_WRONG = 'That email or password didn\'t match. Nothing was saved.'
const DIALOG_TOO_MANY = 'Too many tries. Nothing was saved. Wait a moment and try again.'
const DIALOG_DOWN = 'Couldn\'t reach Ciphera ID. Nothing was saved. Check your connection and try again.'
const DIALOG_REFUSED = 'Ciphera ID refused this. Nothing was saved. Try again.'

// Bitwarden's note, as `lib/auth/passkey/authenticators.ts` words it, and as the copy deck words it (§12.4).
const BITWARDEN_NOTE = 'Bitwarden cannot do this yet — it has no PRF support for the passkeys it stores.'
const BITWARDEN_NOTE_NEW = 'Bitwarden can\'t do this yet: its passkeys can\'t unlock an encrypted profile.'

/**
 * Adding a passkey. 🔴 An `ApiError`'s message is never shown: `apiRequest` replaces it with Facet's status text, and
 * a mistyped password (401 at `/auth/reauth/finish`) would read "Session expired, please sign in again".
 */
export function passkeyEnrolErrorMessage(err: unknown): string {
  // Named-provider copy from the AAGUID the ceremony reported: the most specific thing Pulse can say.
  if (err instanceof PasskeyPrfUnsupportedError) return err.message.replace(BITWARDEN_NOTE, BITWARDEN_NOTE_NEW)
  if (isInvalidCredentials(err)) return DIALOG_WRONG
  if (err instanceof ApiError) {
    if (err.status === 0) return DIALOG_DOWN
    if (err.status === 401 || err.status === 403) return DIALOG_WRONG
    // The one-passkey cap: the count changed underneath the page (another tab, another device).
    if (err.status === 409) return 'You already have a passkey. Remove it to add another.'
    if (err.status === 429) return DIALOG_TOO_MANY
    return DIALOG_REFUSED
  }
  // A closed or dismissed biometric prompt; the browser's own text is for developers.
  if (err instanceof DOMException || (err as { name?: string } | null)?.name === 'NotAllowedError') {
    return 'The passkey prompt was closed. Nothing was saved. Try again when you\'re ready.'
  }
  if (err instanceof Error && /no encrypted vault/i.test(err.message)) {
    return 'This account has no encrypted profile, so it can\'t have a passkey.'
  }
  return 'Couldn\'t add the passkey. Nothing was saved. Try again.'
}

/** Setting up a recovery phrase. Same rule as the passkey: an `ApiError`'s message is never shown. */
export function recoveryEnrolErrorMessage(err: unknown): string {
  if (isInvalidCredentials(err)) return DIALOG_WRONG
  if (err instanceof ApiError) {
    if (err.status === 0) return DIALOG_DOWN
    if (err.status === 401 || err.status === 403) return DIALOG_WRONG
    if (err.status === 429) return DIALOG_TOO_MANY
    return DIALOG_REFUSED
  }
  if (err instanceof Error && /no encrypted vault/i.test(err.message)) {
    return 'This account has no encrypted profile, so it can\'t have a recovery phrase.'
  }
  if (err instanceof Error && /did not produce a phrase/i.test(err.message)) {
    return 'Couldn\'t make a phrase. Nothing was saved. Try again.'
  }
  return 'Couldn\'t set up the recovery phrase. Nothing was saved. Try again.'
}

/**
 * The 409 a deletion meets after the hold, as a sentence the person can act on. A team with another admin blocks the
 * deletion until it has a new owner; anything else means the list the dialog showed went stale (a team made since),
 * and the dialog re-reads it.
 */
export function deletionRefusedMessage(orgs: Pick<DeletionBlocker, 'name' | 'action_required'>[]): string {
  const blocking = orgs.filter((o) => o.action_required === 'transfer_ownership')
  if (blocking.length > 0) {
    return blocking
      .map((o) => `You own ${o.name}, which has another admin. Make them the owner on the Team page, then try again.`)
      .join(' ')
  }
  return 'Something changed since this page loaded. Check what goes with your account, then try again.'
}
