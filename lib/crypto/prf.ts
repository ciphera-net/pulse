/**
 * WebAuthn-PRF helpers for passkey enrolment.
 *
 * DELIBERATELY NOT HERE: any wrap or unwrap of the vault master key. The VMK
 * envelope is produced by the Tessera SDK (`Tessera.enablePasskey` →
 * `rewrapForMethod`), which is the audited implementation and the one the
 * conformance vectors are written against. id-frontend once carried its own
 * `wrapVaultKey`/`unwrapVaultKey` in a file of this name; it produced a
 * 60-byte "v2" envelope that no server and no SDK has ever accepted, sat
 * unused for months, and was deleted in id-frontend#37. A second wrap
 * implementation is not a convenience — it is a second wire format, and the
 * failure it produces (a row that passes every server check and unlocks
 * nothing) is only discovered by the user, at the next sign-in, on a device
 * that no longer offers the password path.
 *
 * What is left is the part the SDK cannot do for us: build the extension input
 * for a ceremony driven by the SERVER's creation options, and read the output
 * back off whatever shape the browser or @simplewebauthn hands us.
 */

/** The `extensions` object to merge into a WebAuthn create()/get() request.
 *  `saltBytes` is the PRF eval input — the same bytes must be sent to the
 *  server as `prf_salt` and replayed at every future unlock, or the PRF output
 *  differs and the wrap is dead. */
export function prfExtension(saltBytes: Uint8Array): { prf: { eval: { first: Uint8Array } } } {
  if (saltBytes.length === 0) {
    // A zero-length eval input is not a salt. Fail here rather than enrol a
    // credential whose PRF output is a fleet-wide constant.
    throw new Error('prf: salt must not be empty')
  }
  return { prf: { eval: { first: saltBytes } } }
}

/** Anything that can carry PRF results: the JSON-ish objects @simplewebauthn
 *  returns from startRegistration/startAuthentication, and a raw
 *  `PublicKeyCredential` (which exposes the results only via a METHOD). */
export interface PRFResultCarrier {
  clientExtensionResults?: AuthenticationExtensionsClientOutputs
  getClientExtensionResults?: () => AuthenticationExtensionsClientOutputs
}

/**
 * Read the 32-byte PRF output (`results.first`) from a ceremony response.
 *
 * Property FIRST, method second — the ordering matters and is the bug
 * id-frontend#37 fixed. @simplewebauthn returns a plain object carrying
 * `clientExtensionResults` as a PROPERTY and no method at all; the old
 * accessor only called `getClientExtensionResults()`, so on the shape the app
 * actually receives it threw, and the passkey login path had never once run
 * past that line in production.
 *
 * Returns null — never throws — when there is no PRF result. Absence is a real,
 * expected answer: an authenticator may report `prf: { enabled: true }` on
 * create() and withhold `results` until an assertion. The CALLER decides what
 * to do about it (enrolPasskey retries with a get()), and the caller is also
 * the one that must fail loudly if it is still absent.
 */
export function getPRFOutput(response: PRFResultCarrier | null | undefined): ArrayBuffer | null {
  if (!response) return null

  let ext: AuthenticationExtensionsClientOutputs | undefined
  try {
    ext = response.clientExtensionResults ?? response.getClientExtensionResults?.()
  } catch {
    // A hostile or half-implemented carrier must not take the enrolment down
    // with it; it is simply "no PRF here".
    return null
  }

  const first = ext?.prf?.results?.first
  if (!first) return null

  // BufferSource: an ArrayBuffer already, or a view over a larger buffer. Slice
  // a view to its OWN bytes — returning `view.buffer` hands back everything
  // behind it, which for a 32-byte view into a 64-byte buffer is a silently
  // wrong 64-byte "PRF output" that wraps a key nothing can open.
  if (first instanceof ArrayBuffer) return first
  if (ArrayBuffer.isView(first)) {
    return first.buffer.slice(first.byteOffset, first.byteOffset + first.byteLength) as ArrayBuffer
  }
  return null
}
