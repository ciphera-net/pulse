import type { VaultKey } from '@ciphera-net/tessera'
import { logger } from '@/lib/utils/logger'

/**
 * Where the unlocked vault key lives between page loads.
 *
 * 🔴 THIS IS A DELIBERATE CUSTODY DECISION, TAKEN BY THE OWNER ON 10-09-2026,
 * not an optimisation somebody slipped in. Design + threat model:
 * `Infra/Auth/docs/plans/10-09-2026-vault-key-custody-design.md` (Option 1).
 *
 * Until that decision, NOTHING in the estate persisted the vault key —
 * id-frontend's cache is a React ref, dropped on refresh, and Pulse re-derived
 * the key from a re-entered password every time. Keeping it is a first, and it
 * is the reason this file reads like a contract rather than a cache.
 *
 * WHAT IT DOES NOT CHANGE. Zero-knowledge against the server is untouched: the
 * server never sees the key or the plaintext, and cannot. WHAT IT DOES CHANGE:
 * somebody holding the unlocked device sees the name and address without the
 * password, and a script that gets onto the page can open the vault
 * immediately rather than waiting for an unlock. That trade was put in front of
 * the owner and accepted.
 *
 * 🔑 THERE ARE NO KEY BYTES HERE. A `VaultKey` is a non-extractable `CryptoKey`
 * — and non-extractable is stronger than a flag we set, because WebCrypto
 * refuses to import an HKDF key as extractable at all. IndexedDB stores the key
 * OBJECT (structured clone); an attacker with the file gets nothing without the
 * browser's own key store. `localStorage` cannot hold one at all, which is why
 * rule 5 below is not merely a preference.
 *
 * The five rules the custody design made non-negotiable, and where each lives:
 *   1. cleared on sign-out, in the same call that clears the session  → context.tsx
 *   2. keyed by user id, and never served to a different one          → loadVaultKey
 *   3. a lifetime, no longer than the refresh token's 30 days         → MAX_AGE_MS
 *   4. `extractable === false` asserted on the way IN                 → saveVaultKey
 *   5. IndexedDB only, never localStorage                             → this file
 */

const DB_NAME = 'ciphera-vault'
const DB_VERSION = 1
const STORE = 'keys'

/**
 * Rule 3. The refresh token's own lifetime, and not a day more: a key that
 * outlives the session it came from is a key nobody chose to keep.
 */
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

interface StoredKey {
  userId: string
  key: VaultKey
  storedAt: number
}

/**
 * The persistence primitive, injectable so the RULES above can be tested
 * without a browser.
 *
 * 🔑 That split is the point: jsdom has no IndexedDB, and testing against a
 * faked one would measure the fake. What has to be right here is the policy —
 * whose key it is, how old it may be, and what is refused — and that is pure.
 */
export interface KeyBackend {
  get(userId: string): Promise<StoredKey | null>
  put(row: StoredKey): Promise<void>
  clear(): Promise<void>
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION)
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) {
        open.result.createObjectStore(STORE, { keyPath: 'userId' })
      }
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb()
  try {
    return await fn(db.transaction(STORE, mode).objectStore(STORE))
  } finally {
    db.close()
  }
}

let cached: KeyBackend | null = null

/** The real backend. Absent outside a browser (SSR, a test) — callers degrade. */
export function indexedDbBackend(): KeyBackend | null {
  if (typeof indexedDB === 'undefined') return null
  if (cached) return cached
  cached = {
    get: (userId) => withStore('readonly', (s) => idbRequest<StoredKey | undefined>(s.get(userId))).then((r) => r ?? null),
    put: (row) => withStore('readwrite', (s) => idbRequest(s.put(row))).then(() => undefined),
    clear: () => withStore('readwrite', (s) => idbRequest(s.clear())).then(() => undefined),
  }
  return cached
}

/**
 * Keep the unlocked key for this account.
 *
 * 🔴 RULE 4 IS A THROW, not a log. If a future SDK ever hands back an
 * extractable key, storing it would mean persisting exportable key material —
 * the one thing that turns "an attacker gets USE of the key on this device"
 * into "an attacker gets a COPY of the key". That must fail loudly, at the
 * point of the mistake, rather than quietly succeeding.
 *
 * Everything else here fails soft and says so: the unlock itself already
 * succeeded, and a browser that refuses to persist (private window, blocked
 * site data, quota) costs the user another password next reload — it does not
 * cost them this one.
 */
export async function saveVaultKey(
  userId: string,
  key: VaultKey,
  backend: KeyBackend | null = indexedDbBackend(),
): Promise<void> {
  if (!userId) throw new Error('vault-store: refusing to store a key with no user id')
  if ((key as unknown as CryptoKey).extractable !== false) {
    throw new Error('vault-store: refusing to persist an EXTRACTABLE vault key')
  }
  if (!backend) return
  try {
    await backend.put({ userId, key, storedAt: Date.now() })
  } catch (e) {
    logger.error('vault-store: could not persist the vault key; the next load will ask again', e)
  }
}

/**
 * The key for THIS account, if one is stored and still young enough.
 *
 * 🔴 RULES 2 AND 3 ARE ENFORCED ON THE WAY OUT, not merely on the way in. A row
 * for another user id is never returned — an account switch must not inherit
 * the previous account's key — and an expired row is deleted rather than
 * served. Reading is where both are actually load-bearing, because that is the
 * moment somebody would otherwise be handed a key they should not have.
 *
 * Returns null for every "we cannot", which is correct HERE and only here: the
 * fallback is the password prompt, which is the honest state. It is not a
 * silent failure — it is the feature degrading to what it replaced.
 */
export async function loadVaultKey(
  userId: string,
  backend: KeyBackend | null = indexedDbBackend(),
): Promise<VaultKey | null> {
  if (!userId || !backend) return null
  let row: StoredKey | null = null
  try {
    row = await backend.get(userId)
  } catch (e) {
    logger.error('vault-store: could not read the stored vault key', e)
    return null
  }
  if (!row) return null
  // Rule 2. Belt and braces over the keyPath: a row that names another account
  // is corruption, and serving it would be an account-switch key leak.
  if (row.userId !== userId) return null
  // Rule 3. A future storedAt (a clock that just synced) is treated as fresh —
  // the key still came from this browser, for this account.
  if (Date.now() - row.storedAt > MAX_AGE_MS) {
    await forgetVaultKeys(backend)
    return null
  }
  return row.key
}

/**
 * Rule 1. Forget EVERY stored key, not just this account's.
 *
 * Deliberately indiscriminate: sign-out is the moment the device stops being
 * trusted, and a row belonging to some other account that was signed in earlier
 * is exactly the row nobody would think to clear.
 */
export async function forgetVaultKeys(
  backend: KeyBackend | null = indexedDbBackend(),
): Promise<void> {
  if (!backend) return
  try {
    await backend.clear()
  } catch (e) {
    logger.error('vault-store: could not clear the stored vault keys', e)
  }
}
