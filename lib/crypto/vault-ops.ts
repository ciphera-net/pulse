import type { VaultKeyHandle } from '@/lib/auth/vault-key'
import type { VaultData } from './vault'

/**
 * OPAQUE vault crypto helpers.
 *
 * The page flows hold a VaultKeyHandle (the Tessera Session vault, a
 * non-extractable VMK) and call decryptVaultH / encryptVaultH — these seal/open
 * under a fixed context, base64-std on the wire to match the id-backend envelope
 * checks (0x01 version prefix, >= 89-byte vault envelope).
 *
 * The context is fixed to 'vault' for the whole app: seal and open MUST agree on
 * it or the envelope cannot be reopened, so it is a single internal constant
 * rather than a caller-supplied argument (one source of truth, no mismatch risk).
 *
 * Ported VERBATIM from id-frontend (lib/crypto/vault-ops.ts). VAULT_CONTEXT MUST
 * remain 'vault' — a divergent context makes a re-sealed vault unopenable by
 * id-frontend (and by the next Pulse login), a permanent lockout.
 */

const VAULT_CONTEXT = 'vault'

function b64encode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function b64decode(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Decrypt a base64 vault envelope to its plaintext VaultData. */
export async function decryptVaultH(h: VaultKeyHandle, ciphertextB64: string): Promise<VaultData> {
  const plain = await h.vault.open(VAULT_CONTEXT, b64decode(ciphertextB64))
  return JSON.parse(new TextDecoder().decode(plain)) as VaultData
}

/** Encrypt VaultData into a base64 vault envelope. */
export async function encryptVaultH(h: VaultKeyHandle, data: VaultData): Promise<string> {
  const sealed = await h.vault.seal(VAULT_CONTEXT, new TextEncoder().encode(JSON.stringify(data)))
  return b64encode(sealed)
}
