// @vitest-environment node
//
// HPKE (RFC 9180) against the RFC's own vectors: A.3.1 and A.3.3 (DHKEM(P-256, HKDF-SHA256),
// HKDF-SHA256, AES-128-GCM, base and auth) check the production KEM and key schedule, and A.6.1 and
// A.6.3 (DHKEM(P-521, HKDF-SHA512), HKDF-SHA512, AES-256-GCM) check AEAD id 0x0002 with Nk 32, the
// two things the production suite changes (review L2). The private scalars come from the vectors.
//
// vectors/rfc9180-subset.json holds the CFRG test-vectors.json entries (commit 5f503c5) for those
// sections; before it was written, every value the RFC text prints for them was compared with it,
// and the base-mode entries with Go 1.25's own copy. The pinned SHA-256 makes a drift fail here and
// on the server, which carries the same file.

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HpkeError,
  SUITE_P256_SHA256_AES128GCM,
  SUITE_P256_SHA256_AES256GCM,
  SUITE_P521_SHA512_AES256GCM,
  importEcdhPublicKey,
  importPrivateKey,
  importPublicKey,
  open,
  seal,
  sealWithEphemeralKeyForTesting,
  type HpkeSuite,
} from '../hpke'

const RFC_FILE = fileURLToPath(new URL('./vectors/rfc9180-subset.json', import.meta.url))
const RFC_SHA256 = 'a4363ed2d3c79025c4f77beb28e8a9aef930cbcde58acf1f89e980601058df03'

interface RfcVector {
  mode: number
  kem_id: number
  kdf_id: number
  aead_id: number
  info: string
  skRm: string
  skEm: string
  skSm?: string
  pkRm: string
  pkEm: string
  pkSm?: string
  enc: string
  shared_secret: string
  key: string
  base_nonce: string
  encryptions: { aad: string; ct: string; nonce: string; pt: string }[]
}

const rfc = JSON.parse(readFileSync(RFC_FILE, 'utf8')) as { vectors: { section: string; vector: RfcVector }[] }

afterEach(() => {
  vi.restoreAllMocks()
})

const hex = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'))
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex')

function suiteFor(v: RfcVector): HpkeSuite {
  for (const s of [SUITE_P256_SHA256_AES128GCM, SUITE_P521_SHA512_AES256GCM]) {
    if (s.kemId === v.kem_id && s.kdfId === v.kdf_id && s.aeadId === v.aead_id) return s
  }
  throw new Error(`no suite for ${v.kem_id}/${v.kdf_id}/${v.aead_id}`)
}

describe('the RFC 9180 vector file', () => {
  it('is the pinned file, with the four sections', () => {
    expect(createHash('sha256').update(readFileSync(RFC_FILE)).digest('hex')).toBe(RFC_SHA256)
    expect(rfc.vectors.map((v) => v.section)).toEqual(['A.3.1', 'A.3.3', 'A.6.1', 'A.6.3'])
  })
})

describe.each(rfc.vectors)('RFC 9180 $section', ({ vector: v }) => {
  const suite = suiteFor(v)
  const auth = v.mode === 2
  const enc0 = v.encryptions[0]

  async function parties() {
    const ephemeral = { privateKey: await importPrivateKey(suite, hex(v.skEm), hex(v.pkEm)), publicKey: hex(v.pkEm) }
    const recipient = { privateKey: await importPrivateKey(suite, hex(v.skRm), hex(v.pkRm)), publicKey: hex(v.pkRm) }
    const sender = auth && v.skSm && v.pkSm
      ? { privateKey: await importPrivateKey(suite, hex(v.skSm), hex(v.pkSm)), publicKey: hex(v.pkSm) }
      : undefined
    return { ephemeral, recipient, sender }
  }

  it('reproduces enc, shared_secret, key, base_nonce and the first ciphertext', async () => {
    const { ephemeral, sender } = await parties()
    const trace = await sealWithEphemeralKeyForTesting(
      { suite, recipientPublicKey: hex(v.pkRm), sender, info: hex(v.info), aad: hex(enc0.aad), plaintext: hex(enc0.pt) },
      ephemeral,
    )
    expect(toHex(trace.sealed.enc)).toBe(v.enc)
    expect(toHex(trace.sharedSecret)).toBe(v.shared_secret)
    expect(toHex(trace.key)).toBe(v.key)
    expect(trace.key.length).toBe(suite.nk)
    expect(toHex(trace.baseNonce)).toBe(v.base_nonce)
    expect(toHex(trace.baseNonce)).toBe(enc0.nonce)
    expect(toHex(trace.sealed.ciphertext)).toBe(enc0.ct)
  })

  it('opens the first ciphertext', async () => {
    const { recipient } = await parties()
    const pt = await open({
      suite,
      enc: hex(v.enc),
      recipient,
      senderPublicKey: auth ? hex(v.pkSm ?? '') : undefined,
      info: hex(v.info),
      aad: hex(enc0.aad),
      ciphertext: hex(enc0.ct),
    })
    expect(toHex(pt)).toBe(enc0.pt)
  })

  it('refuses the same ciphertext under another aad, another info, or one flipped byte', async () => {
    const { recipient } = await parties()
    const base = {
      suite,
      enc: hex(v.enc),
      recipient,
      senderPublicKey: auth ? hex(v.pkSm ?? '') : undefined,
      info: hex(v.info),
      aad: hex(enc0.aad),
      ciphertext: hex(enc0.ct),
    }
    const flipped = hex(enc0.ct)
    flipped[0] ^= 0x01
    const otherInfo = hex(v.info)
    otherInfo[0] ^= 0x01
    for (const attempt of [{ ...base, aad: hex('00') }, { ...base, info: otherInfo }, { ...base, ciphertext: flipped }]) {
      await expect(open(attempt)).rejects.toMatchObject({ code: 'hpke/open_failed' })
    }
  })

  if (auth) {
    it('refuses to open as base mode what was sealed in auth mode', async () => {
      const { recipient } = await parties()
      await expect(
        open({ suite, enc: hex(v.enc), recipient, info: hex(v.info), aad: hex(enc0.aad), ciphertext: hex(enc0.ct) }),
      ).rejects.toMatchObject({ code: 'hpke/open_failed' })
    })
  }
})

describe('seal with a fresh ephemeral key', () => {
  const suite = SUITE_P256_SHA256_AES256GCM

  async function pair() {
    const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
    return { privateKey: kp.privateKey, publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)) }
  }

  it('round-trips in auth mode and never repeats an enc', async () => {
    const r = await pair()
    const s = await pair()
    const params = { suite, recipientPublicKey: r.publicKey, sender: s, info: new Uint8Array([1, 2, 3]), aad: new Uint8Array([1]), plaintext: new Uint8Array(512).fill(7) }
    const a = await seal(params)
    const b = await seal(params)
    expect(toHex(a.enc)).not.toBe(toHex(b.enc))
    expect(a.ciphertext.length).toBe(512 + 16)
    const pt = await open({ suite, enc: a.enc, recipient: r, senderPublicKey: s.publicKey, info: params.info, aad: params.aad, ciphertext: a.ciphertext })
    expect(pt).toEqual(params.plaintext)
    // A different sender key in the opener's hands: the auth binding refuses it.
    const other = await pair()
    await expect(
      open({ suite, enc: a.enc, recipient: r, senderPublicKey: other.publicKey, info: params.info, aad: params.aad, ciphertext: a.ciphertext }),
    ).rejects.toBeInstanceOf(HpkeError)
  })
})

describe('wiping', () => {
  const suite = SUITE_P256_SHA256_AES256GCM

  it('zeroes the KEM’s labelled IKM, which holds the DH output, once seal and open have imported it (review L2)', async () => {
    const pair = async () => {
      const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
      return { privateKey: kp.privateKey, publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)) }
    }
    const [r, s] = [await pair(), await pair()]
    const importKey = vi.spyOn(crypto.subtle, 'importKey')
    const params = { suite, recipientPublicKey: r.publicKey, sender: s, info: new Uint8Array([1]), aad: new Uint8Array([1]), plaintext: new Uint8Array(16) }
    const sealed = await seal(params)
    await open({ suite, enc: sealed.enc, recipient: r, senderPublicKey: s.publicKey, info: params.info, aad: params.aad, ciphertext: sealed.ciphertext })

    // The spy keeps the buffers it was handed. "HPKE-v1" || "KEM" || kem_id || "eae_prk" || DH(E) || DH(S).
    const kemIkmLength = 7 + 5 + 7 + 2 * suite.ndh
    const hkdfKeys = importKey.mock.calls
      .filter(([format, , algorithm]) => format === 'raw' && algorithm === 'HKDF')
      .map(([, keyData]) => keyData)
      .filter((keyData): keyData is Uint8Array<ArrayBuffer> => keyData instanceof Uint8Array)
    const kemIkms = hkdfKeys.filter((b) => b.length === kemIkmLength)
    expect(kemIkms).toHaveLength(2) // one seal, one open
    for (const b of kemIkms) expect(b.every((x) => x === 0)).toBe(true)
    // The key schedule's labelled IKM holds no secret and is left as it was: the spy saw live buffers.
    const schedule = hkdfKeys.filter((b) => b.length !== kemIkmLength)
    expect(schedule.length).toBeGreaterThan(0)
    for (const b of schedule) expect(new TextDecoder().decode(b.subarray(0, 7))).toBe('HPKE-v1')
  })
})

describe('public key validation', () => {
  const suite = SUITE_P256_SHA256_AES256GCM

  it('takes the uncompressed encoding of a point on the curve and nothing else', async () => {
    const v = rfc.vectors[0].vector
    await expect(importPublicKey(suite, hex(v.pkRm))).resolves.toBeDefined()
    const compressed = hex(v.pkRm).slice(0, 33)
    compressed[0] = 0x02
    const infinity = new Uint8Array([0x00])
    const wrongPrefix = hex(v.pkRm)
    wrongPrefix[0] = 0x05
    const offCurve = hex(v.pkRm)
    offCurve[64] ^= 0x01 // y no longer matches x
    for (const bad of [compressed, infinity, wrongPrefix, offCurve, new Uint8Array(65)]) {
      await expect(importPublicKey(suite, bad)).rejects.toMatchObject({ code: 'hpke/invalid_public_key' })
    }
  })

  it('checks the range and the curve equation itself, before WebCrypto sees the key, on both curves', async () => {
    // y0 = sqrt(b) mod p: (0, y0) is on the curve, and (p, y0) satisfies the equation mod p with x out of range.
    const p256 = { suite, p: 'ffffffff00000001000000000000000000000000ffffffffffffffffffffffff', y0: '66485c780e2f83d72433bd5d84a06bb6541c2af31dae871728bf856a174f93f4' }
    const p521 = {
      suite: SUITE_P521_SHA512_AES256GCM,
      p: `01${'ff'.repeat(65)}`,
      y0: '012df13601594a883ef2d935e44bb90bf4d6619b74e52af7552f97769011c0719eb439cfab2a88d40fe59a2bed1f43557169a2d0a2ccd280c607b92bbf51ffe0b078',
    }
    await expect(importPublicKey(p256.suite, hex(`04${'00'.repeat(32)}${p256.y0}`))).resolves.toBeDefined()
    await expect(importPublicKey(p521.suite, hex(`04${'00'.repeat(66)}${p521.y0}`))).resolves.toBeDefined()

    const flipped = (h: string, i: number) => {
      const b = hex(h)
      b[i] ^= 0x01
      return b
    }
    const p256Key = rfc.vectors[0].vector.pkRm // A.3.1
    const p521Key = rfc.vectors[2].vector.pkRm // A.6.1
    const cases: [HpkeSuite, string, Uint8Array][] = [
      [p256.suite, 'P-256, x changed', flipped(p256Key, 1)],
      [p256.suite, 'P-256, y changed', flipped(p256Key, 64)],
      [p256.suite, 'P-256, (0, 0)', hex(`04${'00'.repeat(64)}`)],
      [p256.suite, 'P-256, x = p', hex(`04${p256.p}${p256.y0}`)],
      [p256.suite, 'P-256, both coordinates 2^256 - 1', hex(`04${'ff'.repeat(64)}`)],
      [p521.suite, 'P-521, y changed', flipped(p521Key, 132)],
      [p521.suite, 'P-521, x = p', hex(`04${p521.p}${p521.y0}`)],
    ]
    const importKey = vi.spyOn(crypto.subtle, 'importKey')
    for (const [s, label, bad] of cases) {
      await expect(importPublicKey(s, bad), label).rejects.toMatchObject({ code: 'hpke/invalid_public_key' })
    }
    expect(importKey).not.toHaveBeenCalled()
  })

  it('names the code and nothing else in an error message', async () => {
    const err = await importPublicKey(suite, new Uint8Array(65)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HpkeError)
    expect((err as HpkeError).message).toBe('hpke/invalid_public_key')
  })
})

describe('the same validation outside HPKE and on a private key\'s public half (the 07-11 re-review\'s I2 and I1)', () => {
  const p256Key = () => hex(rfc.vectors[0].vector.pkRm) // A.3.1
  const p521Key = () => hex(rfc.vectors[2].vector.pkRm) // A.6.1

  it('importEcdhPublicKey takes a point on the named curve and refuses the rest before WebCrypto sees it', async () => {
    await expect(importEcdhPublicKey('P-256', p256Key())).resolves.toBeDefined()
    await expect(importEcdhPublicKey('P-521', p521Key())).resolves.toBeDefined()
    const offCurve = p256Key()
    offCurve[64] ^= 0x01 // y no longer matches x
    const compressed = p256Key().slice(0, 33)
    compressed[0] = 0x02
    const wrongPrefix = p256Key()
    wrongPrefix[0] = 0x05
    const xIsP = hex(
      '04ffffffff00000001000000000000000000000000ffffffffffffffffffffffff66485c780e2f83d72433bd5d84a06bb6541c2af31dae871728bf856a174f93f4',
    )
    const cases: [string, HpkeSuite['curve'], Uint8Array][] = [
      ['off the curve', 'P-256', offCurve],
      ['compressed', 'P-256', compressed],
      ['a wrong prefix', 'P-256', wrongPrefix],
      ['65 zero bytes', 'P-256', new Uint8Array(65)],
      ['x = p', 'P-256', xIsP],
      ['a P-521 key named P-256', 'P-256', p521Key()],
      ['a P-256 key named P-521', 'P-521', p256Key()],
    ]
    const importKey = vi.spyOn(crypto.subtle, 'importKey')
    for (const [label, curve, bad] of cases) {
      await expect(importEcdhPublicKey(curve, bad), label).rejects.toMatchObject({ code: 'hpke/invalid_public_key' })
    }
    expect(importKey).not.toHaveBeenCalled()
  })

  it('importPrivateKey refuses a public half off the curve before WebCrypto sees it', async () => {
    const v = rfc.vectors[0].vector
    const suite = SUITE_P256_SHA256_AES128GCM
    await expect(importPrivateKey(suite, hex(v.skRm), hex(v.pkRm))).resolves.toBeDefined()
    const offCurve = hex(v.pkRm)
    offCurve[64] ^= 0x01
    const importKey = vi.spyOn(crypto.subtle, 'importKey')
    await expect(importPrivateKey(suite, hex(v.skRm), offCurve)).rejects.toMatchObject({ code: 'hpke/invalid_private_key' })
    expect(importKey).not.toHaveBeenCalled()
  })
})

describe('the ephemeral-key seam', () => {
  it('is imported by tests only', () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url))
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          if (entry === '__tests__') continue
          walk(full)
        } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
          const rel = relative(root, full)
          // The two definitions; team-names.ts's own seam calls hpke's.
          if (rel === join('lib', 'crypto', 'hpke.ts') || rel === join('lib', 'crypto', 'team-names.ts')) continue
          if (readFileSync(full, 'utf8').includes('WithEphemeralKeyForTesting')) offenders.push(rel)
        }
      }
    }
    for (const top of ['app', 'components', 'lib', 'hooks']) walk(join(root, top))
    expect(offenders).toEqual([])
  })
})
