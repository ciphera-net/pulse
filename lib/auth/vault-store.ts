/**
 * Pulse's binding to the estate's vault-key custody rules.
 *
 * 🔴 THE RULES THEMSELVES ARE NOT HERE ANY MORE. They moved to
 * `@ciphera-net/auth/vault-store` on 10-09-2026, beside the one blind-index
 * implementation, when id-frontend became the second app that needed them.
 * That package's README already argues the case in its own words: the blind
 * index once had five verbatim copies whose drift guards were all vacuous, and
 * one had silently diverged before anyone noticed. Custody rules are the same
 * shape of thing — a second copy of a security property drifts.
 *
 * What survives here is the binding, and only the binding: the shared functions
 * take an `onError` because the package deliberately depends on nothing, and a
 * `VaultKey` type parameter because it does not depend on the Tessera SDK
 * either. Pre-binding both in one place keeps every call site reading the way it
 * did when the implementation lived here.
 *
 * The decision these rules serve: `Infra/Auth/docs/plans/
 * 10-09-2026-vault-key-custody-design.md` (Option 1, owner, 10-09-2026).
 */

import type { VaultKey } from '@ciphera-net/tessera'
import {
  saveVaultKey as sharedSave,
  loadVaultKey as sharedLoad,
  forgetVaultKeys as sharedForget,
} from '@ciphera-net/auth/vault-store'
import { logger } from '@/lib/utils/logger'

export { MAX_AGE_MS, type KeyBackend } from '@ciphera-net/auth/vault-store'

const report = (message: string, cause: unknown) => logger.error(message, cause)

/**
 * Keep the unlocked key for this account.
 *
 * ⚠️ Throws if the key is ever extractable, and reports (rather than throws)
 * when the browser refuses to store — the unlock already succeeded, so a
 * private window costs the user another password next load, not this one.
 * Which means **"it did not throw" is not evidence anything was stored**: read
 * it back before telling somebody anything about this device.
 */
export function saveVaultKey(userId: string, key: VaultKey): Promise<void> {
  return sharedSave<VaultKey>(userId, key, undefined, report)
}

/** The key for THIS account, if one is stored and still young enough. */
export function loadVaultKey(userId: string): Promise<VaultKey | null> {
  return sharedLoad<VaultKey>(userId, undefined, report)
}

/** Forget EVERY stored key — sign-out, and the Lock button. */
export function forgetVaultKeys(): Promise<void> {
  return sharedForget<VaultKey>(undefined, report)
}
