import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VaultKey } from '@ciphera-net/tessera'
import {
  saveVaultKey,
  loadVaultKey,
  forgetVaultKeys,
  MAX_AGE_MS,
  type KeyBackend,
} from '../vault-store'

vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

/**
 * Persisting the vault key is a CUSTODY DECISION (owner, 10-09-2026 — the
 * custody design's Option 1), and these tests are that decision's five rules
 * written down as behaviour. Nothing in the estate persisted this key before.
 *
 * 🔑 They exercise the POLICY, not IndexedDB. jsdom has no IndexedDB, and a
 * faked one would only measure the fake; what has to be right here is whose key
 * it is, how old it may be, and what is refused. That is pure, so the backend
 * is injected.
 */

/** A key object shaped like the real thing, for the properties that matter. */
const keyLike = (extractable = false) =>
  ({ extractable, usages: ['deriveKey'], algorithm: { name: 'HKDF' }, type: 'secret' } as unknown as VaultKey)

function memoryBackend(): KeyBackend & { rows: Map<string, unknown> } {
  const rows = new Map<string, any>()
  return {
    rows,
    async get(userId) { return rows.get(userId) ?? null },
    async put(row) { rows.set(row.userId, row) },
    async clear() { rows.clear() },
  }
}

describe('vault-store', () => {
  let backend: ReturnType<typeof memoryBackend>
  beforeEach(() => { backend = memoryBackend() })

  it('round-trips the key for the account that stored it', async () => {
    const key = keyLike()
    await saveVaultKey('user-1', key, backend)
    expect(await loadVaultKey('user-1', backend)).toBe(key)
  })

  /**
   * 🔴 RULE 4, AND IT IS A THROW. If a future SDK ever hands back an extractable
   * key, storing it would mean persisting EXPORTABLE key material — the one
   * change that turns "an attacker gets use of the key on this device" into
   * "an attacker gets a copy of the key". Silence here would be the worst
   * possible silence.
   */
  it('REFUSES to persist an extractable key, loudly', async () => {
    await expect(saveVaultKey('user-1', keyLike(true), backend)).rejects.toThrow(/EXTRACTABLE/i)
    expect(backend.rows.size).toBe(0)
  })

  it('refuses to store a key with no user id', async () => {
    await expect(saveVaultKey('', keyLike(), backend)).rejects.toThrow(/user id/i)
    expect(backend.rows.size).toBe(0)
  })

  /**
   * 🔴 RULE 2. An account switch must never inherit the previous account's key.
   * Enforced on the way OUT, because reading is the moment somebody would
   * otherwise be handed a key that is not theirs.
   */
  it('never serves one account’s key to another', async () => {
    await saveVaultKey('user-1', keyLike(), backend)
    expect(await loadVaultKey('user-2', backend)).toBeNull()
  })

  it('refuses a row whose stored id disagrees with its own address', async () => {
    // Corruption, not a state: the keyPath says one account, the row says another.
    backend.rows.set('user-1', { userId: 'somebody-else', key: keyLike(), storedAt: Date.now() })
    expect(await loadVaultKey('user-1', backend)).toBeNull()
  })

  /** 🔴 RULE 3. A key that outlives its session is a key nobody chose to keep. */
  it('expires a key older than the refresh token’s lifetime, and deletes it', async () => {
    backend.rows.set('user-1', { userId: 'user-1', key: keyLike(), storedAt: Date.now() - MAX_AGE_MS - 1 })
    expect(await loadVaultKey('user-1', backend)).toBeNull()
    expect(backend.rows.size).toBe(0)
  })

  it('keeps a key that is exactly at the limit', async () => {
    const key = keyLike()
    backend.rows.set('user-1', { userId: 'user-1', key, storedAt: Date.now() - MAX_AGE_MS + 1000 })
    expect(await loadVaultKey('user-1', backend)).toBe(key)
  })

  /**
   * A machine whose clock just synced writes a storedAt in the future. The key
   * still came from this browser, for this account — treating it as expired
   * would re-lock somebody for owning a laptop.
   */
  it('treats a future timestamp as fresh, not as expired', async () => {
    const key = keyLike()
    backend.rows.set('user-1', { userId: 'user-1', key, storedAt: Date.now() + 60_000 })
    expect(await loadVaultKey('user-1', backend)).toBe(key)
  })

  /**
   * 🔴 RULE 1, and deliberately indiscriminate. Sign-out is the moment the
   * device stops being trusted; a row belonging to an account that was signed
   * in earlier is exactly the row nobody would think to clear.
   */
  it('forgets EVERY account’s key, not just the current one', async () => {
    await saveVaultKey('user-1', keyLike(), backend)
    await saveVaultKey('user-2', keyLike(), backend)
    await forgetVaultKeys(backend)
    expect(backend.rows.size).toBe(0)
    expect(await loadVaultKey('user-1', backend)).toBeNull()
  })

  /**
   * Reading degrades to "ask for the password", which is the state this feature
   * replaced — correct here, and only here, because the fallback is honest.
   */
  it('returns null rather than throwing when the store cannot be read', async () => {
    const broken: KeyBackend = {
      get: async () => { throw new Error('blocked') },
      put: async () => {},
      clear: async () => {},
    }
    expect(await loadVaultKey('user-1', broken)).toBeNull()
  })

  /** A failed WRITE must not fail the unlock that already succeeded. */
  it('does not throw when the store cannot be written', async () => {
    const broken: KeyBackend = {
      get: async () => null,
      put: async () => { throw new Error('quota') },
      clear: async () => {},
    }
    await expect(saveVaultKey('user-1', keyLike(), broken)).resolves.toBeUndefined()
  })

  /** Outside a browser (SSR) there is no backend, and that is not an error. */
  it('is inert with no backend at all', async () => {
    await expect(saveVaultKey('user-1', keyLike(), null)).resolves.toBeUndefined()
    expect(await loadVaultKey('user-1', null)).toBeNull()
    await expect(forgetVaultKeys(null)).resolves.toBeUndefined()
  })
})
