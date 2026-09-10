/**
 * Pulse's binding to the vault-key hand-off.
 *
 * At the end of an OAuth sign-in the identity provider hands Pulse a one-time
 * nonce; this asks id.ciphera.net's hidden `/vault-bridge` for the vault key and
 * keeps it, so the person never meets a second password on a browser where they
 * have already signed in.
 *
 * 🔴 THE PROTOCOL IS NOT HERE. It is `@ciphera-net/auth/vault-bridge`, beside
 * the blind index and the custody rules, because a postMessage contract written
 * in two repos drifts — and the half that drifts is the origin check. What
 * survives here is the binding: Pulse's store, Pulse's logger, Pulse's budget.
 *
 * ⚠️ EVERY FAILURE IS SILENT TO THE USER AND LOUD IN THE LOG, and that is the
 * right shape here and only here: the fallback is the password prompt this
 * replaced. A sign-in must never fail because a convenience did.
 *
 * Design: `Infra/Auth/docs/plans/10-09-2026-vault-key-bridge-design.md`.
 */

import { requestVaultKeyFromBridge } from '@ciphera-net/auth/vault-bridge'
import type { VaultKey } from '@ciphera-net/tessera'
import { ID_URL } from '@/lib/api/client'
import { saveVaultKey, loadVaultKey } from '@/lib/auth/vault-store'
import { logger } from '@/lib/utils/logger'

/**
 * 🔴 SHORTER THAN THE PACKAGE DEFAULT (8s), ON PURPOSE.
 *
 * This runs on the login path, in front of a person waiting to land. The bridge
 * is a same-site iframe on a connection the browser has just used, so the happy
 * path is a few hundred milliseconds; the budget exists for the case where it
 * will never answer at all — blocked framing, an origin removed from the
 * allowlist, the IdP down. Three seconds of a spinner is a bad login. Waiting
 * eight for a convenience is a worse one.
 */
const BUDGET_MS = 3000

/**
 * Collect and keep this account's vault key, if the bridge will give it.
 *
 * Returns true only when a key was actually STORED — read back, not assumed.
 * `saveVaultKey` fails soft by design (a private window, blocked site data,
 * quota), so "it did not throw" is not evidence of anything.
 */
export async function collectVaultKeyFromBridge(nonce: string, userId: string): Promise<boolean> {
  if (!nonce || !userId) return false
  // Already holding one for this account: there is nothing to collect, and
  // asking anyway would spend a nonce and a frame for no reason.
  try {
    if (await loadVaultKey(userId)) return true
  } catch {
    // A browser that cannot read its own store also cannot keep what we fetch.
    return false
  }

  let key: VaultKey | null
  try {
    key = await requestVaultKeyFromBridge<VaultKey>({
      bridgeUrl: `${ID_URL.replace(/\/$/, '')}/vault-bridge`,
      nonce,
      timeoutMs: BUDGET_MS,
      onError: (m, e) => logger.warn(m, e),
    })
  } catch (e) {
    logger.warn('vault-bridge: the hand-off threw', e)
    return false
  }
  if (!key) return false

  try {
    await saveVaultKey(userId, key)
  } catch (e) {
    // The one hard failure: saveVaultKey THROWS on an extractable key, which
    // must never be swallowed — it would mean persisting exportable key
    // material. It cannot happen with an HKDF key, which is why it matters.
    logger.error('vault-bridge: refusing to keep the key the bridge returned', e)
    return false
  }
  // Read it back. The write is best-effort, and a claim about this device that
  // is not read back is a claim about nothing.
  return (await loadVaultKey(userId)) !== null
}
