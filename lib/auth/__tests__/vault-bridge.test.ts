import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock is hoisted above every const, so the doubles have to be too.
const { requestVaultKeyFromBridge, saveVaultKey, loadVaultKey } = vi.hoisted(() => ({
  requestVaultKeyFromBridge: vi.fn(),
  saveVaultKey: vi.fn(),
  loadVaultKey: vi.fn(),
}))

vi.mock('@ciphera-net/auth/vault-bridge', () => ({ requestVaultKeyFromBridge }))
vi.mock('@/lib/auth/vault-store', () => ({ saveVaultKey, loadVaultKey }))
vi.mock('@/lib/api/client', () => ({ ID_URL: 'https://id.ciphera.net' }))
vi.mock('@/lib/utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

import { collectVaultKeyFromBridge } from '@/lib/auth/vault-bridge'

/**
 * Pulse's side of the vault-key hand-off.
 *
 * 🔴 THE CONTRACT THAT MATTERS IS "NEVER BREAK THE LOGIN". Every failure here
 * has to end in `false` and a log line, because the fallback is the password
 * prompt this replaced — and this code runs on the sign-in path, in front of a
 * person waiting to land.
 */

const key = { extractable: false, algorithm: { name: 'HKDF' } } as unknown as CryptoKey

beforeEach(() => {
  vi.clearAllMocks()
  loadVaultKey.mockResolvedValue(null)
  saveVaultKey.mockResolvedValue(undefined)
  requestVaultKeyFromBridge.mockResolvedValue(key)
})

describe('collectVaultKeyFromBridge', () => {
  it('asks the bridge on this origin and keeps what it gets', async () => {
    loadVaultKey.mockResolvedValueOnce(null).mockResolvedValueOnce(key)
    await expect(collectVaultKeyFromBridge('n1', 'u1')).resolves.toBe(true)
    expect(requestVaultKeyFromBridge).toHaveBeenCalledWith(
      expect.objectContaining({ bridgeUrl: 'https://id.ciphera.net/vault-bridge', nonce: 'n1' }),
    )
    expect(saveVaultKey).toHaveBeenCalledWith('u1', key)
  })

  // 🔑 The budget is SHORTER than the package default (8s) because this is on
  // the login path. Pinned so nobody "fixes" a flaky bridge by widening it.
  it('bounds the wait well under the package default', async () => {
    loadVaultKey.mockResolvedValueOnce(null).mockResolvedValueOnce(key)
    await collectVaultKeyFromBridge('n1', 'u1')
    const opts = requestVaultKeyFromBridge.mock.calls[0][0] as { timeoutMs: number }
    expect(opts.timeoutMs).toBeLessThanOrEqual(3000)
  })

  it('does not spend a nonce when this browser already holds a key', async () => {
    loadVaultKey.mockResolvedValue(key)
    await expect(collectVaultKeyFromBridge('n1', 'u1')).resolves.toBe(true)
    expect(requestVaultKeyFromBridge).not.toHaveBeenCalled()
  })

  // 🔴 THE WRITE IS BEST-EFFORT — a private window, blocked site data, quota.
  // "It did not throw" is not evidence anything was stored, so the answer comes
  // from reading it back.
  it('reports false when the key was not actually stored', async () => {
    loadVaultKey.mockResolvedValue(null)
    await expect(collectVaultKeyFromBridge('n1', 'u1')).resolves.toBe(false)
    expect(saveVaultKey).toHaveBeenCalled()
  })

  it('returns false, never throws, when the bridge declines', async () => {
    requestVaultKeyFromBridge.mockResolvedValue(null)
    await expect(collectVaultKeyFromBridge('n1', 'u1')).resolves.toBe(false)
    expect(saveVaultKey).not.toHaveBeenCalled()
  })

  it('returns false, never throws, when the bridge itself throws', async () => {
    requestVaultKeyFromBridge.mockRejectedValue(new Error('boom'))
    await expect(collectVaultKeyFromBridge('n1', 'u1')).resolves.toBe(false)
  })

  // 🔴 saveVaultKey THROWS on an extractable key. It cannot happen with an HKDF
  // key, which is exactly why a throw here means the shape changed underneath
  // us — swallow it as a failure, never as a success.
  it('refuses a key the store rejects', async () => {
    saveVaultKey.mockRejectedValue(new Error('refusing to persist an EXTRACTABLE vault key'))
    await expect(collectVaultKeyFromBridge('n1', 'u1')).resolves.toBe(false)
  })

  it('never asks without a nonce or without an account', async () => {
    await expect(collectVaultKeyFromBridge('', 'u1')).resolves.toBe(false)
    await expect(collectVaultKeyFromBridge('n1', '')).resolves.toBe(false)
    expect(requestVaultKeyFromBridge).not.toHaveBeenCalled()
  })

  it('does not ask when the browser cannot even read its own store', async () => {
    // A browser that cannot read the store cannot keep what we fetch either, so
    // asking would burn a nonce for nothing.
    loadVaultKey.mockRejectedValue(new Error('blocked'))
    await expect(collectVaultKeyFromBridge('n1', 'u1')).resolves.toBe(false)
    expect(requestVaultKeyFromBridge).not.toHaveBeenCalled()
  })
})
