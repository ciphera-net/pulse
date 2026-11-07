/**
 * HPKE (RFC 9180), single-shot, base and auth modes, over WebCrypto only.
 *
 * Built for end-to-end encrypted team names (Pulse/docs/plans/07-11-2026-team-names-e2e-design.md
 * §4.1, §4.2), which seal with mode_auth and DHKEM(P-256, HKDF-SHA256), HKDF-SHA256, AES-256-GCM.
 * The code is parameterised on the three algorithm ids and their sizes so the RFC's own vectors for
 * two other suites run through the same lines (A.3: AES-128-GCM; A.6: P-521, SHA-512, AES-256-GCM),
 * which checks the production AEAD id and key length against the standard, not against ourselves.
 *
 * The WebCrypto mapping (design §4.2, review N1):
 *   DH(sk, pk)                 ECDH deriveBits of Ndh bytes: the x-coordinate, as RFC 9180 §4.1 defines it.
 *   LabeledExtract("", l, ikm) HMAC under a key of Nh zero bytes. An empty HMAC key is a DataError in
 *                              WebCrypto; RFC 5869 defines an absent salt as Nh zeros and HMAC zero-pads
 *                              a short key, so the two are one key.
 *   Extract then Expand        HKDF deriveBits with the labelled IKM as the base key, the RFC's salt and the
 *                              labelled info. Two calls with one salt and one IKM expand one PRK twice, which
 *                              is how `key` and `base_nonce` are derived.
 *   labeled_info               I2OSP(L, 2) || "HPKE-v1" || suite_id || label || info. The length prefix is
 *                              the easiest thing to drop; the RFC vectors catch it.
 *
 * Single-shot Seal uses sequence 0, so the nonce is `base_nonce` itself; one fresh ephemeral key per
 * seal makes every AEAD key unique and there is no nonce to track. No exporter secret is derived.
 *
 * Errors are coded (`HpkeError`, message = code): callers render nothing from them, and nothing in a
 * message may carry key material or plaintext, because error boundaries post messages to the server.
 */

/** A byte array backed by a plain ArrayBuffer, which is what WebCrypto accepts. */
export type Bytes = Uint8Array<ArrayBuffer>

export interface HpkeSuite {
  readonly kemId: number
  readonly kdfId: number
  readonly aeadId: number
  readonly curve: 'P-256' | 'P-521'
  /** The KEM's own KDF hash, and its output length. */
  readonly kemHash: 'SHA-256' | 'SHA-512'
  readonly kemNh: number
  /** The key schedule's KDF hash, and its output length. */
  readonly kdfHash: 'SHA-256' | 'SHA-512'
  readonly kdfNh: number
  readonly nSecret: number
  readonly nk: number
  readonly nn: number
  readonly ndh: number
  readonly npk: number
  readonly nsk: number
}

const P256 = { curve: 'P-256', kemHash: 'SHA-256', kemNh: 32, nSecret: 32, ndh: 32, npk: 65, nsk: 32 } as const
const P521 = { curve: 'P-521', kemHash: 'SHA-512', kemNh: 64, nSecret: 64, ndh: 66, npk: 133, nsk: 66 } as const

/** RFC 9180 A.3: the test-vector suite for the production KEM and KDF. */
export const SUITE_P256_SHA256_AES128GCM: HpkeSuite = {
  ...P256, kemId: 0x0010, kdfId: 0x0001, aeadId: 0x0001, kdfHash: 'SHA-256', kdfNh: 32, nk: 16, nn: 12,
}

/** The production suite for team names. */
export const SUITE_P256_SHA256_AES256GCM: HpkeSuite = {
  ...P256, kemId: 0x0010, kdfId: 0x0001, aeadId: 0x0002, kdfHash: 'SHA-256', kdfNh: 32, nk: 32, nn: 12,
}

/** RFC 9180 A.6: the published vectors for AEAD id 0x0002 with Nk 32. */
export const SUITE_P521_SHA512_AES256GCM: HpkeSuite = {
  ...P521, kemId: 0x0012, kdfId: 0x0003, aeadId: 0x0002, kdfHash: 'SHA-512', kdfNh: 64, nk: 32, nn: 12,
}

export type HpkeErrorCode =
  | 'hpke/invalid_public_key'
  | 'hpke/invalid_private_key'
  | 'hpke/invalid_input'
  | 'hpke/open_failed'

export class HpkeError extends Error {
  readonly code: HpkeErrorCode

  constructor(code: HpkeErrorCode, options?: { cause?: unknown }) {
    super(code, options)
    this.name = 'HpkeError'
    this.code = code
  }
}

/** A party's private key, with its own serialised public key (a non-extractable key cannot give it back). */
export interface KeyPair {
  privateKey: CryptoKey
  publicKey: Uint8Array
}

const MODE_BASE = 0x00
const MODE_AUTH = 0x02
const EMPTY: Bytes = new Uint8Array(0)
const HPKE_V1 = utf8('HPKE-v1')

const subtle = (): SubtleCrypto => globalThis.crypto.subtle

function utf8(s: string): Bytes {
  return new Uint8Array(new TextEncoder().encode(s))
}

/** A view on the same memory when it is a plain ArrayBuffer (no copy of secrets), else a copy. */
export function asBytes(b: Uint8Array): Bytes {
  if (b.buffer instanceof ArrayBuffer) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
  return new Uint8Array(b)
}

export function concatBytes(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export function i2osp(value: number, length: number): Bytes {
  const out = new Uint8Array(length)
  let v = value
  for (let i = length - 1; i >= 0; i--) {
    out[i] = v & 0xff
    v = Math.floor(v / 256)
  }
  if (v !== 0) throw new HpkeError('hpke/invalid_input')
  return out
}

/** Zeroes buffers that held secrets. JavaScript cannot promise the memory is gone; this is best effort. */
export function wipe(...buffers: Array<Uint8Array | null | undefined>): void {
  for (const b of buffers) b?.fill(0)
}

function kemSuiteId(s: HpkeSuite): Bytes {
  return concatBytes(utf8('KEM'), i2osp(s.kemId, 2))
}

function hpkeSuiteId(s: HpkeSuite): Bytes {
  return concatBytes(utf8('HPKE'), i2osp(s.kemId, 2), i2osp(s.kdfId, 2), i2osp(s.aeadId, 2))
}

function labeledIkm(suiteId: Uint8Array, label: string, ikm: Uint8Array): Bytes {
  return concatBytes(HPKE_V1, suiteId, utf8(label), ikm)
}

function labeledInfo(length: number, suiteId: Uint8Array, label: string, info: Uint8Array): Bytes {
  return concatBytes(i2osp(length, 2), HPKE_V1, suiteId, utf8(label), info)
}

/** LabeledExtract("", label, ikm) used as a value: HMAC under Nh zero bytes. */
async function labeledExtractValue(hash: string, nh: number, suiteId: Uint8Array, label: string, ikm: Uint8Array): Promise<Bytes> {
  const key = await subtle().importKey('raw', new Uint8Array(nh), { name: 'HMAC', hash }, false, ['sign'])
  return new Uint8Array(await subtle().sign('HMAC', key, labeledIkm(suiteId, label, ikm)))
}

/** Expand(Extract(salt, ikm), info, length) through one HKDF deriveBits. */
async function extractAndExpandBits(hash: string, ikm: Bytes, salt: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const base = await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash, salt, info }, base, length * 8))
}

/** Deserialises a public key: uncompressed SEC1 only, and WebCrypto refuses a point off the curve. */
export async function importPublicKey(suite: HpkeSuite, publicKey: Uint8Array): Promise<CryptoKey> {
  if (publicKey.length !== suite.npk || publicKey[0] !== 0x04) throw new HpkeError('hpke/invalid_public_key')
  try {
    return await subtle().importKey('raw', asBytes(publicKey), { name: 'ECDH', namedCurve: suite.curve }, true, [])
  } catch (cause) {
    throw new HpkeError('hpke/invalid_public_key', { cause })
  }
}

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Imports a private key from its scalar and its own public key, non-extractable, usage deriveBits.
 *
 * ⚠️ WebCrypto's JWK import does not check that `d` matches `(x, y)`. Callers only pass a pair that
 * `generateKey` produced (sealed together in the identity envelope) or a pair from a vector.
 */
export async function importPrivateKey(suite: HpkeSuite, d: Uint8Array, publicKey: Uint8Array): Promise<CryptoKey> {
  if (d.length !== suite.nsk || publicKey.length !== suite.npk || publicKey[0] !== 0x04) {
    throw new HpkeError('hpke/invalid_private_key')
  }
  const half = (suite.npk - 1) / 2
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: suite.curve,
    x: base64url(publicKey.subarray(1, 1 + half)),
    y: base64url(publicKey.subarray(1 + half)),
    d: base64url(d),
    ext: false,
  }
  try {
    return await subtle().importKey('jwk', jwk, { name: 'ECDH', namedCurve: suite.curve }, false, ['deriveBits'])
  } catch (cause) {
    throw new HpkeError('hpke/invalid_private_key', { cause })
  }
}

async function dh(suite: HpkeSuite, privateKey: CryptoKey, publicKey: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: publicKey }, privateKey, suite.ndh * 8))
}

async function extractAndExpand(suite: HpkeSuite, dhValue: Bytes, kemContext: Bytes): Promise<Bytes> {
  const id = kemSuiteId(suite)
  // The labelled IKM holds a copy of the DH output: wiped once imported, as the DH buffers are (review L2).
  const ikm = labeledIkm(id, 'eae_prk', dhValue)
  try {
    return await extractAndExpandBits(
      suite.kemHash,
      ikm,
      new Uint8Array(suite.kemNh),
      labeledInfo(suite.nSecret, id, 'shared_secret', kemContext),
      suite.nSecret,
    )
  } finally {
    wipe(ikm)
  }
}

async function keySchedule(suite: HpkeSuite, mode: number, sharedSecret: Bytes, info: Bytes): Promise<{ key: Bytes; baseNonce: Bytes }> {
  const id = hpkeSuiteId(suite)
  const pskIdHash = await labeledExtractValue(suite.kdfHash, suite.kdfNh, id, 'psk_id_hash', EMPTY)
  const infoHash = await labeledExtractValue(suite.kdfHash, suite.kdfNh, id, 'info_hash', info)
  const context = concatBytes(new Uint8Array([mode]), pskIdHash, infoHash)
  // secret = LabeledExtract(shared_secret, "secret", psk) with the default empty psk.
  const secretIkm = labeledIkm(id, 'secret', EMPTY)
  const key = await extractAndExpandBits(suite.kdfHash, secretIkm, sharedSecret, labeledInfo(suite.nk, id, 'key', context), suite.nk)
  const baseNonce = await extractAndExpandBits(suite.kdfHash, secretIkm, sharedSecret, labeledInfo(suite.nn, id, 'base_nonce', context), suite.nn)
  return { key, baseNonce }
}

export interface SealParams {
  suite: HpkeSuite
  recipientPublicKey: Uint8Array
  /** Auth mode when present: the sender's private key and its own serialised public key. */
  sender?: KeyPair
  info: Uint8Array
  aad: Uint8Array
  plaintext: Uint8Array
}

export interface Sealed {
  enc: Bytes
  ciphertext: Bytes
}

/** What a seal derived on the way, for the known-answer tests only. */
export interface SealTrace {
  sealed: Sealed
  sharedSecret: Bytes
  key: Bytes
  baseNonce: Bytes
}

async function sealCore(p: SealParams, ephemeral: KeyPair): Promise<SealTrace> {
  const { suite } = p
  if (ephemeral.publicKey.length !== suite.npk) throw new HpkeError('hpke/invalid_input')
  const pkR = await importPublicKey(suite, p.recipientPublicKey)
  const enc = new Uint8Array(asBytes(ephemeral.publicKey))
  const dhE = await dh(suite, ephemeral.privateKey, pkR)
  let dhAll: Bytes
  let kemContext: Bytes
  if (p.sender) {
    if (p.sender.publicKey.length !== suite.npk) throw new HpkeError('hpke/invalid_input')
    const dhS = await dh(suite, p.sender.privateKey, pkR)
    dhAll = concatBytes(dhE, dhS)
    kemContext = concatBytes(enc, p.recipientPublicKey, p.sender.publicKey)
    wipe(dhS)
  } else {
    dhAll = dhE
    kemContext = concatBytes(enc, p.recipientPublicKey)
  }
  const sharedSecret = await extractAndExpand(suite, dhAll, kemContext)
  wipe(dhE, dhAll)
  const { key, baseNonce } = await keySchedule(suite, p.sender ? MODE_AUTH : MODE_BASE, sharedSecret, asBytes(p.info))
  const aesKey = await subtle().importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await subtle().encrypt({ name: 'AES-GCM', iv: baseNonce, additionalData: asBytes(p.aad), tagLength: 128 }, aesKey, asBytes(p.plaintext)),
  )
  return { sealed: { enc, ciphertext }, sharedSecret, key, baseNonce }
}

/** Seals one message: a fresh ephemeral key, generated here and nowhere else. */
export async function seal(p: SealParams): Promise<Sealed> {
  const pair = await subtle().generateKey({ name: 'ECDH', namedCurve: p.suite.curve }, false, ['deriveBits'])
  // A generated public key is always extractable, whatever the flag says for the private half.
  const publicKey = new Uint8Array(await subtle().exportKey('raw', pair.publicKey))
  const trace = await sealCore(p, { privateKey: pair.privateKey, publicKey })
  wipe(trace.sharedSecret, trace.key)
  return trace.sealed
}

/**
 * 🔴 TEST SEAM. The known-answer vectors fix the ephemeral key; nothing else may. Only test files
 * import this (a test greps the sources to keep it that way), and no input reaches the parameter.
 */
export async function sealWithEphemeralKeyForTesting(p: SealParams, ephemeral: KeyPair): Promise<SealTrace> {
  return sealCore(p, ephemeral)
}

export interface OpenParams {
  suite: HpkeSuite
  enc: Uint8Array
  /** The recipient's private key, with its own serialised public key (it is in the KEM context). */
  recipient: KeyPair
  /** Auth mode when present. */
  senderPublicKey?: Uint8Array
  info: Uint8Array
  aad: Uint8Array
  ciphertext: Uint8Array
}

export async function open(p: OpenParams): Promise<Bytes> {
  const { suite } = p
  if (p.recipient.publicKey.length !== suite.npk) throw new HpkeError('hpke/invalid_input')
  const pkE = await importPublicKey(suite, p.enc)
  const dhE = await dh(suite, p.recipient.privateKey, pkE)
  let dhAll: Bytes
  let kemContext: Bytes
  if (p.senderPublicKey) {
    const pkS = await importPublicKey(suite, p.senderPublicKey)
    const dhS = await dh(suite, p.recipient.privateKey, pkS)
    dhAll = concatBytes(dhE, dhS)
    kemContext = concatBytes(p.enc, p.recipient.publicKey, p.senderPublicKey)
    wipe(dhS)
  } else {
    dhAll = dhE
    kemContext = concatBytes(p.enc, p.recipient.publicKey)
  }
  const sharedSecret = await extractAndExpand(suite, dhAll, kemContext)
  wipe(dhE, dhAll)
  const { key, baseNonce } = await keySchedule(suite, p.senderPublicKey ? MODE_AUTH : MODE_BASE, sharedSecret, asBytes(p.info))
  wipe(sharedSecret)
  try {
    const aesKey = await subtle().importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt'])
    return new Uint8Array(
      await subtle().decrypt({ name: 'AES-GCM', iv: baseNonce, additionalData: asBytes(p.aad), tagLength: 128 }, aesKey, asBytes(p.ciphertext)),
    )
  } catch (cause) {
    throw new HpkeError('hpke/open_failed', { cause })
  } finally {
    wipe(key)
  }
}
