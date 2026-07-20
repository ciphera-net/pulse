import { Tessera } from '@ciphera-net/tessera'
import { ensureTessera } from './init'
import { makeOpaqueTransport, type OpaqueFinishBody } from './transport'
import { decryptVaultH } from '@/lib/crypto/vault-ops'
import type { VaultData } from '@/lib/crypto/vault'
import type { VaultKeyHandle } from '@/lib/auth/vault-key'

export interface OpaqueLoginResult {
  /** The opaque vault handle (non-extractable VMK) to cache for settings re-key. */
  handle: VaultKeyHandle
  /** The decrypted vault PII. */
  vaultData: VaultData
  /** The parsed login/finish body (user_id, totp_enabled, ...). */
  finish: OpaqueFinishBody
}

export interface OpaqueLoginOptions {
  email: string
  password: string
  /** Frontend PBKDF2 blind index (computeBlindIndex) — the server lookup key. */
  blindIndex: string
  /** Extra login/finish fields merged into the body (device signals, totp_code). */
  loginExtras?: Record<string, unknown>
}

/**
 * Drive a full OPAQUE login: SDK handshake → capture the login/finish body (which
 * set the JWT cookies server-side AND returned the vault material) → open the
 * vault. Pure (no React) so the login page and the post-signup auto-login share
 * one implementation. Throws ApiError on a bad password / 401 require_2fa — the
 * caller decides how to surface it.
 *
 * Ported from id-frontend (lib/auth/tessera/opaque-login.ts). Under Pulse's
 * re-auth-in-settings design the returned `handle` is held only for the duration
 * of one settings operation and dropped in a `finally` — never cached app-wide.
 */
export async function performOpaqueLogin(opts: OpaqueLoginOptions): Promise<OpaqueLoginResult> {
  await ensureTessera()
  const transport = makeOpaqueTransport({
    blindIndex: opts.blindIndex,
    mode: 'login',
    loginExtras: opts.loginExtras,
  })
  const session = await new Tessera(transport).login({
    email: opts.email,
    password: new TextEncoder().encode(opts.password),
  })
  const finish = transport.lastFinish()
  if (!finish?.encrypted_vault) {
    throw new Error('Sign-in failed: missing vault data')
  }
  const handle: VaultKeyHandle = { kind: 'opaque', vault: session.vault }
  const vaultData = await decryptVaultH(handle, finish.encrypted_vault)
  return { handle, vaultData, finish }
}
