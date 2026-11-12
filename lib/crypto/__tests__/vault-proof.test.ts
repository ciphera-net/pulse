// @vitest-environment node
//
// The vault-key proof (team names design §17.4, §17.12) against vectors/vault-proof-v1.json, written once by a
// standard-library Go reference in Ciphera ID from fixed inputs: a proof key (RFC 6979 A.2.5's P-256 pair), its
// 187-byte envelope under a fixed vault key and the proof context, the 98-byte plaintext, the 79-byte signed message
// and a signature Go made over it. The envelope's data key and nonces and an ECDSA signature are random, so envelopes
// are opened and signatures verified, never compared byte for byte. Ciphera ID carries the same file, pinned by the
// same SHA-256, so a drift fails on both sides.
//
// The construction is @ciphera-net/auth/vault-proof's, the one implementation id-frontend and this app both call.
// This file checks it on Node's WebCrypto; browser/vectors.spec.ts runs the same checks in Chromium, Firefox and WebKit.

import { createECDH, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { vaultOpsFor, type VaultKey } from '@ciphera-net/tessera'
import {
  PROOF_CHALLENGE_SIZE,
  PROOF_ENVELOPE_SIZE,
  PROOF_KEY_CONTEXT,
  PROOF_MESSAGE_SIZE,
  PROOF_PLAINTEXT_SIZE,
  PROOF_PUBLIC_KEY_SIZE,
  PROOF_SIGNATURE_SIZE,
  PROOF_SIGN_PREFIX,
  ProofKeyMismatchError,
  ProofKeyUnopenableError,
  createProofKey,
  proofMessage,
  signProof,
  type ProofPurpose,
} from '@ciphera-net/auth/vault-proof'
import { asBytes } from '../hpke'
import { IDENTITY_CONTEXT, openIdentityEnvelope } from '../team-names'

const FILE = fileURLToPath(new URL('./vectors/vault-proof-v1.json', import.meta.url))
const FILE_SHA256 = 'c4d47e73e6d67e30482c84b3003ff80453e0e9999032c0476fc0204a3a969239'
const TEAM_NAMES_FILE = fileURLToPath(new URL('./vectors/team-names-v1.json', import.meta.url))

const v = JSON.parse(readFileSync(FILE, 'utf8')) as {
  version: string
  inputs: {
    vmk_hex: string
    context: string
    proof_d_hex: string
    proof_pub_hex: string
    user_id: string
    challenge_hex: string
    purpose: string
    sign_prefix: string
    _rfc6979_control: { message_utf8: string; r_hex: string; s_hex: string }
  }
  plaintext_hex: string
  envelope_hex: string
  message_hex: string
  signature_go_hex: string
  envelope_browser_hex: string
  signature_browser_hex: string
}
const tn = JSON.parse(readFileSync(TEAM_NAMES_FILE, 'utf8')) as { identities: { label: string; vmk: string; sealed_private_key: string }[] }

const hex = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'))
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex')
const { inputs } = v
const PURPOSE = inputs.purpose as ProofPurpose
const PUB = hex(inputs.proof_pub_hex)
const CHALLENGE = hex(inputs.challenge_hex)
const MESSAGE = hex(v.message_hex)
const ENVELOPE = hex(v.envelope_hex)

async function vaultKey(vmkHex: string): Promise<VaultKey> {
  return (await crypto.subtle.importKey('raw', hex(vmkHex), 'HKDF', false, ['deriveKey'])) as VaultKey
}

const vault = async () => vaultOpsFor(await vaultKey(inputs.vmk_hex))

async function verifies(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', asBytes(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, asBytes(signature), asBytes(message))
}

function flipped(bytes: Uint8Array, index: number): Uint8Array {
  const out = new Uint8Array(bytes)
  out[index] ^= 0x01
  return out
}

describe('the vault-proof-v1 vector file', () => {
  it('is the pinned file, and its constants are the library\'s', () => {
    expect(createHash('sha256').update(readFileSync(FILE)).digest('hex')).toBe(FILE_SHA256)
    expect(v.version).toBe('vault-proof-v1')
    expect([inputs.context, inputs.sign_prefix, inputs.purpose]).toEqual([PROOF_KEY_CONTEXT, PROOF_SIGN_PREFIX, 'tkp'])
    expect([PUB.length, hex(v.plaintext_hex).length, ENVELOPE.length, MESSAGE.length, hex(v.signature_go_hex).length, CHALLENGE.length]).toEqual([
      PROOF_PUBLIC_KEY_SIZE,
      PROOF_PLAINTEXT_SIZE,
      PROOF_ENVELOPE_SIZE,
      PROOF_MESSAGE_SIZE,
      PROOF_SIGNATURE_SIZE,
      PROOF_CHALLENGE_SIZE,
    ])
    expect([PROOF_PLAINTEXT_SIZE, PROOF_ENVELOPE_SIZE, PROOF_MESSAGE_SIZE]).toEqual([98, 187, 79])
  })

  it('carries a proof key whose public point is its scalar times the base point', () => {
    // Node's own EC arithmetic, outside WebCrypto: a scalar that did not match its point would make every signature fail.
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(inputs.proof_d_hex, 'hex'))
    expect(ecdh.getPublicKey('hex', 'uncompressed')).toBe(inputs.proof_pub_hex)
  })
})

describe('the known answers', () => {
  it('opens the Go envelope under the vault key and the proof context to 0x01 || d || pub', async () => {
    const pt = await (await vault()).open(PROOF_KEY_CONTEXT, ENVELOPE)
    expect(toHex(pt)).toBe(v.plaintext_hex)
    expect(v.plaintext_hex).toBe(`01${inputs.proof_d_hex}${inputs.proof_pub_hex}`)
    expect(ENVELOPE[0]).toBe(0x01)
  })

  it('builds the message byte for byte: prefix, 0x00, challenge, the user id\'s 16 bytes, purpose', () => {
    const message = proofMessage(CHALLENGE, inputs.user_id, PURPOSE)
    expect(toHex(message)).toBe(v.message_hex)
    const uuid = inputs.user_id.replace(/-/g, '')
    expect(v.message_hex).toBe(`${Buffer.from(PROOF_SIGN_PREFIX).toString('hex')}00${inputs.challenge_hex}${uuid}${Buffer.from('tkp').toString('hex')}`)
  })

  it('verifies the Go signature over the message under the vector key', async () => {
    expect(await verifies(PUB, hex(v.signature_go_hex), MESSAGE)).toBe(true)
  })

  it('verifies RFC 6979 A.2.5\'s signature of "sample" under the same key (the verify path\'s positive control)', async () => {
    const c = inputs._rfc6979_control
    expect(await verifies(PUB, hex(c.r_hex + c.s_hex), new TextEncoder().encode(c.message_utf8))).toBe(true)
  })

  it('signs with the Go envelope, and the signature verifies under the vector key', async () => {
    const { signature, signatureBase64 } = await signProof(await vault(), {
      sealedPrivateKey: ENVELOPE,
      publicKey: PUB,
      challenge: CHALLENGE,
      userId: inputs.user_id,
      purpose: PURPOSE,
    })
    expect(signature.length).toBe(PROOF_SIGNATURE_SIZE)
    expect(Buffer.from(signatureBase64, 'base64').equals(Buffer.from(signature))).toBe(true)
    expect(await verifies(PUB, signature, MESSAGE)).toBe(true)
  })

  it('seals the vector plaintext into an envelope that opens again, and a created key signs for its own public key', async () => {
    const ops = await vault()
    const sealed = await ops.seal(PROOF_KEY_CONTEXT, hex(v.plaintext_hex))
    expect([sealed.length, sealed[0]]).toEqual([PROOF_ENVELOPE_SIZE, 0x01])
    expect(toHex(await ops.open(PROOF_KEY_CONTEXT, sealed))).toBe(v.plaintext_hex)

    const created = await createProofKey(ops)
    const { signature } = await signProof(ops, { ...created, challenge: CHALLENGE, userId: inputs.user_id, purpose: PURPOSE })
    expect(await verifies(created.publicKey, signature, MESSAGE)).toBe(true)
    expect(await verifies(PUB, signature, MESSAGE)).toBe(false)
  })
})

describe('the negatives', () => {
  it('a team-key envelope does not open under the proof context, and the proof envelope not under the team-key one', async () => {
    const id = tn.identities[0]
    const teamVault = vaultOpsFor(await vaultKey(id.vmk))
    // Each opens under its own context, so a refusal is the context's binding and not a broken envelope.
    await expect(openIdentityEnvelope(teamVault, hex(id.sealed_private_key))).resolves.toBeDefined()
    await expect(teamVault.open(PROOF_KEY_CONTEXT, hex(id.sealed_private_key))).rejects.toThrow()
    await expect((await vault()).open(IDENTITY_CONTEXT, ENVELOPE)).rejects.toThrow()
  })

  it('a proof key sealed under the team-key context, at the proof\'s own size, is unopenable as a proof key', async () => {
    const ops = await vault()
    const underTeamContext = await ops.seal(IDENTITY_CONTEXT, hex(v.plaintext_hex))
    expect(underTeamContext.length).toBe(PROOF_ENVELOPE_SIZE)
    await expect(
      signProof(ops, { sealedPrivateKey: underTeamContext, publicKey: PUB, challenge: CHALLENGE, userId: inputs.user_id, purpose: PURPOSE }),
    ).rejects.toBeInstanceOf(ProofKeyUnopenableError)
  })

  it('another vault key cannot sign, and a served public key that is not the sealed one is refused', async () => {
    const other = vaultOpsFor((await crypto.subtle.importKey('raw', new Uint8Array(32).fill(9), 'HKDF', false, ['deriveKey'])) as VaultKey)
    const input = { sealedPrivateKey: ENVELOPE, publicKey: PUB, challenge: CHALLENGE, userId: inputs.user_id, purpose: PURPOSE }
    await expect(signProof(other, input)).rejects.toBeInstanceOf(ProofKeyUnopenableError)
    const elsewhere = (await createProofKey(await vault())).publicKey
    await expect(signProof(await vault(), { ...input, publicKey: elsewhere })).rejects.toBeInstanceOf(ProofKeyMismatchError)
  })

  it.each([
    ['the prefix', 0],
    ['the separator', PROOF_SIGN_PREFIX.length],
    ['the challenge', PROOF_SIGN_PREFIX.length + 1],
    ['the user id', PROOF_SIGN_PREFIX.length + 1 + 32],
    ['the purpose', PROOF_SIGN_PREFIX.length + 1 + 32 + 16],
  ])('the Go signature does not verify with one byte of %s flipped', async (_field, index) => {
    expect(await verifies(PUB, hex(v.signature_go_hex), flipped(MESSAGE, index))).toBe(false)
  })

  it('the Go signature is no signature for another purpose, another person or another challenge', async () => {
    const sig = hex(v.signature_go_hex)
    const tmk = proofMessage(CHALLENGE, inputs.user_id, 'tmk' as ProofPurpose)
    expect(toHex(tmk.subarray(0, 76))).toBe(v.message_hex.slice(0, 152))
    expect(await verifies(PUB, sig, tmk)).toBe(false)
    expect(await verifies(PUB, sig, proofMessage(CHALLENGE, '00112233-4455-6677-8899-aabbccddeef0', PURPOSE))).toBe(false)
    expect(await verifies(PUB, sig, proofMessage(flipped(CHALLENGE, 31), inputs.user_id, PURPOSE))).toBe(false)
  })
})
