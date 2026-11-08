/**
 * End-to-end encrypted team names, v1: the construction of
 * Pulse/docs/plans/07-11-2026-team-names-e2e-design.md §4.2, exactly.
 *
 *   identity  one P-256 pair per person, from generateKey, never assembled from parts.
 *             key_id = SHA-256(pub), always recomputed here from the served bytes.
 *   envelope  a Tessera v1 envelope under the vault key, context `pulse/team-names/v1/identity`,
 *             over 0x01 || d (32) || pub (65) || tag_secret (32): 130 bytes in, 219 out.
 *   name      I2OSP(len, 2) || utf8(name) || zeros, exactly 512 bytes; at most 400 bytes of name.
 *   seal      HPKE mode_auth, DHKEM(P-256, HKDF-SHA256), HKDF-SHA256, AES-256-GCM, with
 *             info = "pulse/team-names/v1" || 0x00 || team || sender || recipient (UUIDs, 16 raw bytes
 *             each) and aad = 0x01; wire = 0x01 || enc (65) || ct (528) = 594 bytes, always.
 *   tag       HMAC-SHA256(tag_secret, "pulse/team-names/v1/name-tag" || 0x00 || utf8(name) ||
 *             team_id || recipient_key_id || SHA-256(sealed))[0:16]: bound to the team and to the whole
 *             row as stored, so a stale name, a row this person's browsers did not write, a genuine
 *             row's metadata over another ciphertext, or a genuine row copied into another team never
 *             matches (review L1, M1).
 *
 * The opener refuses an unknown version byte before deriving anything and takes the aad from the
 * version it expects, never from the wire. Known-answer vectors: lib/crypto/__tests__/vectors/.
 */

import type { VaultOps } from '@ciphera-net/tessera'
import {
  SUITE_P256_SHA256_AES256GCM,
  asBytes,
  concatBytes,
  importPrivateKey,
  open,
  seal,
  sealWithEphemeralKeyForTesting,
  wipe,
  type Bytes,
  type KeyPair,
  type SealParams,
  type SealTrace,
} from './hpke'
import { TeamNamesError } from '@/lib/team-names/errors'

export const TEAM_NAMES_SUITE = SUITE_P256_SHA256_AES256GCM
export const WIRE_VERSION = 0x01
export const INFO_LABEL = 'pulse/team-names/v1'
export const TAG_LABEL = 'pulse/team-names/v1/name-tag'
export const IDENTITY_CONTEXT = 'pulse/team-names/v1/identity'
export const PADDED_SIZE = 512
export const MAX_NAME_BYTES = 400
export const PUBLIC_KEY_SIZE = 65
export const KEY_ID_SIZE = 32
/** SHA-256 of a whole sealed row: what the directory serves for each row of mine, and what the tag binds. */
export const SEALED_HASH_SIZE = 32
export const NAME_TAG_SIZE = 16
export const SEALED_SIZE = 1 + PUBLIC_KEY_SIZE + PADDED_SIZE + 16 // 594
export const IDENTITY_PLAINTEXT_SIZE = 1 + 32 + PUBLIC_KEY_SIZE + 32 // 130
export const IDENTITY_ENVELOPE_SIZE = IDENTITY_PLAINTEXT_SIZE + 89 // 219

const IDENTITY_VERSION = 0x01
/** Taken from the version this code expects, never from the wire. */
const AAD_V1: Bytes = new Uint8Array([WIRE_VERSION])

const subtle = (): SubtleCrypto => globalThis.crypto.subtle

function utf8(s: string): Bytes {
  return new Uint8Array(new TextEncoder().encode(s))
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// ---------------------------------------------------------------------------------------------
// Ids and info
// ---------------------------------------------------------------------------------------------

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function isUuid(id: string): boolean {
  return UUID.test(id)
}

/** A canonical UUID as its 16 raw bytes. */
export function uuidBytes(id: string): Bytes {
  if (!UUID.test(id)) throw new TeamNamesError('team_names/invalid_id')
  const hex = id.replace(/-/g, '')
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** info = "pulse/team-names/v1" || 0x00 || team || sender || recipient: 68 bytes. */
export function nameInfo(teamId: string, senderId: string, recipientId: string): Bytes {
  return concatBytes(utf8(INFO_LABEL), new Uint8Array([0x00]), uuidBytes(teamId), uuidBytes(senderId), uuidBytes(recipientId))
}

// ---------------------------------------------------------------------------------------------
// The name: cleaning, padding
// ---------------------------------------------------------------------------------------------

/**
 * Characters a name may not carry: controls and format characters (Cc, Cf: U+200B to U+200F,
 * U+202A to U+202E, U+2066 to U+2069, the zero-width joiners), so a name cannot reorder or hide text
 * in a row (review M3); plus the line and paragraph separators and every default-ignorable code
 * point (Hangul fillers, variation selectors, the grapheme joiner), which render as nothing.
 */
const STRIPPED = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/gu

/** The opener's cleaning: strip, NFC, trim. Null when nothing is left. */
export function cleanName(raw: string): string | null {
  const cleaned = raw.replace(STRIPPED, '').normalize('NFC').trim()
  return cleaned === '' ? null : cleaned
}

export type ShareableName = { kind: 'name'; name: string } | { kind: 'none' } | { kind: 'too_long' }

/**
 * What this person's browser shares of the display name in their vault: the cleaned name, nothing
 * (none set, or nothing left after cleaning), or nothing because it is over 400 bytes of UTF-8 (a
 * name set through another client can be; Account says so).
 */
export function shareableName(displayName: string | null | undefined): ShareableName {
  const cleaned = displayName ? cleanName(displayName) : null
  if (cleaned === null) return { kind: 'none' }
  if (utf8(cleaned).length > MAX_NAME_BYTES) return { kind: 'too_long' }
  return { kind: 'name', name: cleaned }
}

/**
 * The key two names are compared under to flag duplicates (design §7): equal after the cleaning and
 * case folding. NFKC and upper-then-lower fold more than the minimum (fullwidth letters, ligatures,
 * ß against SS), which only ever shows the id beside more names.
 */
export function nameFoldKey(name: string): string {
  return name.normalize('NFKC').toUpperCase().toLowerCase().normalize('NFKC').replace(/\s+/gu, ' ').trim()
}

/** pt = I2OSP(len, 2) || utf8(name) || 0x00 ... to exactly 512 bytes. Seals the name as given. */
export function padName(name: string): Bytes {
  const bytes = utf8(name)
  if (bytes.length === 0 || bytes.length > MAX_NAME_BYTES) throw new TeamNamesError('team_names/name_unsealable')
  const pt = new Uint8Array(PADDED_SIZE)
  pt[0] = bytes.length >> 8
  pt[1] = bytes.length & 0xff
  pt.set(bytes, 2)
  wipe(bytes)
  return pt
}

const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** The structural decode: the length field in bounds, zero padding, valid UTF-8. Null when not. */
export function unpadName(pt: Uint8Array): string | null {
  if (pt.length !== PADDED_SIZE) return null
  const n = (pt[0] << 8) | pt[1]
  if (n === 0 || n > MAX_NAME_BYTES) return null
  for (let i = 2 + n; i < PADDED_SIZE; i++) if (pt[i] !== 0) return null
  try {
    return STRICT_UTF8.decode(pt.subarray(2, 2 + n))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------------------------
// Keys and the tag
// ---------------------------------------------------------------------------------------------

/** key_id = SHA-256(pub), recomputed from the bytes in hand, never taken from a server field. */
export async function keyIdOf(publicKey: Uint8Array): Promise<Bytes> {
  return new Uint8Array(await subtle().digest('SHA-256', asBytes(publicKey)))
}

export async function importTagKey(tagSecret: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey('raw', asBytes(tagSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

/**
 * The tag over the name, the team, the recipient key id and the SHA-256 of the whole row. The three
 * fixed-length fields come last, so the encoding is unambiguous: the team id becomes exactly 16 bytes or
 * throws `team_names/invalid_id`, and a key id or sealed hash of any length but 32 is `team_names/malformed`.
 */
export async function nameTag(
  tagKey: CryptoKey,
  name: string,
  teamId: string,
  recipientKeyId: Uint8Array,
  sealedHash: Uint8Array,
): Promise<Bytes> {
  const team = uuidBytes(teamId)
  if (recipientKeyId.length !== KEY_ID_SIZE || sealedHash.length !== SEALED_HASH_SIZE) throw new TeamNamesError('team_names/malformed')
  const message = concatBytes(utf8(TAG_LABEL), new Uint8Array([0x00]), utf8(name), team, recipientKeyId, sealedHash)
  const mac = new Uint8Array(await subtle().sign('HMAC', tagKey, message))
  return mac.slice(0, NAME_TAG_SIZE)
}

/** A person's key for this session: the private half non-extractable, the tag secret as an HMAC key. */
export interface TeamIdentity {
  privateKey: CryptoKey
  publicKey: Bytes
  keyId: Bytes
  tagKey: CryptoKey
}

// ---------------------------------------------------------------------------------------------
// Sealing and opening a name
// ---------------------------------------------------------------------------------------------

export interface SealNameParams {
  teamId: string
  senderId: string
  recipientId: string
  /** Already cleaned and checked (shareableName); sealed as given. */
  name: string
  sender: TeamIdentity
  recipientPublicKey: Uint8Array
  recipientKeyId: Uint8Array
}

export interface SealedName {
  sealed: Bytes
  enc: Bytes
  nameTag: Bytes
}

function sealParams(p: SealNameParams, pt: Bytes): SealParams {
  return {
    suite: TEAM_NAMES_SUITE,
    recipientPublicKey: p.recipientPublicKey,
    sender: { privateKey: p.sender.privateKey, publicKey: p.sender.publicKey },
    info: nameInfo(p.teamId, p.senderId, p.recipientId),
    aad: AAD_V1,
    plaintext: pt,
  }
}

async function finishSeal(p: SealNameParams, enc: Bytes, ciphertext: Bytes): Promise<SealedName> {
  const sealed = concatBytes(new Uint8Array([WIRE_VERSION]), enc, ciphertext)
  if (sealed.length !== SEALED_SIZE) throw new TeamNamesError('team_names/malformed')
  // The tag binds the row as the server will store it, so it comes after the seal, over the row's hash.
  const sealedHash = new Uint8Array(await subtle().digest('SHA-256', sealed))
  return { sealed, enc, nameTag: await nameTag(p.sender.tagKey, p.name, p.teamId, p.recipientKeyId, sealedHash) }
}

export async function sealName(p: SealNameParams): Promise<SealedName> {
  const pt = padName(p.name)
  try {
    const { enc, ciphertext } = await seal(sealParams(p, pt))
    return await finishSeal(p, enc, ciphertext)
  } finally {
    wipe(pt)
  }
}

/** 🔴 TEST SEAM for the vectors, as hpke's: only test files import it. */
export async function sealNameWithEphemeralKeyForTesting(
  p: SealNameParams,
  ephemeral: KeyPair,
): Promise<SealedName & { trace: SealTrace }> {
  const pt = padName(p.name)
  const trace = await sealWithEphemeralKeyForTesting(sealParams(p, pt), ephemeral)
  return { ...(await finishSeal(p, trace.sealed.enc, trace.sealed.ciphertext)), trace }
}

export interface OpenNameParams {
  teamId: string
  senderId: string
  recipientId: string
  sealed: Uint8Array
  recipient: TeamIdentity
  senderPublicKey: Uint8Array
}

/**
 * Opens a row sealed for this person. Throws a coded error when it cannot (unknown version, wrong
 * size, wrong keys or bindings); returns null when it opens but carries no usable name (the length
 * field, the padding or the UTF-8 is wrong, or nothing is left after cleaning).
 */
export async function openName(p: OpenNameParams): Promise<string | null> {
  if (p.sealed.length < 1 || p.sealed[0] !== WIRE_VERSION) {
    throw new TeamNamesError('team_names/unsupported_version', { userId: p.senderId })
  }
  if (p.sealed.length !== SEALED_SIZE) throw new TeamNamesError('team_names/malformed', { userId: p.senderId })
  const info = nameInfo(p.teamId, p.senderId, p.recipientId)
  let pt: Bytes
  try {
    pt = await open({
      suite: TEAM_NAMES_SUITE,
      enc: p.sealed.subarray(1, 1 + PUBLIC_KEY_SIZE),
      recipient: { privateKey: p.recipient.privateKey, publicKey: p.recipient.publicKey },
      senderPublicKey: p.senderPublicKey,
      info,
      aad: AAD_V1,
      ciphertext: p.sealed.subarray(1 + PUBLIC_KEY_SIZE),
    })
  } catch (cause) {
    throw new TeamNamesError('team_names/open_failed', { userId: p.senderId, cause })
  }
  try {
    const raw = unpadName(pt)
    return raw === null ? null : cleanName(raw)
  } finally {
    wipe(pt)
  }
}

// ---------------------------------------------------------------------------------------------
// The identity envelope
// ---------------------------------------------------------------------------------------------

export function identityPlaintext(d: Uint8Array, publicKey: Uint8Array, tagSecret: Uint8Array): Bytes {
  if (d.length !== 32 || publicKey.length !== PUBLIC_KEY_SIZE || tagSecret.length !== 32) {
    throw new TeamNamesError('team_names/malformed')
  }
  return concatBytes(new Uint8Array([IDENTITY_VERSION]), d, publicKey, tagSecret)
}

function base64urlDecode(s: string): Bytes {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/** Builds the session identity from an envelope's plaintext, then zeroes the plaintext. */
async function identityFromPlaintext(pt: Uint8Array): Promise<TeamIdentity> {
  try {
    if (pt.length !== IDENTITY_PLAINTEXT_SIZE || pt[0] !== IDENTITY_VERSION || pt[33] !== 0x04) {
      throw new TeamNamesError('team_names/malformed')
    }
    const publicKey = new Uint8Array(pt.subarray(33, 33 + PUBLIC_KEY_SIZE))
    const privateKey = await importPrivateKey(TEAM_NAMES_SUITE, pt.subarray(1, 33), publicKey)
    const tagKey = await importTagKey(pt.subarray(33 + PUBLIC_KEY_SIZE))
    return { privateKey, publicKey, keyId: await keyIdOf(publicKey), tagKey }
  } finally {
    wipe(pt)
  }
}

/** Opens a person's identity envelope with their vault key. The private key comes back non-extractable. */
export async function openIdentityEnvelope(vault: VaultOps, envelope: Uint8Array): Promise<TeamIdentity> {
  if (envelope.length !== IDENTITY_ENVELOPE_SIZE || envelope[0] !== 0x01) throw new TeamNamesError('team_names/malformed')
  let pt: Uint8Array
  try {
    pt = await vault.open(IDENTITY_CONTEXT, envelope)
  } catch (cause) {
    throw new TeamNamesError('team_names/identity_unopenable', { cause })
  }
  return identityFromPlaintext(pt)
}

/**
 * Creates a person's key: generateKey (so the halves match by construction), a fresh tag secret, the
 * envelope sealed under the vault key and test-opened, then the private key re-imported
 * non-extractable for the session and every raw copy zeroed (design §4.2, review N2).
 */
export async function createIdentity(vault: VaultOps): Promise<{ identity: TeamIdentity; envelope: Bytes }> {
  const pair = await subtle().generateKey({ name: 'ECDH', namedCurve: TEAM_NAMES_SUITE.curve }, true, ['deriveBits'])
  const publicKey = new Uint8Array(await subtle().exportKey('raw', pair.publicKey))
  const jwk = await subtle().exportKey('jwk', pair.privateKey)
  if (typeof jwk.d !== 'string') throw new TeamNamesError('team_names/malformed')
  const d = base64urlDecode(jwk.d)
  const tagSecret = crypto.getRandomValues(new Uint8Array(32))
  const pt = identityPlaintext(d, publicKey, tagSecret)
  try {
    const envelope = asBytes(await vault.seal(IDENTITY_CONTEXT, pt))
    if (envelope.length !== IDENTITY_ENVELOPE_SIZE) throw new TeamNamesError('team_names/malformed')
    const back = await vault.open(IDENTITY_CONTEXT, envelope)
    const same = bytesEqual(back, pt)
    wipe(back)
    if (!same) throw new TeamNamesError('team_names/identity_unopenable')
    const identity = await identityFromPlaintext(new Uint8Array(pt))
    return { identity, envelope }
  } finally {
    wipe(d, tagSecret, pt)
  }
}
