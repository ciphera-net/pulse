import { Tessera } from '@ciphera-net/tessera'
import { ensureTessera } from './init'
import { makeOpaqueTransport } from './transport'
import { decryptVaultH } from '@/lib/crypto/vault-ops'
import type { VaultData } from '@/lib/crypto/vault'
import type { VaultKeyHandle } from '@/lib/auth/vault-key'
import { authFetch } from '@/lib/api/client'
import { computeBlindIndex } from '@ciphera-net/auth/blind-index'

interface VaultResponse {
  encrypted_vault?: string
  opaque_wrapped_key?: string
}

/**
 * Read-unlock: decrypt the caller's OWN vault PII (name, email) in Pulse's
 * origin, without a login and without ever moving a key across an origin.
 *
 * Why this exists (plan 02-09-2026 §2.1): the VMK is a non-extractable
 * CryptoKey derived from the OPAQUE export_key. It cannot cross from
 * id.ciphera.net to pulse.ciphera.net, so after login-at-ID a Pulse settings
 * page cannot read the user's encrypted name/email. The answer is NOT to
 * persist the key (a custody regression) but to re-derive it here, on demand,
 * from a password the user re-enters.
 *
 * The mechanism reuses the DEDICATED re-auth endpoint, which issues no cookies
 * and performs no session swap — so unlocking to display a name is never a
 * token-family event (that is the class that produced the account-wide
 * revocations of 20-08 / 25-08; building this on performOpaqueLogin was
 * explicitly rejected):
 *
 *   1. GET /user/vault → { encrypted_vault, opaque_wrapped_key }. The wrap is
 *      inert without the export_key, which is why the server ships it (id #60).
 *   2. Run the OPAQUE ceremony against `/auth/reauth`, SEEDING the fetched wrap
 *      into the transport so the SDK unwraps the VMK from it (the reauth finish
 *      body carries no wrap of its own). purpose:'ulk' mints a token that is
 *      spendable NOWHERE (id #61) — we never read it.
 *   3. decrypt encrypted_vault with the live handle, then drop the handle.
 *
 * The returned handle is deliberately NOT exposed — only the decrypted PII
 * leaves this function, and the caller caches that (never the key) for the tab.
 *
 * Throws on a wrong password (the ceremony 401s) or a vault with no wrap
 * (an account that predates OPAQUE — the caller shows the encrypted state).
 */
export async function unlockVaultPII(opts: { email: string; password: string }): Promise<VaultData> {
  await ensureTessera()
  const email = opts.email.trim()

  const vault = await authFetch<VaultResponse>('/auth/user/vault', { skipAuthRetry: true })
  if (!vault?.encrypted_vault || !vault.opaque_wrapped_key) {
    // No OPAQUE wrap: nothing to unlock (pre-OPAQUE account, or no vault yet).
    // Loud, not silent — the caller renders the honest "encrypted, not unlocked"
    // state rather than a blank name.
    throw new Error('unlock: account has no OPAQUE vault to open')
  }

  const transport = makeOpaqueTransport({
    blindIndex: await computeBlindIndex(email),
    mode: 'login',
    basePath: '/auth/reauth',
    // The reauth finish body has no wrap; feed it the one we fetched so the
    // SDK's login() opens the VMK from it.
    seedWraps: { opaque: vault.opaque_wrapped_key },
    loginExtras: { purpose: 'ulk' },
  })

  const session = await new Tessera(transport).login({
    email,
    password: new TextEncoder().encode(opts.password),
  })

  const handle: VaultKeyHandle = { kind: 'opaque', vault: session.vault }
  try {
    return await decryptVaultH(handle, vault.encrypted_vault)
  } finally {
    // Non-extractable; dropping the reference lets the GC reclaim the key.
    // The decrypted PII the caller keeps is data, not a key.
    void handle
  }
}
