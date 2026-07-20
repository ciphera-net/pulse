/**
 * Client-side blind index computation using PBKDF2-SHA256.
 *
 * Computes a truncated PBKDF2 hash of the user's email so the server
 * can look up accounts without storing plaintext email.
 * Web Crypto native — no WASM required.
 *
 * Ported VERBATIM from id-frontend (lib/crypto/blind-index.ts). The constants
 * below are the account-lookup key on the OPAQUE wire; the server re-peppers the
 * result (auth.ApplyBlindIndexPepper). Any drift in salt / iterations / output
 * length produces a different lookup key and the account "disappears" from login
 * and email-change — so these MUST stay byte-exact with id-frontend. Guarded by a
 * known-answer test in blind-index.test.ts.
 */

const BLIND_INDEX_SALT = 'ciphera-blind-index-v2'
const PBKDF2_ITERATIONS = 1_000_000
const HASH_LEN = 16

/**
 * Compute a blind index for the given email address using PBKDF2-SHA256.
 * Works on all browsers (Web Crypto native, no WASM).
 */
export async function computeBlindIndex(email: string): Promise<string> {
  const normalised = email.toLowerCase().trim()
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(normalised),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const hashBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: encoder.encode(BLIND_INDEX_SALT),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    HASH_LEN * 8
  )

  const bytes = new Uint8Array(hashBits)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}
