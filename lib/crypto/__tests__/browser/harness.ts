/**
 * The browser half of the vector run in Chromium, Firefox and WebKit (vectors.spec.ts, design
 * §8.2, review L1). vectors.spec.ts bundles this file with the production modules it imports,
 * unchanged, loads it into a page and calls `runTeamNamesVectors` with the three vector files.
 *
 * This side only computes: every value goes back as hex, and every failure as its error name and
 * code, one outcome per check, so an engine that refuses one operation fails the checks that use
 * it and no others. The spec compares each value with the files, in Node.
 *
 * It mirrors hpke.test.ts, team-names.test.ts and team-emails.test.ts, minus what runs no WebCrypto
 * (the cleaning table, the padding decode, the fold key, the UUID parse, the spies). The address
 * check is the exception: it runs no WebCrypto, but its Unicode property escapes read each engine's
 * own Unicode tables, so it runs here too. It imports the ephemeral-key seams, which only files
 * under __tests__ may.
 */

import { vaultOpsFor, type VaultKey } from '@ciphera-net/tessera'
import {
  SUITE_P256_SHA256_AES128GCM,
  SUITE_P256_SHA256_AES256GCM,
  SUITE_P521_SHA512_AES256GCM,
  importEcdhPublicKey,
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
  checkEmail,
  createIdentity,
  emailInfo,
  emailTag,
  importTagKey,
  keyIdOf,
  nameInfo,
  nameTag,
  openEmail,
  openIdentityEnvelope,
  openName,
  padName,
  sealEmail,
  sealEmailWithEphemeralKeyForTesting,
  sealName,
  sealNameWithEphemeralKeyForTesting,
  type OpenEmailParams,
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

export interface VEmailSeal {
  description: string
  team_id: string
  sender: string
  recipient: string
  sender_id: string
  recipient_id: string
  email: string
  email_utf8: string
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
  email_tag: string
}

export interface VEmailOpenNegative {
  description: string
  team_id: string
  sender_id: string
  recipient_id: string
  opener: string
  sender_public_key: string
  sealed: string
  outcome: 'open_fails' | 'refused_version' | 'refused_length' | 'no_email'
}

export interface VAddressNegative {
  description: string
  team_id: string
  sender_id: string
  recipient_id: string
  opener: string
  sender_public_key: string
  email: string
  email_utf8: string
  plaintext: string
  sealed: string
  outcome: 'no_email'
}

export interface VCrossKindNegative {
  description: string
  sealed_as: 'email' | 'name'
  open_as: 'email' | 'name'
  team_id: string
  sender_id: string
  recipient_id: string
  opener: string
  sender_public_key: string
  value: string
  sealed: string
  outcome: 'open_fails'
}

export interface VEmailTagNegative {
  description: string
  row: number
  tag_secret: string
  email: string
  team_id: string
  recipient_key_id: string
  sealed: string
  sealed_hash: string
}

export interface TeamEmailsFile {
  suite: { kem_id: number; kdf_id: number; aead_id: number }
  info_label: string
  tag_label: string
  names_info_label: string
  identity_context: string
  wire_version: number
  padded_size: number
  max_email_bytes: number
  sealed_size: number
  identities: VIdentity[]
  seals: VEmailSeal[]
  open_negatives: VEmailOpenNegative[]
  address_negatives: VAddressNegative[]
  cross_kind_negatives: VCrossKindNegative[]
  tag_negatives: VEmailTagNegative[]
  envelope_negatives: VEnvelopeNegative[]
}

export interface HarnessInput {
  rfc: RfcFile
  teamNames: TeamNamesFile
  teamEmails: TeamEmailsFile
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
  valid: Labelled<string>[]
  invalid: Labelled<string>[]
  /** The same points through importEcdhPublicKey, the import of a key outside HPKE (the relay's). */
  ecdhValid: Labelled<string>[]
  ecdhInvalid: Labelled<string>[]
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

export interface EmailSealReport {
  description: string
  info: Outcome<string>
  emailUtf8: string
  /** checkEmail's answer: the address itself, or null. */
  check: Outcome<string | null>
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
    emailTag: string
    /** This engine's SHA-256 of the row it built. */
    sealedHash: string
  }>
  tagFromSecret: Outcome<string>
  open: Outcome<string | null>
}

export interface AddressNegativeReport {
  description: string
  /** This engine's UTF-8 of the address. */
  emailUtf8: string
  check: Outcome<string | null>
  /** sealEmail of the address: must refuse. */
  seal: Outcome<string>
  open: Outcome<string | null>
}

export interface CrossKindReport {
  description: string
  /** Opened as the kind it was sealed as. */
  asSealed: Outcome<string | null>
  /** Opened as the other kind. */
  asOpened: Outcome<string | null>
}

export interface FreshEmailReport {
  encs: [string, string]
  sealedLength: number
  opened: string | null
  /** The email row opened as a name. */
  asName: Outcome<string | null>
  /** A name row of the same address, from the same people, opened as a name and as an email. */
  nameRowAsName: string | null
  nameRowAsEmail: Outcome<string | null>
}

export interface TeamEmailsReport {
  identities: IdentityReport[]
  envelopeNegatives: EnvelopeNegativeReport[]
  seals: EmailSealReport[]
  openNegatives: Labelled<string | null>[]
  addressNegatives: AddressNegativeReport[]
  crossKind: CrossKindReport[]
  tagNegatives: TagNegativeReport[]
  /** checkEmail over EMAIL_CHECK_CASES, in this engine: whether each was accepted. */
  checkCases: { accepted: Labelled<boolean>[]; refused: Labelled<boolean>[] }
  fresh: Outcome<FreshEmailReport>
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
  emails: TeamEmailsReport
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

/** y0 = sqrt(b) mod p: (0, y0) is on the curve, and (p, y0) satisfies the equation mod p with x out of range. */
const EDGE = {
  p256: { p: 'ffffffff00000001000000000000000000000000ffffffffffffffffffffffff', y0: '66485c780e2f83d72433bd5d84a06bb6541c2af31dae871728bf856a174f93f4' },
  p521: {
    p: `01${'ff'.repeat(65)}`,
    y0: '012df13601594a883ef2d935e44bb90bf4d6619b74e52af7552f97769011c0719eb439cfab2a88d40fe59a2bed1f43557169a2d0a2ccd280c607b92bbf51ffe0b078',
  },
}

async function publicKeys(p256Vector: RfcVector, p521Vector: RfcVector): Promise<PublicKeyReport> {
  const p256 = SUITE_P256_SHA256_AES256GCM
  const p521 = SUITE_P521_SHA512_AES256GCM
  const flipped = (h: string, i: number) => {
    const b = hex(h)
    b[i] ^= 0x01
    return b
  }
  const compressed = hex(p256Vector.pkRm).slice(0, 33)
  compressed[0] = 0x02
  const wrongPrefix = hex(p256Vector.pkRm)
  wrongPrefix[0] = 0x05
  const valid: [HpkeSuite, string, Uint8Array][] = [
    [p256, 'the vector key', hex(p256Vector.pkRm)],
    [p256, 'the point (0, y0)', hex(`04${'00'.repeat(32)}${EDGE.p256.y0}`)],
    [p521, 'P-521, the point (0, y0)', hex(`04${'00'.repeat(66)}${EDGE.p521.y0}`)],
  ]
  const invalid: [HpkeSuite, string, Uint8Array][] = [
    [p256, 'compressed', compressed],
    [p256, 'the point at infinity', new Uint8Array([0x00])],
    [p256, 'a wrong prefix', wrongPrefix],
    [p256, 'a point off the curve', flipped(p256Vector.pkRm, 64)], // y no longer matches x
    [p256, '65 zero bytes', new Uint8Array(65)],
    [p256, 'x changed', flipped(p256Vector.pkRm, 1)],
    [p256, '(0, 0)', hex(`04${'00'.repeat(64)}`)],
    [p256, 'x = p', hex(`04${EDGE.p256.p}${EDGE.p256.y0}`)],
    [p256, 'both coordinates 2^256 - 1', hex(`04${'ff'.repeat(64)}`)],
    [p521, 'P-521, y changed', flipped(p521Vector.pkRm, 132)],
    [p521, 'P-521, x = p', hex(`04${EDGE.p521.p}${EDGE.p521.y0}`)],
  ]
  const imported = async (cases: [HpkeSuite, string, Uint8Array][]) => {
    const out: Labelled<string>[] = []
    for (const [suite, label, key] of cases) out.push(await labelled(label, async () => (await importPublicKey(suite, key)).type))
    return out
  }
  const importedEcdh = async (cases: [HpkeSuite, string, Uint8Array][]) => {
    const out: Labelled<string>[] = []
    for (const [suite, label, key] of cases) out.push(await labelled(label, async () => (await importEcdhPublicKey(suite.curve, key)).type))
    return out
  }
  return {
    valid: await imported(valid),
    invalid: await imported(invalid),
    ecdhValid: await importedEcdh(valid),
    ecdhInvalid: await importedEcdh(invalid),
  }
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

// ---------------------------------------------------------------------------------------------
// Team emails (team-emails.test.ts)
// ---------------------------------------------------------------------------------------------

/**
 * The address check's cases beyond the vector file, run in each engine because its property escapes
 * (White_Space, Z, Cc, Cf, Cs) read the engine's own Unicode tables. Built here, in the page, so no
 * lone surrogate has to cross the page boundary; only the labels and a boolean go back.
 */
const EMAIL_CHECK_CASES: { accepted: [string, string][]; refused: [string, string][] } = {
  accepted: [
    ['the shortest address', 'a@b'],
    ['upper case', 'Ada.Lovelace@Example.COM'],
    ['a combining acute after e (NFD, kept as it is)', 'zoé@example.com'],
    ['three-byte UTF-8 on both sides', '用户@例子.广告'],
    ['a surrogate pair', 'rocket\u{1F680}@example.com'],
    ['every atext symbol', "!#$%&'*+-/=?^_`{|}~@example.com"],
    ['254 bytes of two-byte UTF-8', `${'é'.repeat(121)}@exämple.se`],
    ['254 bytes of four-byte UTF-8 (128 UTF-16 units)', `${'\u{1F680}'.repeat(63)}@x`],
  ],
  refused: [
    ['255 bytes of two-byte UTF-8', `${'é'.repeat(121)}@exämples.se`],
    ['255 bytes of four-byte UTF-8 (129 UTF-16 units)', `${'\u{1F680}'.repeat(63)}@xy`],
    ['no @', 'ada.example.com'],
    ['two @', 'ada@team@example.com'],
    ['a fullwidth @', 'ada＠example.com'],
    ['a small @', 'ada﹫example.com'],
    ['a tab', 'ada\t@example.com'],
    ['a carriage return', 'ada@example.com\r'],
    ['NUL', 'ada\u0000@example.com'],
    ['DEL', 'ada\u007f@example.com'],
    ['NEL', 'ada\u0085@example.com'],
    ['a C1 control', 'ada\u0090@example.com'],
    ['a no-break space', 'ada @example.com'],
    ['an ogham space', 'ada @example.com'],
    ['a hair space', 'ada @example.com'],
    ['a narrow no-break space', 'ada @example.com'],
    ['an ideographic space', 'ada　@example.com'],
    ['a line separator', 'ada @example.com'],
    ['a paragraph separator', 'ada @example.com'],
    ['a soft hyphen', 'ada­@example.com'],
    ['an Arabic letter mark', 'ada؜@example.com'],
    ['a Mongolian vowel separator', 'ada᠎@example.com'],
    ['a zero-width space', 'ada​@example.com'],
    ['a zero-width joiner', 'ada‍@example.com'],
    ['a right-to-left mark', 'ada‏@example.com'],
    ['a right-to-left override', 'ada@‮moc.elpmaxe'],
    ['a first-strong isolate', 'ada⁨@example.com'],
    ['a word joiner', 'ada⁠@example.com'],
    ['a byte order mark', '﻿ada@example.com'],
    ['an interlinear annotation anchor', 'ada￹@example.com'],
    ['a language tag', 'ada\u{e0001}@example.com'],
    ['a lone high surrogate', 'ada\ud800@example.com'],
    ['a lone low surrogate', 'ada@example.com\udfff'],
    ['a surrogate pair reversed', '\ude80\ud83d@example.com'],
  ],
}

async function teamEmails(file: TeamEmailsFile): Promise<TeamEmailsReport> {
  const byLabel = (label: string): VIdentity => {
    const found = file.identities.find((i) => i.label === label)
    if (!found) throw new Error(`no identity ${label}`)
    return found
  }
  // This file's own cache: its identities are not team-names-v1.json's.
  const cache = new Map<string, Promise<TeamIdentity>>()
  const identity = (label: string): Promise<TeamIdentity> => {
    const cached = cache.get(label)
    if (cached) return cached
    const vi = byLabel(label)
    const made = (async () => openIdentityEnvelope(vaultOpsFor(await vaultKey(vi.vmk)), hex(vi.sealed_private_key)))()
    cache.set(label, made)
    return made
  }
  const labelOf = (userId: string): string => {
    const found = file.identities.find((i) => i.user_id === userId)
    if (!found) throw new Error(`no identity with id ${userId}`)
    return found.label
  }
  const opener = async (n: { team_id: string; sender_id: string; recipient_id: string; opener: string; sender_public_key: string; sealed: string }): Promise<OpenEmailParams> => ({
    teamId: n.team_id,
    senderId: n.sender_id,
    recipientId: n.recipient_id,
    sealed: hex(n.sealed),
    recipient: await identity(n.opener),
    senderPublicKey: hex(n.sender_public_key),
  })
  const openAs = (kind: 'email' | 'name', p: OpenEmailParams) => (kind === 'email' ? openEmail(p) : openName(p))

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

  const seals: EmailSealReport[] = []
  for (const s of file.seals) {
    const sender = byLabel(s.sender)
    const recipient = byLabel(s.recipient)
    seals.push({
      description: s.description,
      info: await attempt(() => toHex(emailInfo(s.team_id, s.sender_id, s.recipient_id))),
      emailUtf8: toHex(new TextEncoder().encode(s.email)),
      check: await attempt(() => checkEmail(s.email)),
      plaintext: await attempt(() => toHex(padName(s.email))),
      senderKeyId: await attempt(async () => toHex((await identity(s.sender)).keyId)),
      recipientKeyId: await attempt(async () => toHex(await keyIdOf(hex(recipient.public_key)))),
      seal: await attempt(async () => {
        const ephemeral = {
          privateKey: await importPrivateKey(TEAM_NAMES_SUITE, hex(s.ephemeral_private_key), hex(s.enc)),
          publicKey: hex(s.enc),
        }
        const out = await sealEmailWithEphemeralKeyForTesting(
          {
            teamId: s.team_id,
            senderId: s.sender_id,
            recipientId: s.recipient_id,
            email: s.email,
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
          emailTag: toHex(out.emailTag),
          sealedHash: toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', out.sealed))),
        }
      }),
      tagFromSecret: await attempt(async () =>
        toHex(await emailTag(await importTagKey(hex(sender.tag_secret)), s.email, s.team_id, hex(s.recipient_key_id), hex(s.sealed_hash))),
      ),
      open: await attempt(async () =>
        openEmail({
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
  for (const n of file.open_negatives) openNegatives.push(await labelled(n.description, async () => openEmail(await opener(n))))

  const addressNegatives: AddressNegativeReport[] = []
  for (const n of file.address_negatives) {
    const recipient = byLabel(n.opener)
    addressNegatives.push({
      description: n.description,
      emailUtf8: toHex(new TextEncoder().encode(n.email)),
      check: await attempt(() => checkEmail(n.email)),
      seal: await attempt(async () =>
        toHex((await sealEmail({
          teamId: n.team_id,
          senderId: n.sender_id,
          recipientId: n.recipient_id,
          email: n.email,
          sender: await identity(labelOf(n.sender_id)),
          recipientPublicKey: hex(recipient.public_key),
          recipientKeyId: hex(recipient.key_id),
        })).sealed),
      ),
      open: await attempt(async () => openEmail(await opener(n))),
    })
  }

  const crossKind: CrossKindReport[] = []
  for (const n of file.cross_kind_negatives) {
    crossKind.push({
      description: n.description,
      asSealed: await attempt(async () => openAs(n.sealed_as, await opener(n))),
      asOpened: await attempt(async () => openAs(n.open_as, await opener(n))),
    })
  }

  const tagNegatives: TagNegativeReport[] = []
  for (const n of file.tag_negatives) {
    const row = file.seals[n.row]
    tagNegatives.push({
      description: n.description,
      tag: await attempt(async () =>
        toHex(await emailTag(await importTagKey(hex(n.tag_secret)), n.email, n.team_id, hex(n.recipient_key_id), hex(n.sealed_hash))),
      ),
      openAsRow: await attempt(async () =>
        openEmail({
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

  const checkCases = {
    accepted: await Promise.all(EMAIL_CHECK_CASES.accepted.map(([label, email]) => labelled(label, () => checkEmail(email) === email))),
    refused: await Promise.all(EMAIL_CHECK_CASES.refused.map(([label, email]) => labelled(label, () => checkEmail(email) !== null))),
  }

  // sealEmail with its own ephemeral key, end to end, between two of the file's people, and a row of each
  // kind opened as the other.
  const fresh = await attempt(async (): Promise<FreshEmailReport> => {
    const [d, e] = [file.identities[0], file.identities[1]]
    const [sender, recipient] = [await identity(d.label), await identity(e.label)]
    const team = file.seals[0].team_id
    const email = 'Ada.Lovelace@Example.COM'
    const params = { teamId: team, senderId: d.user_id, recipientId: e.user_id, sender, recipientPublicKey: recipient.publicKey, recipientKeyId: recipient.keyId }
    const a = await sealEmail({ ...params, email })
    const b = await sealEmail({ ...params, email })
    const openParams = { teamId: team, senderId: d.user_id, recipientId: e.user_id, recipient, senderPublicKey: sender.publicKey }
    const { sealed: nameRow } = await sealName({ ...params, name: email })
    return {
      encs: [toHex(a.enc), toHex(b.enc)],
      sealedLength: a.sealed.length,
      opened: await openEmail({ ...openParams, sealed: a.sealed }),
      asName: await attempt(() => openName({ ...openParams, sealed: a.sealed })),
      nameRowAsName: await openName({ ...openParams, sealed: nameRow }),
      nameRowAsEmail: await attempt(() => openEmail({ ...openParams, sealed: nameRow })),
    }
  })

  return { identities, envelopeNegatives, seals, openNegatives, addressNegatives, crossKind, tagNegatives, checkCases, fresh }
}

export async function runTeamNamesVectors(input: HarnessInput): Promise<HarnessReport> {
  const rfc: RfcReport[] = []
  for (const { section, vector } of input.rfc.vectors) rfc.push(await rfcSection(section, vector))
  const vectorOf = (suite: HpkeSuite) => {
    const found = input.rfc.vectors.find(({ vector: v }) => v.kem_id === suite.kemId)
    if (!found) throw new Error(`no vector for KEM ${suite.kemId}`)
    return found.vector
  }
  return {
    rfc,
    freshSeal: await attempt(freshSeal),
    publicKeys: await publicKeys(vectorOf(SUITE_P256_SHA256_AES256GCM), vectorOf(SUITE_P521_SHA512_AES256GCM)),
    ...(await teamNames(input.teamNames)),
    emails: await teamEmails(input.teamEmails),
  }
}

Object.defineProperty(globalThis, 'runTeamNamesVectors', { value: runTeamNamesVectors })
