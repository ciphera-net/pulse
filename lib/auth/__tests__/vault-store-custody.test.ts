// The vault key's custody, announced in this tab. The Lock button forgets the stored key without
// touching the auth context's user or vault state, so code holding what the key opened (team names
// keep a private key and teammates' names in memory) listens here to drop it.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VaultKey } from '@ciphera-net/tessera'

const shared = vi.hoisted(() => ({
  saveVaultKey: vi.fn(),
  loadVaultKey: vi.fn(),
  forgetVaultKeys: vi.fn(),
}))
vi.mock('@ciphera-net/auth/vault-store', () => ({ ...shared, MAX_AGE_MS: 1 }))
const logged = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }))
vi.mock('@/lib/utils/logger', () => ({ logger: logged }))

import { forgetVaultKeys, onVaultKeyCustodyChange, saveVaultKey } from '../vault-store'

let key: VaultKey
beforeAll(async () => {
  key = (await crypto.subtle.importKey('raw', new Uint8Array(32), 'HKDF', false, ['deriveKey'])) as VaultKey
})

beforeEach(() => {
  shared.saveVaultKey.mockReset().mockResolvedValue(undefined)
  shared.forgetVaultKeys.mockReset().mockResolvedValue(undefined)
  logged.error.mockReset()
})

describe('vault key custody changes', () => {
  it('announces a save and a forget once each has happened, and stops after unsubscribing', async () => {
    const seen: string[] = []
    let forgottenBeforeAnnounce = false
    shared.forgetVaultKeys.mockImplementation(async () => {
      forgottenBeforeAnnounce = !seen.includes('forgotten')
    })
    const stop = onVaultKeyCustodyChange((change) => seen.push(change))
    await saveVaultKey('u1', key)
    await forgetVaultKeys()
    expect(seen).toEqual(['saved', 'forgotten'])
    expect(forgottenBeforeAnnounce).toBe(true)
    stop()
    await forgetVaultKeys()
    expect(seen).toEqual(['saved', 'forgotten'])
  })

  it('announces nothing when the save refuses the key', async () => {
    shared.saveVaultKey.mockRejectedValue(new Error('vault-store: refusing an extractable key'))
    const seen: string[] = []
    onVaultKeyCustodyChange((change) => seen.push(change))
    await expect(saveVaultKey('u1', key)).rejects.toThrow(/extractable/)
    expect(seen).toEqual([])
  })

  it('keeps going when a listener throws, and reports it', async () => {
    const after = vi.fn()
    onVaultKeyCustodyChange(() => {
      throw new Error('listener broke')
    })
    onVaultKeyCustodyChange(after)
    await expect(forgetVaultKeys()).resolves.toBeUndefined()
    expect(after).toHaveBeenCalledWith('forgotten')
    expect(logged.error).toHaveBeenCalledWith('vault: a custody listener threw', expect.any(Error))
  })
})
