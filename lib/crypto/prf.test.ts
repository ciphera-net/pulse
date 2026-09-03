import { describe, it, expect } from 'vitest'
import { prfExtension, getPRFOutput } from './prf'

// getPRFOutput must read the PRF result off BOTH shapes the browser stack
// produces: the plain object @simplewebauthn returns (a PROPERTY) and a raw
// PublicKeyCredential (a METHOD). Reading only the method is the bug that kept
// id-frontend's passkey login from ever running past its accessor in
// production; reading only the property would break the raw-credential path.

const thirtyTwo = () => Uint8Array.from({ length: 32 }, (_, i) => i)

describe('prfExtension', () => {
  it('builds the WebAuthn extension input with the salt VERBATIM', () => {
    const salt = thirtyTwo()
    const ext = prfExtension(salt)
    // Byte-identity matters: this salt is stored server-side as prf_salt and
    // replayed at every future unlock. A copy that differs by one byte is a
    // different PRF output and a dead wrap.
    expect(ext.prf.eval.first).toBe(salt)
  })

  it('refuses an empty salt rather than enrolling a fleet-wide constant PRF', () => {
    expect(() => prfExtension(new Uint8Array(0))).toThrow(/salt/)
  })
})

describe('getPRFOutput', () => {
  it('reads the PROPERTY shape @simplewebauthn returns', () => {
    const out = getPRFOutput({
      clientExtensionResults: { prf: { results: { first: thirtyTwo().buffer } } },
    })
    expect(out).not.toBeNull()
    expect(out!.byteLength).toBe(32)
    expect(new Uint8Array(out!)[31]).toBe(31)
  })

  it('reads the METHOD shape a raw PublicKeyCredential exposes', () => {
    const out = getPRFOutput({
      getClientExtensionResults: () => ({ prf: { results: { first: thirtyTwo().buffer } } }),
    })
    expect(out).not.toBeNull()
    expect(out!.byteLength).toBe(32)
  })

  it('prefers the property when BOTH are present and they disagree', () => {
    // Ordering is load-bearing, not cosmetic: the property is the shape the app
    // actually receives, so it must win.
    const out = getPRFOutput({
      clientExtensionResults: { prf: { results: { first: new Uint8Array(32).fill(0xaa).buffer } } },
      getClientExtensionResults: () => ({
        prf: { results: { first: new Uint8Array(32).fill(0xbb).buffer } },
      }),
    })
    expect(new Uint8Array(out!)[0]).toBe(0xaa)
  })

  it('slices a VIEW to its own bytes, never handing back the whole buffer', () => {
    // A 32-byte view into a 64-byte buffer: returning `view.buffer` would give a
    // silently wrong 64-byte "PRF output" that wraps the vault key under
    // something no future unlock can reproduce.
    const backing = new Uint8Array(64).fill(0x11)
    const view = new Uint8Array(backing.buffer, 16, 32)
    const out = getPRFOutput({ clientExtensionResults: { prf: { results: { first: view } } } })
    expect(out!.byteLength).toBe(32)
  })

  it('returns null — never throws — for every no-PRF shape', () => {
    // Absence is a real answer: an authenticator may report prf:{enabled:true}
    // on create() and withhold results until an assertion. The CALLER decides.
    expect(getPRFOutput(null)).toBeNull()
    expect(getPRFOutput(undefined)).toBeNull()
    expect(getPRFOutput({})).toBeNull()
    expect(getPRFOutput({ clientExtensionResults: {} })).toBeNull()
    expect(getPRFOutput({ clientExtensionResults: { prf: { enabled: true } } })).toBeNull()
    expect(getPRFOutput({ clientExtensionResults: { prf: { results: undefined } } })).toBeNull()
    expect(
      getPRFOutput({
        getClientExtensionResults: () => {
          throw new Error('hostile')
        },
      }),
    ).toBeNull()
  })
})

describe('getPRFOutput — non-spec carrier shapes', () => {
  /**
   * 🔑 1Password's browser extension returns `results.first` as a PLAIN ARRAY
   * of byte values rather than an ArrayBuffer — a spec deviation they have
   * acknowledged (FS-5593, reported 30-05-2026). Before this, we returned null
   * and told a 1Password user their device could not do PRF when it can. The
   * reason was ours, not theirs.
   */
  it('accepts a plain Array of bytes (1Password extension shape)', () => {
    const bytes = Array.from({ length: 32 }, (_, i) => (i * 7) & 0xff)
    const out = getPRFOutput({
      clientExtensionResults: { prf: { results: { first: bytes } } },
    } as never)
    expect(out).not.toBeNull()
    expect(Array.from(new Uint8Array(out as ArrayBuffer))).toEqual(bytes)
  })

  /**
   * 🔴 Validated, not merely coerced. `Uint8Array.from` turns undefined, null,
   * NaN and strings into 0 without complaint — so a loose conversion would hand
   * HKDF a key made partly of zeroes. That does not fail loudly: it wraps a
   * vault nothing can ever open.
   */
  it.each([
    ['a hole', [1, undefined, 3]],
    ['a negative', [1, -1, 3]],
    ['a value over 255', [1, 256, 3]],
    ['a float', [1, 2.5, 3]],
    ['a numeric string', [1, '2', 3]],
    ['null', [1, null, 3]],
    ['NaN', [1, NaN, 3]],
    ['an empty array', []],
  ])('rejects an array containing %s rather than coercing it', (_label, bad) => {
    expect(
      getPRFOutput({
        clientExtensionResults: { prf: { results: { first: bad } } },
      } as never),
    ).toBeNull()
  })

  it('still rejects a shape that carries no PRF at all', () => {
    expect(
      getPRFOutput({ clientExtensionResults: { prf: { enabled: true } } } as never),
    ).toBeNull()
    expect(getPRFOutput({ clientExtensionResults: {} } as never)).toBeNull()
  })
})
