import { vaultOpsFor } from '@ciphera-net/tessera'
import type { VaultKey } from '@ciphera-net/tessera'
import { authFetch } from '@/lib/api/client'
import { loadVaultKey } from '@/lib/auth/vault-store'
import { decryptVaultH, encryptVaultH } from '@/lib/crypto/vault-ops'
import type { VaultData } from '@/lib/crypto/vault'
import type { VaultKeyHandle } from '@/lib/auth/vault-key'

interface VaultResponse {
  encrypted_vault?: string
  opaque_wrapped_key?: string
}

/**
 * Open the vault with a key this browser already holds — no password, no
 * ceremony, no server round trip beyond reading the envelope.
 *
 * 🔑 THIS IS THE HALF THAT MAKES PERSISTENCE WORTH ANYTHING. Storing the key
 * buys nothing on its own; what a person notices is that the second visit does
 * not ask. `vaultOpsFor` (tessera 0.3.0) rebuilds the SAME seal/open pair the
 * ceremony would have produced, so a restored key and a freshly unlocked one
 * are indistinguishable from here down.
 *
 * ⚠️ Throws if the stored key does not open this account's envelope — which is
 * exactly what should happen if the vault was re-sealed elsewhere (an email
 * change confirmed in another browser) or the key belongs to a different
 * account. The caller falls back to the password prompt, which is the honest
 * state and the one this feature replaced.
 */
export async function openVaultWithKey(vaultKey: VaultKey): Promise<VaultData> {
  const vault = await authFetch<VaultResponse>('/auth/user/vault', { skipAuthRetry: true })
  if (!vault?.encrypted_vault) {
    throw new Error('restore: this account has no encrypted vault')
  }
  const handle: VaultKeyHandle = { kind: 'opaque', vault: vaultOpsFor(vaultKey) }
  return decryptVaultH(handle, vault.encrypted_vault)
}

/**
 * Rewrite the display name inside the vault and persist it — the fix for a save
 * that has been answering **400 `{"error":"Missing required field"}`** for as
 * long as anyone has tried it.
 *
 * 🔴 WHY IT WAS BROKEN, AND WHY IT COULD NOT BE FIXED IN THE CLIENT ALONE.
 * `display_name` is not a column: migration 045 dropped it and the name moved
 * INSIDE the encrypted vault. So `PUT /auth/user/display-name` requires an
 * `encrypted_vault` and treats the `display_name` field as wire compatibility
 * it never reads — while Pulse sent `{display_name}` and nothing else. Fixing
 * it needs the client to RE-SEAL the vault, which needs the vault key, which
 * Pulse did not keep. That is why the bug outlived several attempts at it: it
 * was never a client bug, it was the custody question wearing one.
 *
 * ⚠️ IT READS THE VAULT AGAIN RATHER THAN TRUSTING WHAT IS ON SCREEN. The tab
 * may have been open for hours; the address could have been changed and
 * confirmed elsewhere in that time. Re-sealing a stale copy would silently
 * revert somebody's email change to save a display name — so the read, the
 * rewrite and the write happen together, from the server's current envelope.
 */
export async function saveDisplayNameWithKey(vaultKey: VaultKey, displayName: string): Promise<void> {
  const vault = await authFetch<VaultResponse>('/auth/user/vault', { skipAuthRetry: true })
  if (!vault?.encrypted_vault) {
    throw new Error('This account has no encrypted vault, so its name cannot be saved here.')
  }
  const handle: VaultKeyHandle = { kind: 'opaque', vault: vaultOpsFor(vaultKey) }
  const data = await decryptVaultH(handle, vault.encrypted_vault)
  const trimmed = displayName.trim()
  // An empty box writes NO key rather than an empty string — the same rule
  // signup follows, so "never set" and "set to nothing" stay one state.
  if (trimmed) data.display_name = trimmed
  else delete data.display_name
  await authFetch('/auth/user/display-name', {
    method: 'PUT',
    body: JSON.stringify({ encrypted_vault: await encryptVaultH(handle, data) }),
  })
}

/**
 * The ONE way Pulse saves a display name.
 *
 * Both surfaces route here — the Account panel and the Facet-rendered profile
 * form — because the previous arrangement had each calling
 * `PUT /auth/user/display-name` with `{display_name}` directly, and both were
 * wrong in the same way. Two copies of a broken call is how the 400 survived:
 * fixing one would have left the other, and the next reader would have found a
 * working example beside a broken one.
 */
export async function saveDisplayName(userId: string, displayName: string): Promise<void> {
  const key = userId ? await loadVaultKey(userId) : null
  if (!key) {
    throw new Error('Unlock your profile first — saving a name re-seals your encrypted vault.')
  }
  await saveDisplayNameWithKey(key, displayName)
}
