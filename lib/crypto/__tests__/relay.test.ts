// @vitest-environment node
//
// The relay envelope (lib/crypto/relay.ts). What sealForRelay writes must open with the relay's private key the way
// id-backend opens it: the ephemeral public key (65 bytes), the IV (12), then AES-256-GCM under
// HKDF-SHA256(ECDH, salt empty, info 'ciphera-relay-v2'). And a relay key that is not an uncompressed point on P-256 is
// refused before any ECDH runs (the 07-11-2026 re-review's I2), whatever the engine's own import would do.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sealForRelay } from '../relay'

vi.mock('@/lib/api/client', () => ({ ID_API_URL: 'https://id.example.test' }))

afterEach(() => {
  vi.restoreAllMocks()
})

async function relayKeyPair(): Promise<{ privateKey: CryptoKey; publicKey: Uint8Array }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  return { privateKey: pair.privateKey, publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)) }
}

/** The relay's side, written from the wire format above rather than from sealForRelay. */
async function openAsTheRelay(sealed: Uint8Array, privateKey: CryptoKey): Promise<string> {
  const ephemeral = await crypto.subtle.importKey('raw', sealed.slice(0, 65), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: ephemeral }, privateKey, 256)
  const hkdf = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits'])
  const keyBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('ciphera-relay-v2') },
    hkdf,
    256,
  )
  const key = await crypto.subtle.importKey('raw', keyBits, 'AES-GCM', false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.slice(65, 77) }, key, sealed.slice(77))
  return new TextDecoder().decode(plain)
}

describe('sealForRelay', () => {
  it('writes the ephemeral key, the IV and the ciphertext, and the relay key opens them', async () => {
    const relay = await relayKeyPair()
    const email = 'new@example.test'
    const sealed = await sealForRelay(email, relay.publicKey)
    expect(sealed[0]).toBe(0x04)
    expect(sealed.length).toBe(65 + 12 + email.length + 16)
    await expect(openAsTheRelay(sealed, relay.privateKey)).resolves.toBe(email)
  })

  it('refuses a relay key that is not an uncompressed point on P-256, before any ECDH', async () => {
    const relay = await relayKeyPair()
    const offCurve = relay.publicKey.slice()
    offCurve[64] ^= 0x01 // y no longer matches x
    const compressedLength = relay.publicKey.slice(0, 33)
    const deriveBits = vi.spyOn(crypto.subtle, 'deriveBits')
    for (const bad of [offCurve, compressedLength, new Uint8Array(65)]) {
      await expect(sealForRelay('new@example.test', bad)).rejects.toMatchObject({ code: 'hpke/invalid_public_key' })
    }
    expect(deriveBits).not.toHaveBeenCalled()
  })
})
