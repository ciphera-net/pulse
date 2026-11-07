/**
 * The browser half of the vector run in Chromium, Firefox and WebKit (vectors.spec.ts, design
 * §8.2, review L1). vectors.spec.ts bundles this file with the production modules it imports,
 * unchanged, loads it into a page and calls `runTeamNamesVectors` with the two vector files.
 *
 * This side only computes: every value goes back as hex, and every failure as its error name and
 * code, one outcome per check, so an engine that refuses one operation fails the checks that use
 * it and no others. The spec compares each value with the files, in Node.
 *
 * It mirrors hpke.test.ts and team-names.test.ts, minus what runs no WebCrypto (the cleaning
 * table, the padding decode, the fold key, the UUID parse, the spies). It imports the
 * ephemeral-key seams, which only files under __tests__ may.
 */

import { vaultOpsFor, type VaultKey } from '@ciphera-net/tessera'
import {
  SUITE_P256_SHA256_AES128GCM,
  SUITE_P256_SHA256_AES256GCM,
  SUITE_P521_SHA512_AES256GCM,
  importPrivateKey,
  importPublicKey,
  open,
  seal,
  sealWithEphemeralKeyForTesting,
  type Bytes,
  type HpkeSuite,
  type OpenParams,
} from '../../hpke'
import {
  IDENTITY_CONTEXT,
  TEAM_NAMES_SUITE,
  createIdentity,
  importTagKey,
  keyIdOf,
  nameInfo,
  nameTag,
  openIdentityEnvelope,
  openName,
  padName,
  sealName,
  sealNameWithEphemeralKeyForTesting,
  type TeamIdentity,
} from '../../team-names'

// ---------------------------------------------------------------------------------------------
// The vector files, as hpke.test.ts and team-names.test.ts read them
// ---------------------------------------------------------------------------------------------

export interface RfcVector {
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

export interface RfcFile {
  vectors: { section: string; vector: RfcVector }[]
}

export interface VIdentity {
  label: string
  user_id: string
  private_key: string
  public_key: string
  key_id: string
  tag_secret: string
  vmk: string
  envelope_context: string
  envelope_plaintext: string
  sealed_private_key: string
}

export interface VSeal {
  description: string
  team_id: string
  sender: string
  recipient: string
  sender_id: string
  recipient_id: string
  name: string
  name_utf8: string
  plaintext: string
  info: string
  aad: string
  ephemeral_private_key: string
  enc: string
  shared_secret: string
  key: string
  base_nonce: string
  sealed: string
  sealed_hash: string
  sender_key_id: string
  recipient_key_id: string
  name_tag: string
}

export interface VOpenNegative {
  description: string
  team_id: string
  sender_id: string
  recipient_id: string
  opener: string
  sender_public_key: string
  sealed: string
  outcome: 'open_fails' | 'refused_version' | 'refused_length' | 'no_name'
}

export interface VTagNegative {
  description: string
  row: number
  tag_secret: string
  name: string
  team_id: string
  recipient_key_id: string
  sealed: string
  sealed_hash: string
}

export interface VEnvelopeNegative {
  description: string
  envelope_of: string
  vmk: string
  context: string
}

export interface TeamNamesFile {
  suite: { kem_id: number; kdf_id: number; aead_id: number }
  info_label: string
  tag_label: string
  identity_context: string
  wire_version: number
  padded_size: number
  max_name_bytes: number
  sealed_size: number
  identities: VIdentity[]
  seals: VSeal[]
  open_negatives: VOpenNegative[]
  tag_negatives: VTagNegative[]
  envelope_negatives: VEnvelopeNegative[]
}

export interface HarnessInput {
  rfc: RfcFile
  teamNames: TeamNamesFile
}

// ---------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------

export interface ErrorReport {
  name: string
  /** The coded error's `code` (HpkeError, TeamNamesError); null for any other error. */
  code: string | null
  message: string
  /** The underlying engine error, when the coded error carries one. */
  cause: string | null
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: ErrorReport }

export interface Labelled<T> {
  label: string
  outcome: Outcome<T>
}

export interface RfcReport {
  section: string
  seal: Outcome<{ enc: string; sharedSecret: string; key: string; keyLength: number; nk: number; baseNonce: string; ct: string }>
  open: Outcome<string>
  /** The first ciphertext under another aad, another info, and with one byte flipped. */
  refusals: Labelled<string>[]
  /** Auth-mode sections only: the ciphertext opened as base mode. */
  baseModeOpen: Outcome<string> | null
}

export interface FreshSealReport {
  encs: [string, string]
  ciphertextLength: number
  plaintext: string
  opened: string
  /** The same ciphertext opened with a third key as the sender's. */
  otherSender: Outcome<string>
}

export interface PublicKeyReport {
  valid: Outcome<string>
  invalid: Labelled<string>[]
}

export interface IdentityReport {
  label: string
  envelopeLength: number
  envelopePlaintext: Outcome<string>
  session: Outcome<{ publicKey: string; keyId: string; keyIdOfPublicKey: string; extractable: boolean; usages: string[] }>
}

export interface EnvelopeNegativeReport {
  description: string
  vaultOpen: Outcome<string>
  /** Only for a negative under the identity context. */
  identityOpen: Outcome<string> | null
}

export interface SealReport {
  description: string
  info: Outcome<string>
  nameUtf8: string
  plaintext: Outcome<string>
  senderKeyId: Outcome<string>
  recipientKeyId: Outcome<string>
  seal: Outcome<{
    sharedSecret: string
    key: string
    baseNonce: string
    enc: string
    sealed: string
    sealedLength: number
    nameTag: string
    /** This engine's SHA-256 of the row it built. */
    sealedHash: string
  }>
  tagFromSecret: Outcome<string>
  open: Outcome<string | null>
}

export interface TagNegativeReport {
  description: string
  tag: Outcome<string>
  /** The negative's ciphertext opened as its row, with the row's ids and keys. */
  openAsRow: Outcome<string | null>
}

export interface CreatedIdentityReport {
  envelopeLength: number
  extractable: boolean
  createdPublicKey: string
  reopenedPublicKey: string
  reopenedKeyId: string
  keyIdOfCreated: string
  opened: string | null
}

export interface HarnessReport {
  rfc: RfcReport[]
  freshSeal: Outcome<FreshSealReport>
  publicKeys: PublicKeyReport
  identities: IdentityReport[]
  dhAgreement: Outcome<{ ab: string; ba: string }>
  envelopeNegatives: EnvelopeNegativeReport[]
  seals: SealReport[]
  openNegatives: Labelled<string | null>[]
  tagNegatives: TagNegativeReport[]
  createdIdentity: Outcome<CreatedIdentityReport>
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function hex(s: string): Bytes {
  if (s.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(s)) throw new Error('vector field is not hex')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16)
  return out
}

function toHex(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0')
  return s
}

function describeError(err: unknown): ErrorReport {
  if (!(err instanceof Error)) return { name: typeof err, code: null, message: String(err), cause: null }
  const code = 'code' in err && typeof err.code === 'string' ? err.code : null
  let cause: string | null = null
  if (err.cause instanceof Error) cause = `${err.cause.name}: ${err.cause.message}`
  else if (err.cause !== undefined) cause = String(err.cause)
  return { name: err.name, code, message: err.message, cause }
}

async function attempt<T>(fn: () => Promise<T> | T): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (err) {
    return { ok: false, error: describeError(err) }
  }
}

async function labelled<T>(label: string, fn: () => Promise<T> | T): Promise<Labelled<T>> {
  return { label, outcome: await attempt(fn) }
}

function suiteFor(v: RfcVector): HpkeSuite {
  for (const s of [SUITE_P256_SHA256_AES128GCM, SUITE_P521_SHA512_AES256GCM]) {
    if (s.kemId === v.kem_id && s.kdfId === v.kdf_id && s.aeadId === v.aead_id) return s
  }
  throw new Error(`no suite for ${v.kem_id}/${v.kdf_id}/${v.aead_id}`)
}

async function vaultKey(vmkHex: string): Promise<VaultKey> {
  return (await crypto.subtle.importKey('raw', hex(vmkHex), 'HKDF', false, ['deriveKey'])) as VaultKey
}

async function freshPair(): Promise<{ privateKey: CryptoKey; publicKey: Bytes }> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  return { privateKey: kp.privateKey, publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)) }
}

// ---------------------------------------------------------------------------------------------
// RFC 9180 (hpke.test.ts)
// ---------------------------------------------------------------------------------------------

async function rfcSection(section: string, v: RfcVector): Promise<RfcReport> {
  const suite = suiteFor(v)
  const auth = v.mode === 2
  const enc0 = v.encryptions[0]
  const party = async (sk: string, pk: string) => ({ privateKey: await importPrivateKey(suite, hex(sk), hex(pk)), publicKey: hex(pk) })
  const openParams = async (): Promise<OpenParams> => ({
    suite,
    enc: hex(v.enc),
    recipient: await party(v.skRm, v.pkRm),
    senderPublicKey: auth ? hex(v.pkSm ?? '') : undefined,
    info: hex(v.info),
    aad: hex(enc0.aad),
    ciphertext: hex(enc0.ct),
  })

  const sealed = await attempt(async () => {
    const ephemeral = await party(v.skEm, v.pkEm)
    const sender = auth && v.skSm && v.pkSm ? await party(v.skSm, v.pkSm) : undefined
    const trace = await sealWithEphemeralKeyForTesting(
      { suite, recipientPublicKey: hex(v.pkRm), sender, info: hex(v.info), aad: hex(enc0.aad), plaintext: hex(enc0.pt) },
      ephemeral,
    )
    return {
      enc: toHex(trace.sealed.enc),
      sharedSecret: toHex(trace.sharedSecret),
      key: toHex(trace.key),
      keyLength: trace.key.length,
      nk: suite.nk,
      baseNonce: toHex(trace.baseNonce),
      ct: toHex(trace.sealed.ciphertext),
    }
  })
  const opened = await attempt(async () => toHex(await open(await openParams())))

  const flipped = hex(enc0.ct)
  flipped[0] ^= 0x01
  const otherInfo = hex(v.info)
  otherInfo[0] ^= 0x01
  const refusals = [
    await labelled('another aad', async () => toHex(await open({ ...(await openParams()), aad: hex('00') }))),
    await labelled('another info', async () => toHex(await open({ ...(await openParams()), info: otherInfo }))),
    await labelled('one flipped byte', async () => toHex(await open({ ...(await openParams()), ciphertext: flipped }))),
  ]
  const baseModeOpen = auth ? await attempt(async () => toHex(await open({ ...(await openParams()), senderPublicKey: undefined }))) : null

  return { section, seal: sealed, open: opened, refusals, baseModeOpen }
}

async function freshSeal(): Promise<FreshSealReport> {
  const suite = SUITE_P256_SHA256_AES256GCM
  const r = await freshPair()
  const s = await freshPair()
  const params = { suite, recipientPublicKey: r.publicKey, sender: s, info: new Uint8Array([1, 2, 3]), aad: new Uint8Array([1]), plaintext: new Uint8Array(512).fill(7) }
  const a = await seal(params)
  const b = await seal(params)
  const openWith = (senderPublicKey: Uint8Array) =>
    open({ suite, enc: a.enc, recipient: r, senderPublicKey, info: params.info, aad: params.aad, ciphertext: a.ciphertext })
  const opened = await openWith(s.publicKey)
  const other = await freshPair()
  return {
    encs: [toHex(a.enc), toHex(b.enc)],
    ciphertextLength: a.ciphertext.length,
    plaintext: toHex(params.plaintext),
    opened: toHex(opened),
    otherSender: await attempt(async () => toHex(await openWith(other.publicKey))),
  }
}

async function publicKeys(v: RfcVector): Promise<PublicKeyReport> {
  const suite = SUITE_P256_SHA256_AES256GCM
  const compressed = hex(v.pkRm).slice(0, 33)
  compressed[0] = 0x02
  const wrongPrefix = hex(v.pkRm)
  wrongPrefix[0] = 0x05
  const offCurve = hex(v.pkRm)
  offCurve[64] ^= 0x01 // y no longer matches x
  const cases: [string, Uint8Array][] = [
    ['compressed', compressed],
    ['the point at infinity', new Uint8Array([0x00])],
    ['a wrong prefix', wrongPrefix],
    ['a point off the curve', offCurve],
    ['65 zero bytes', new Uint8Array(65)],
  ]
  const invalid: Labelled<string>[] = []
  for (const [label, bad] of cases) invalid.push(await labelled(label, async () => (await importPublicKey(suite, bad)).type))
  return { valid: await attempt(async () => (await importPublicKey(suite, hex(v.pkRm))).type), invalid }
}

// ---------------------------------------------------------------------------------------------
// Team names (team-names.test.ts)
// ---------------------------------------------------------------------------------------------

async function teamNames(file: TeamNamesFile) {
  const byLabel = (label: string): VIdentity => {
    const found = file.identities.find((i) => i.label === label)
    if (!found) throw new Error(`no identity ${label}`)
    return found
  }
  const cache = new Map<string, Promise<TeamIdentity>>()
  // Each identity as the session holds it: its envelope opened under its vault key.
  const identity = (label: string): Promise<TeamIdentity> => {
    const cached = cache.get(label)
    if (cached) return cached
    const vi = byLabel(label)
    const made = (async () => openIdentityEnvelope(vaultOpsFor(await vaultKey(vi.vmk)), hex(vi.sealed_private_key)))()
    cache.set(label, made)
    return made
  }

  const identities: IdentityReport[] = []
  for (const vi of file.identities) {
    identities.push({
      label: vi.label,
      envelopeLength: hex(vi.sealed_private_key).length,
      envelopePlaintext: await attempt(async () =>
        toHex(await vaultOpsFor(await vaultKey(vi.vmk)).open(IDENTITY_CONTEXT, hex(vi.sealed_private_key))),
      ),
      session: await attempt(async () => {
        const id = await identity(vi.label)
        return {
          publicKey: toHex(id.publicKey),
          keyId: toHex(id.keyId),
          keyIdOfPublicKey: toHex(await keyIdOf(hex(vi.public_key))),
          extractable: id.privateKey.extractable,
          usages: [...id.privateKey.usages],
        }
      }),
    })
  }

  // A's session key against B's scalar imported from the file: a d that did not match its pub
  // would make the two Diffie-Hellmans disagree.
  const dhAgreement = await attempt(async () => {
    const a = await identity('A')
    const bv = byLabel('B')
    const bPrivate = await importPrivateKey(TEAM_NAMES_SUITE, hex(bv.private_key), hex(bv.public_key))
    const ab = await crypto.subtle.deriveBits({ name: 'ECDH', public: await importPublicKey(TEAM_NAMES_SUITE, hex(bv.public_key)) }, a.privateKey, 256)
    const ba = await crypto.subtle.deriveBits({ name: 'ECDH', public: await importPublicKey(TEAM_NAMES_SUITE, a.publicKey) }, bPrivate, 256)
    return { ab: toHex(new Uint8Array(ab)), ba: toHex(new Uint8Array(ba)) }
  })

  const envelopeNegatives: EnvelopeNegativeReport[] = []
  for (const n of file.envelope_negatives) {
    const envelope = () => hex(byLabel(n.envelope_of).sealed_private_key)
    envelopeNegatives.push({
      description: n.description,
      vaultOpen: await attempt(async () => toHex(await vaultOpsFor(await vaultKey(n.vmk)).open(n.context, envelope()))),
      identityOpen:
        n.context === IDENTITY_CONTEXT
          ? await attempt(async () => toHex((await openIdentityEnvelope(vaultOpsFor(await vaultKey(n.vmk)), envelope())).publicKey))
          : null,
    })
  }

  const seals: SealReport[] = []
  for (const s of file.seals) {
    const sender = byLabel(s.sender)
    const recipient = byLabel(s.recipient)
    seals.push({
      description: s.description,
      info: await attempt(() => toHex(nameInfo(s.team_id, s.sender_id, s.recipient_id))),
      nameUtf8: toHex(new TextEncoder().encode(s.name)),
      plaintext: await attempt(() => toHex(padName(s.name))),
      senderKeyId: await attempt(async () => toHex((await identity(s.sender)).keyId)),
      recipientKeyId: await attempt(async () => toHex(await keyIdOf(hex(recipient.public_key)))),
      seal: await attempt(async () => {
        const ephemeral = {
          privateKey: await importPrivateKey(TEAM_NAMES_SUITE, hex(s.ephemeral_private_key), hex(s.enc)),
          publicKey: hex(s.enc),
        }
        const out = await sealNameWithEphemeralKeyForTesting(
          {
            teamId: s.team_id,
            senderId: s.sender_id,
            recipientId: s.recipient_id,
            name: s.name,
            sender: await identity(s.sender),
            recipientPublicKey: hex(recipient.public_key),
            recipientKeyId: hex(s.recipient_key_id),
          },
          ephemeral,
        )
        return {
          sharedSecret: toHex(out.trace.sharedSecret),
          key: toHex(out.trace.key),
          baseNonce: toHex(out.trace.baseNonce),
          enc: toHex(out.enc),
          sealed: toHex(out.sealed),
          sealedLength: out.sealed.length,
          nameTag: toHex(out.nameTag),
          sealedHash: toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', out.sealed))),
        }
      }),
      tagFromSecret: await attempt(async () =>
        toHex(await nameTag(await importTagKey(hex(sender.tag_secret)), s.name, s.team_id, hex(s.recipient_key_id), hex(s.sealed_hash))),
      ),
      open: await attempt(async () =>
        openName({
          teamId: s.team_id,
          senderId: s.sender_id,
          recipientId: s.recipient_id,
          sealed: hex(s.sealed),
          recipient: await identity(s.recipient),
          senderPublicKey: hex(sender.public_key),
        }),
      ),
    })
  }

  const openNegatives: Labelled<string | null>[] = []
  for (const n of file.open_negatives) {
    openNegatives.push(
      await labelled(n.description, async () =>
        openName({
          teamId: n.team_id,
          senderId: n.sender_id,
          recipientId: n.recipient_id,
          sealed: hex(n.sealed),
          recipient: await identity(n.opener),
          senderPublicKey: hex(n.sender_public_key),
        }),
      ),
    )
  }

  const tagNegatives: TagNegativeReport[] = []
  for (const n of file.tag_negatives) {
    const row = file.seals[n.row]
    tagNegatives.push({
      description: n.description,
      tag: await attempt(async () =>
        toHex(await nameTag(await importTagKey(hex(n.tag_secret)), n.name, n.team_id, hex(n.recipient_key_id), hex(n.sealed_hash))),
      ),
      openAsRow: await attempt(async () =>
        openName({
          teamId: row.team_id,
          senderId: row.sender_id,
          recipientId: row.recipient_id,
          sealed: hex(n.sealed),
          recipient: await identity(row.recipient),
          senderPublicKey: hex(byLabel(row.sender).public_key),
        }),
      ),
    })
  }

  // createIdentity end to end: generateKey, the JWK export of d, the envelope, and a name sealed
  // from one created key to another.
  const createdIdentity = await attempt(async (): Promise<CreatedIdentityReport> => {
    const vmk = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), 'HKDF', false, ['deriveKey'])
    const vault = vaultOpsFor(vmk as VaultKey)
    const { identity: created, envelope } = await createIdentity(vault)
    const reopened = await openIdentityEnvelope(vault, envelope)
    const other = (await createIdentity(vault)).identity
    const team = file.seals[0].team_id
    const [me, them] = [file.identities[0].user_id, file.identities[1].user_id]
    const { sealed } = await sealName({
      teamId: team, senderId: me, recipientId: them, name: 'Ada', sender: created, recipientPublicKey: other.publicKey, recipientKeyId: other.keyId,
    })
    return {
      envelopeLength: envelope.length,
      extractable: created.privateKey.extractable,
      createdPublicKey: toHex(created.publicKey),
      reopenedPublicKey: toHex(reopened.publicKey),
      reopenedKeyId: toHex(reopened.keyId),
      keyIdOfCreated: toHex(await keyIdOf(created.publicKey)),
      opened: await openName({ teamId: team, senderId: me, recipientId: them, sealed, recipient: other, senderPublicKey: reopened.publicKey }),
    }
  })

  return { identities, dhAgreement, envelopeNegatives, seals, openNegatives, tagNegatives, createdIdentity }
}

export async function runTeamNamesVectors(input: HarnessInput): Promise<HarnessReport> {
  const rfc: RfcReport[] = []
  for (const { section, vector } of input.rfc.vectors) rfc.push(await rfcSection(section, vector))
  return {
    rfc,
    freshSeal: await attempt(freshSeal),
    publicKeys: await publicKeys(input.rfc.vectors[0].vector),
    ...(await teamNames(input.teamNames)),
  }
}

Object.defineProperty(globalThis, 'runTeamNamesVectors', { value: runTeamNamesVectors })
