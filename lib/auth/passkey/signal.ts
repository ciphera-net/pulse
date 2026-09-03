/**
 * Tell the passkey provider to forget a credential we abandoned.
 *
 * 🔴 WHY THIS EXISTS. A Ciphera passkey enrolment can fail AFTER
 * `navigator.credentials.create()` has already minted a credential — the
 * authenticator returns no PRF secret, or the user abandons the password step.
 * The server writes nothing in either case, which is correct, but the
 * CREDENTIAL still exists inside the user's password manager: an entry for
 * ciphera.net that can never sign in, indistinguishable from a working one.
 *
 * Two such orphans exist right now in the owner's Bitwarden and Proton Pass,
 * left by the 03-09-2026 live gate. That is the entire motivation: we made the
 * mess, so we clean it up.
 *
 * ⚠️ THIS IS BEST-EFFORT AND MUST NEVER GATE ANYTHING. `signalUnknownCredential`
 * is a recent API (Chrome 132+, and absent from Safari and Firefox at the time
 * of writing); providers may ignore it, and it can reject for reasons that are
 * none of our business. A failure here is not a failure of the flow the user is
 * in — they are already being told their enrolment did not work — so it is
 * swallowed deliberately, and the caller is never made to await a decision on
 * it.
 *
 * 🔑 It is a HINT, not a delete. The spec lets a provider show a prompt, defer,
 * or do nothing. So the copy shown to the user must never promise the entry is
 * gone; the most that can honestly be said is that nothing was saved on our
 * side, which is true regardless.
 */

interface SignalCapablePublicKeyCredential {
  signalUnknownCredential?: (options: { rpId: string; credentialId: string }) => Promise<void>
}

/**
 * Ask the provider to drop a credential this site will never accept.
 *
 * @param rpId          the relying-party id the credential was created under
 * @param credentialId  base64url, as returned by the registration ceremony
 */
export async function forgetOrphanedCredential(
  rpId: string | undefined,
  credentialId: string | undefined,
): Promise<void> {
  if (!rpId || !credentialId) return
  try {
    const pkc = (globalThis as { PublicKeyCredential?: SignalCapablePublicKeyCredential })
      .PublicKeyCredential
    // Feature-detected rather than version-sniffed: the method is either there
    // or it is not, and on the browsers where it is not there is nothing to do.
    if (typeof pkc?.signalUnknownCredential !== 'function') return
    await pkc.signalUnknownCredential({ rpId, credentialId })
  } catch {
    // Deliberately silent. See the note above: the user is already being told
    // the enrolment failed, and a second, vaguer failure about housekeeping
    // they never asked for would only obscure it.
  }
}
