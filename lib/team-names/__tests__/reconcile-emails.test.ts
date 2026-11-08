// @vitest-environment node
//
// One team's addresses, both directions (design §16.4): the sender plans its rows from the server's `recipients`, the
// team's owners and admins with a key, with the names' rules (current, stale tag, stale recipient key, missing, a
// recipient with no key, an address that cannot be shared); an owner or admin opens what was sealed for them with the
// names' refusals (a foreign recipient key, a stale sender key, a missing key, a row that does not open, and an address
// the check refuses). Real cryptography on the vector identities A, B and C.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { vaultOpsFor, type VaultKey } from '@ciphera-net/tessera'
import { concatBytes, seal, type Bytes } from '@/lib/crypto/hpke'
import {
  TEAM_NAMES_SUITE,
  WIRE_VERSION,
  createIdentity,
  emailInfo,
  emailTag,
  importTagKey,
  keyIdOf,
  openIdentityEnvelope,
  padName,
  sealEmail,
  sealName,
  type TeamIdentity,
} from '@/lib/crypto/team-names'
import type { DirectoryKey, MyEmailRow, RowForMe } from '../api'
import { emailDuplicateIds, openEmailsForMe, planEmailSeals } from '../reconcile'

const vectors = JSON.parse(readFileSync(fileURLToPath(new URL('../../crypto/__tests__/vectors/team-names-v1.json', import.meta.url)), 'utf8')) as {
  identities: { label: string; user_id: string; public_key: string; vmk: string; sealed_private_key: string }[]
}
const hex = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'))
/** sealed_hash as the server computes it from the stored row. */
const sha256 = (b: Uint8Array): Bytes => new Uint8Array(createHash('sha256').update(b).digest())
const TEAM = '7e7e7e7e-0000-4000-8000-000000000001'
const OTHER_TEAM = '7e7e7e7e-0000-4000-8000-0000000000f2'

type Person = { id: string; identity: TeamIdentity; key: DirectoryKey }

async function person(label: string): Promise<Person> {
  const v = vectors.identities.find((i) => i.label === label)
  if (!v) throw new Error(label)
  const vmk = (await crypto.subtle.importKey('raw', hex(v.vmk), 'HKDF', false, ['deriveKey'])) as VaultKey
  const identity = await openIdentityEnvelope(vaultOpsFor(vmk), hex(v.sealed_private_key))
  return { id: v.user_id, identity, key: { userId: v.user_id, publicKey: identity.publicKey } }
}

async function freshIdentity(): Promise<TeamIdentity> {
  const vmk = (await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), 'HKDF', false, ['deriveKey'])) as VaultKey
  return (await createIdentity(vaultOpsFor(vmk))).identity
}

/** A row of mine sealed by `sender` for `recipient`, as `mine` serves its metadata (the hash of the stored row). */
async function myRow(sender: Person, recipient: { id: string; identity: TeamIdentity }, email: string): Promise<MyEmailRow> {
  const sealed = await sealEmail({
    teamId: TEAM, senderId: sender.id, recipientId: recipient.id, email, sender: sender.identity,
    recipientPublicKey: recipient.identity.publicKey, recipientKeyId: recipient.identity.keyId,
  })
  return { recipientId: recipient.id, recipientKeyId: recipient.identity.keyId, emailTag: sealed.emailTag, sealedHash: sha256(sealed.sealed) }
}

/** A row for `recipient`, as `for_me` serves it. */
async function rowFor(sender: Person, recipient: Person, email: string, team = TEAM): Promise<RowForMe> {
  const { sealed } = await sealEmail({
    teamId: team, senderId: sender.id, recipientId: recipient.id, email, sender: sender.identity,
    recipientPublicKey: recipient.identity.publicKey, recipientKeyId: recipient.identity.keyId,
  })
  return { senderId: sender.id, senderKeyId: sender.identity.keyId, recipientKeyId: recipient.identity.keyId, sealed }
}

/**
 * A well-formed email row whose plaintext the check refuses: sealed straight through HPKE under the email info, past
 * sealEmail (which refuses such an address). What a modified client could write.
 */
async function uncheckedRowFor(sender: Person, recipient: Person, address: string): Promise<RowForMe> {
  const { enc, ciphertext } = await seal({
    suite: TEAM_NAMES_SUITE,
    recipientPublicKey: recipient.identity.publicKey,
    sender: { privateKey: sender.identity.privateKey, publicKey: sender.identity.publicKey },
    info: emailInfo(TEAM, sender.id, recipient.id),
    aad: new Uint8Array([WIRE_VERSION]),
    plaintext: padName(address),
  })
  return { senderId: sender.id, senderKeyId: sender.identity.keyId, recipientKeyId: recipient.identity.keyId, sealed: concatBytes(new Uint8Array([WIRE_VERSION]), enc, ciphertext) }
}

const plan = (a: Person, email: string | null, recipients: string[], keys: DirectoryKey[], mine: MyEmailRow[], warn = vi.fn()) =>
  planEmailSeals({ teamId: TEAM, myId: a.id, me: a.identity, email, recipients, keys, mine, warn })

describe('planEmailSeals: the sender side', () => {
  it('seals for each owner and admin listed with no row of mine (missing), at the row size, under the right key ids', async () => {
    const [a, b, c] = await Promise.all([person('A'), person('B'), person('C')])
    const p = await plan(a, 'ada@example.com', [b.id, c.id], [b.key, c.key], [])
    expect(p.kind).toBe('write')
    if (p.kind !== 'write') return
    expect(p.entries.map((e) => e.recipientId)).toEqual([b.id, c.id])
    for (const [entry, who] of [[p.entries[0], b], [p.entries[1], c]] as const) {
      expect(entry.sealed.length).toBe(594)
      expect(entry.senderKeyId).toEqual(a.identity.keyId)
      expect(entry.recipientKeyId).toEqual(await keyIdOf(who.identity.publicKey))
      // The tag binds the row as the server will store it.
      expect(entry.emailTag).toEqual(await emailTag(a.identity.tagKey, 'ada@example.com', TEAM, entry.recipientKeyId, sha256(entry.sealed)))
    }
  })

  it('leaves a current row alone: the reconcile is idempotent', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    expect(await plan(a, 'ada@example.com', [b.id], [b.key], [await myRow(a, b, 'ada@example.com')])).toEqual({ kind: 'nothing' })
  })

  it('re-seals a row whose tag was computed for another address (a stale tag)', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const p = await plan(a, 'ada@new.example.com', [b.id], [b.key], [await myRow(a, b, 'ada@example.com')])
    expect(p.kind === 'write' && p.entries.map((e) => e.recipientId)).toEqual([b.id])
  })

  it('re-seals a row that names a stale recipient key', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const stale = await myRow(a, { id: b.id, identity: await freshIdentity() }, 'ada@example.com')
    const p = await plan(a, 'ada@example.com', [b.id], [b.key], [stale])
    expect(p.kind === 'write' && p.entries.map((e) => e.recipientId)).toEqual([b.id])
  })

  it('re-seals a row with matching metadata and a tag this person\'s tag secret does not make', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const genuine = await myRow(a, b, 'ada@example.com')
    const forged = await emailTag(await importTagKey(crypto.getRandomValues(new Uint8Array(32))), 'ada@example.com', TEAM, genuine.recipientKeyId, genuine.sealedHash)
    const p = await plan(a, 'ada@example.com', [b.id], [b.key], [{ ...genuine, emailTag: forged }])
    expect(p.kind).toBe('write')
  })

  it('skips a recipient the server lists with no key, with a coded warning, and seals for the rest', async () => {
    const [a, b, c] = await Promise.all([person('A'), person('B'), person('C')])
    const warn = vi.fn()
    const p = await plan(a, 'ada@example.com', [b.id, c.id], [c.key], [], warn)
    expect(p.kind === 'write' && p.entries.map((e) => e.recipientId)).toEqual([c.id])
    expect(warn).toHaveBeenCalledWith('team_names/invalid_response', { userId: b.id })
  })

  it('never seals for this person, and seals once for a recipient listed twice', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const p = await plan(a, 'ada@example.com', [a.id, b.id, b.id], [a.key, b.key], [])
    expect(p.kind === 'write' && p.entries.map((e) => e.recipientId)).toEqual([b.id])
  })

  it('takes every row back when the address cannot be shared and rows were sent; does nothing when none were', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    expect(await plan(a, null, [b.id], [b.key], [await myRow(a, b, 'ada@example.com')])).toEqual({ kind: 'withdraw' })
    expect(await plan(a, null, [b.id], [b.key], [])).toEqual({ kind: 'nothing' })
  })

  it('a key the browser refuses costs that recipient alone', async () => {
    const [a, b, c] = await Promise.all([person('A'), person('B'), person('C')])
    const warn = vi.fn()
    const offCurve = new Uint8Array(65).fill(7)
    offCurve[0] = 0x04
    const p = await plan(a, 'ada@example.com', [b.id, c.id], [{ userId: b.id, publicKey: offCurve }, c.key], [], warn)
    expect(p.kind === 'write' && p.entries.map((e) => e.recipientId)).toEqual([c.id])
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^team_names\//), { userId: b.id })
  })
})

describe('openEmailsForMe: the recipient side', () => {
  const open = (me: Person, keys: DirectoryKey[], forMe: RowForMe[], members: string[], warn = vi.fn()) =>
    openEmailsForMe({ teamId: TEAM, myId: me.id, me: me.identity, keys, forMe, memberIds: new Set(members), warn })

  it('opens the addresses sealed for me, exactly as sealed, and marks a sender who left as former', async () => {
    const [a, b, c] = await Promise.all([person('A'), person('B'), person('C')])
    const forMe = [await rowFor(b, a, 'Bob.Smith+pulse@Example.com'), await rowFor(c, a, 'cleo@example.com')]
    const emails = await open(a, [b.key, c.key], forMe, [a.id, b.id])
    expect(Object.fromEntries(emails)).toEqual({
      [b.id]: { email: 'Bob.Smith+pulse@Example.com', former: false },
      [c.id]: { email: 'cleo@example.com', former: true },
    })
  })

  it('refuses a row sealed to a key that is not mine', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const row = { ...(await rowFor(b, a, 'bob@example.com')), recipientKeyId: new Uint8Array(32).fill(9) }
    const warn = vi.fn()
    expect((await open(a, [b.key], [row], [a.id, b.id], warn)).size).toBe(0)
    expect(warn).toHaveBeenCalledWith('team_names/foreign_recipient_key', { userId: b.id })
  })

  it('refuses a row whose sender key id is not the key the directory serves for them (a stale sender key)', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const row = await rowFor(b, a, 'bob@example.com')
    const warn = vi.fn()
    const served = { userId: b.id, publicKey: (await freshIdentity()).publicKey }
    expect((await open(a, [served], [row], [a.id, b.id], warn)).size).toBe(0)
    expect(warn).toHaveBeenCalledWith('team_names/stale_key', { userId: b.id })
  })

  it('refuses a row whose sender has no key in the directory', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const warn = vi.fn()
    expect((await open(a, [], [await rowFor(b, a, 'bob@example.com')], [a.id, b.id], warn)).size).toBe(0)
    expect(warn).toHaveBeenCalledWith('team_names/open_failed', { userId: b.id })
  })

  it('refuses a row that does not open: tampered, moved to another team, or a name row passed off as an address', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const tampered = await rowFor(b, a, 'bob@example.com')
    tampered.sealed = new Uint8Array(tampered.sealed)
    tampered.sealed[100] ^= 1
    const moved = await rowFor(b, a, 'bob@example.com', OTHER_TEAM)
    const name = await sealName({
      teamId: TEAM, senderId: b.id, recipientId: a.id, name: 'bob@example.com', sender: b.identity,
      recipientPublicKey: a.identity.publicKey, recipientKeyId: a.identity.keyId,
    })
    const nameRow = { senderId: b.id, senderKeyId: b.identity.keyId, recipientKeyId: a.identity.keyId, sealed: name.sealed }
    for (const row of [tampered, moved, nameRow]) {
      const warn = vi.fn()
      expect((await open(a, [b.key], [row], [a.id, b.id], warn)).size).toBe(0)
      expect(warn).toHaveBeenCalledWith('team_names/open_failed', { userId: b.id })
    }
  })

  it('shows no address the check refuses, with the same coded warning', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    for (const bad of ['no-at-sign', 'two@at@example.com', 'bob @example.com', 'bob@exam​ple.com', '@example.com']) {
      const warn = vi.fn()
      expect((await open(a, [b.key], [await uncheckedRowFor(b, a, bad)], [a.id, b.id], warn)).size).toBe(0)
      expect(warn).toHaveBeenCalledWith('team_names/open_failed', { userId: b.id })
    }
  })
})

describe('emailDuplicateIds', () => {
  const opened = (entries: [string, string][]) => new Map(entries.map(([id, email]) => [id, { email, former: false }]))

  it('flags two people showing one address, case-insensitively, and a teammate showing mine', () => {
    expect([...emailDuplicateIds(opened([['b', 'Bob@Example.com'], ['c', 'bob@example.com'], ['d', 'dee@example.com']]), null)].sort()).toEqual(['b', 'c'])
    expect([...emailDuplicateIds(opened([['b', 'bob@example.com'], ['c', 'ADA@example.com']]), { userId: 'a', email: 'ada@example.com' })].sort()).toEqual(['a', 'c'])
    expect(emailDuplicateIds(opened([['b', 'bob@example.com']]), { userId: 'a', email: 'ada@example.com' }).size).toBe(0)
  })
})
