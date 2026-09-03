import { describe, it, expect } from 'vitest'
import {
  aaguidFromRegistration,
  profileForAaguid,
  prfUnsupportedMessage,
} from '../authenticators'

/**
 * Build a WebAuthn authenticatorData buffer with a chosen AAGUID.
 *
 * Layout is fixed by the spec: rpIdHash(32) ‖ flags(1) ‖ signCount(4) ‖
 * aaguid(16) ‖ credIdLen(2) ‖ credId ‖ COSE key. The AAGUID therefore begins at
 * byte 37, which is the one number the parser depends on — so it is constructed
 * here rather than hardcoded, and an off-by-one in either place fails.
 */
function authData(aaguidHex: string, { truncate = false } = {}): string {
  const aaguid = aaguidHex.replace(/-/g, '')
  const bytes = new Uint8Array(truncate ? 45 : 64)
  bytes.fill(0xab, 0, 32) // rpIdHash
  bytes[32] = 0x45 // flags
  for (let i = 0; i < 16 && !truncate; i++) {
    bytes[37 + i] = parseInt(aaguid.slice(i * 2, i * 2 + 2), 16)
  }
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const ICLOUD = 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd'
const BITWARDEN = 'd548826e-79b4-db40-a3d8-11116f7e8349'

describe('aaguidFromRegistration', () => {
  it('reads the AAGUID from byte 37 of authenticatorData', () => {
    expect(aaguidFromRegistration(authData(ICLOUD))).toBe(ICLOUD)
    expect(aaguidFromRegistration(authData(BITWARDEN))).toBe(BITWARDEN)
  })

  it('returns null when authenticatorData is absent', () => {
    // Browsers are not obliged to expose getAuthenticatorData(); absence must
    // read as "we do not know", never as an empty AAGUID.
    expect(aaguidFromRegistration(undefined)).toBeNull()
    expect(aaguidFromRegistration('')).toBeNull()
  })

  it('returns null for a buffer too short to contain one', () => {
    // 🔴 Without the length check a short buffer yields all-zero bytes, which
    // would parse as the anonymous AAGUID and read as a deliberate choice by
    // the authenticator rather than as a truncated read.
    expect(aaguidFromRegistration(authData(ICLOUD, { truncate: true }))).toBeNull()
  })

  it('returns null for the anonymous all-zero AAGUID', () => {
    // "I decline to identify my model" is not a model.
    expect(aaguidFromRegistration(authData('00000000-0000-0000-0000-000000000000'))).toBeNull()
  })

  it('returns null rather than throwing on undecodable input', () => {
    expect(aaguidFromRegistration('!!!not base64!!!')).toBeNull()
  })
})

describe('profileForAaguid', () => {
  it('recognises the authenticators whose PRF support we measured', () => {
    expect(profileForAaguid(ICLOUD)).toMatchObject({ name: 'iCloud Keychain', prf: 'yes' })
    expect(profileForAaguid(BITWARDEN)).toMatchObject({ name: 'Bitwarden', prf: 'no' })
  })

  it('is case-insensitive, because the parser and the registry disagree', () => {
    expect(profileForAaguid(ICLOUD.toUpperCase())).toMatchObject({ name: 'iCloud Keychain' })
  })

  it('returns null for an unknown or absent AAGUID', () => {
    expect(profileForAaguid('11111111-2222-3333-4444-555555555555')).toBeNull()
    expect(profileForAaguid(null)).toBeNull()
  })
})

describe('prfUnsupportedMessage', () => {
  /** Whatever else it says, it must always say these two things. */
  const invariants: Array<[string, RegExp]> = [
    ['nothing was saved', /nothing was saved/i],
    ['what to use instead', /Touch ID|Windows Hello|YubiKey/],
  ]

  it('names the provider when we know it', () => {
    const msg = prfUnsupportedMessage(profileForAaguid(BITWARDEN))
    expect(msg).toMatch(/Bitwarden cannot do this yet/)
    // The whole point of R2: not "this device".
    expect(msg).not.toMatch(/this device/i)
  })

  it('stays useful when we do not', () => {
    const msg = prfUnsupportedMessage(null)
    expect(msg).toMatch(/That passkey provider/)
  })

  it('does not blame a capable provider for a one-off failure', () => {
    // iCloud Keychain does support PRF. If it failed this time, telling the user
    // it "cannot do this" would send them to replace a working authenticator.
    const msg = prfUnsupportedMessage(profileForAaguid(ICLOUD))
    expect(msg).toMatch(/iCloud Keychain supports this/)
    expect(msg).not.toMatch(/cannot do this yet/)
  })

  it('always says nothing was saved, and what to do instead', () => {
    for (const profile of [null, profileForAaguid(BITWARDEN), profileForAaguid(ICLOUD)]) {
      const msg = prfUnsupportedMessage(profile)
      for (const [what, pattern] of invariants) {
        expect(pattern.test(msg), `message for ${profile?.name ?? 'unknown'} omits ${what}`).toBe(true)
      }
    }
  })
})
