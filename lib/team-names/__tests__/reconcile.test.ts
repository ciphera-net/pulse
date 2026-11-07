// @vitest-environment node
//
// One team's reconcile, both directions (design §5.3, §5.4, §8.2's five sender cases), with real
// cryptography on the vector identities A, B and C.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { vaultOpsFor, type VaultKey } from '@ciphera-net/tessera'
import type { Bytes } from '@/lib/crypto/hpke'
import {
  createIdentity,
  importTagKey,
  keyIdOf,
  nameTag,
  openIdentityEnvelope,
  sealName,
  type TeamIdentity,
} from '@/lib/crypto/team-names'
import type { DirectoryKey, MyRow, RowForMe } from '../api'
import { duplicateIds, openNamesForMe, planSeals } from '../reconcile'

const vectors = JSON.parse(readFileSync(fileURLToPath(new URL('../../crypto/__tests__/vectors/team-names-v1.json', import.meta.url)), 'utf8')) as {
  identities: { label: string; user_id: string; public_key: string; vmk: string; sealed_private_key: string }[]
}
const hex = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'))
/** sealed_hash as the server computes it from the stored row. */
const sha256 = (b: Uint8Array): Bytes => new Uint8Array(createHash('sha256').update(b).digest())
const TEAM = '7e7e7e7e-0000-4000-8000-000000000001'
const OTHER_TEAM = '7e7e7e7e-0000-4000-8000-0000000000f2'

async function person(label: string) {
  const v = vectors.identities.find((i) => i.label === label)
  if (!v) throw new Error(label)
  const vmk = (await crypto.subtle.importKey('raw', hex(v.vmk), 'HKDF', false, ['deriveKey'])) as VaultKey
  const identity = await openIdentityEnvelope(vaultOpsFor(vmk), hex(v.sealed_private_key))
  return { id: v.user_id, identity, key: { userId: v.user_id, publicKey: identity.publicKey } as DirectoryKey }
}

async function freshIdentity(): Promise<TeamIdentity> {
  const vmk = (await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), 'HKDF', false, ['deriveKey'])) as VaultKey
  return (await createIdentity(vaultOpsFor(vmk))).identity
}

/** A row of mine sealed by `sender` for `recipient`, and the metadata `mine` serves for it (the hash of the stored row). */
async function sealedRow(sender: { id: string; identity: TeamIdentity }, recipient: { id: string; identity: TeamIdentity }, name: string): Promise<{ row: MyRow; sealed: Bytes }> {
  const sealed = await sealName({
    teamId: TEAM, senderId: sender.id, recipientId: recipient.id, name, sender: sender.identity,
    recipientPublicKey: recipient.identity.publicKey, recipientKeyId: recipient.identity.keyId,
  })
  return {
    row: { recipientId: recipient.id, recipientKeyId: recipient.identity.keyId, nameTag: sealed.nameTag, sealedHash: sha256(sealed.sealed) },
    sealed: sealed.sealed,
  }
}

async function myRow(sender: { id: string; identity: TeamIdentity }, recipient: { id: string; identity: TeamIdentity }, name: string): Promise<MyRow> {
  return (await sealedRow(sender, recipient, name)).row
}

/** A row for `recipient`, as `for_me` serves it. */
async function rowFor(sender: { id: string; identity: TeamIdentity }, recipient: { id: string; identity: TeamIdentity }, name: string, team = TEAM): Promise<RowForMe> {
  const { sealed } = await sealName({
    teamId: team, senderId: sender.id, recipientId: recipient.id, name, sender: sender.identity,
    recipientPublicKey: recipient.identity.publicKey, recipientKeyId: recipient.identity.keyId,
  })
  return { senderId: sender.id, senderKeyId: sender.identity.keyId, recipientKeyId: recipient.identity.keyId, sealed }
}

describe('planSeals: the sender side', () => {
  it('seals for a teammate with no row of mine (missing)', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const plan = await planSeals({ teamId: TEAM, myId: a.id, me: a.identity, share: { kind: 'name', name: 'Ada' }, keys: [a.key, b.key], mine: [], memberIds: new Set([a.id, b.id]), warn: vi.fn() })
    expect(plan.kind).toBe('write')
    if (plan.kind !== 'write') return
    expect(plan.entries.map((e) => e.recipientId)).toEqual([b.id])
    const [entry] = plan.entries
    expect(entry.sealed.length).toBe(594)
    expect(entry.senderKeyId).toEqual(a.identity.keyId)
    expect(entry.recipientKeyId).toEqual(await keyIdOf(b.identity.publicKey))
  })

  it('leaves a current row alone: the reconcile is idempotent', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const plan = await planSeals({ teamId: TEAM, myId: a.id, me: a.identity, share: { kind: 'name', name: 'Ada' }, keys: [a.key, b.key], mine: [await myRow(a, b, 'Ada')], memberIds: new Set([a.id, b.id]), warn: vi.fn() })
    expect(plan).toEqual({ kind: 'nothing' })
  })

  it('re-seals a row that names a stale recipient key', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const stale = await myRow(a, { id: b.id, identity: await freshIdentity() }, 'Ada')
    const plan = await planSeals({ teamId: TEAM, myId: a.id, me: a.identity, share: { kind: 'name', name: 'Ada' }, keys: [a.key, b.key], mine: [stale], memberIds: new Set([a.id, b.id]), warn: vi.fn() })
    expect(plan.kind === 'write' && plan.entries.map((e) => e.recipientId)).toEqual([b.id])
  })

  it('re-seals a row whose tag was computed for another name (a stale name)', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const plan = await planSeals({ teamId: TEAM, myId: a.id, me: a.identity, share: { kind: 'name', name: 'Ada L.' }, keys: [a.key, b.key], mine: [await myRow(a, b, 'Ada')], memberIds: new Set([a.id, b.id]), warn: vi.fn() })
    expect(plan.kind === 'write' && plan.entries.map((e) => e.recipientId)).toEqual([b.id])
  })

  it('re-seals a foreign row with matching metadata (written by a session without my tag secret)', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    // A stolen session can write a well-formed row with the right recipient key id, and any tag it
    // likes, but never one this person's tag secret produces for this row (review L1).
    const genuine = await myRow(a, b, 'Ada')
    const forgedTag = await nameTag(await importTagKey(crypto.getRandomValues(new Uint8Array(32))), 'Ada', TEAM, genuine.recipientKeyId, genuine.sealedHash)
    const foreign: MyRow = { ...genuine, nameTag: forgedTag }
    const plan = await planSeals({ teamId: TEAM, myId: a.id, me: a.identity, share: { kind: 'name', name: 'Ada' }, keys: [a.key, b.key], mine: [foreign], memberIds: new Set([a.id, b.id]), warn: vi.fn() })
    expect(plan.kind === 'write' && plan.entries.map((e) => e.recipientId)).toEqual([b.id])
    // And a genuine tag moved onto another row does not pass either.
    const other = await myRow(a, b, 'Ada')
    const moved: MyRow = { ...other, nameTag: genuine.nameTag }
    const plan2 = await planSeals({ teamId: TEAM, myId: a.id, me: a.identity, share: { kind: 'name', name: 'Ada' }, keys: [a.key, b.key], mine: [moved], memberIds: new Set([a.id, b.id]), warn: vi.fn() })
    expect(plan2.kind).toBe('write')
  })

  it('re-seals a row whose ciphertext a stolen session replaced behind the genuine enc and tag (review M1)', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const { row: genuine, sealed } = await sealedRow(a, b, 'Ada')
    const input = { teamId: TEAM, myId: a.id, me: a.identity, keys: [a.key, b.key], memberIds: new Set([a.id, b.id]), warn: vi.fn() }
    expect(await planSeals({ ...input, share: { kind: 'name', name: 'Ada' }, mine: [genuine] })).toEqual({ kind: 'nothing' })
    // Stored: 0x01 || the genuine enc || 528 other bytes, under the genuine ids, key ids and tag. Nobody can
    // open it, and mine serves the hash of what is stored.
    const replaced = new Uint8Array(sealed)
    replaced.set(crypto.getRandomValues(new Uint8Array(528)), 1 + 65)
    const plan = await planSeals({ ...input, share: { kind: 'name', name: 'Ada' }, mine: [{ ...genuine, sealedHash: sha256(replaced) }] })
    expect(plan.kind === 'write' && plan.entries.map((e) => e.recipientId)).toEqual([b.id])
    // What replaces it is current once stored.
    if (plan.kind !== 'write') return
    const [entry] = plan.entries
    const stored: MyRow = { recipientId: b.id, recipientKeyId: new Uint8Array(entry.recipientKeyId), nameTag: new Uint8Array(entry.nameTag), sealedHash: sha256(entry.sealed) }
    expect(await planSeals({ ...input, share: { kind: 'name', name: 'Ada' }, mine: [stored] })).toEqual({ kind: 'nothing' })
  })

  it('re-seals, in another team, a genuine row a stolen session copied there byte for byte (review M1)', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const genuine = await myRow(a, b, 'Ada') // sealed and tagged in TEAM
    const input = { myId: a.id, me: a.identity, keys: [a.key, b.key], mine: [genuine], memberIds: new Set([a.id, b.id]), warn: vi.fn() }
    expect(await planSeals({ ...input, teamId: TEAM, share: { kind: 'name', name: 'Ada' } })).toEqual({ kind: 'nothing' })
    const plan = await planSeals({ ...input, teamId: OTHER_TEAM, share: { kind: 'name', name: 'Ada' } })
    expect(plan.kind === 'write' && plan.entries.map((e) => e.recipientId)).toEqual([b.id])
  })

  it('withdraws everything when the name is cleared or too long to share, and does nothing with no rows', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const mine = [await myRow(a, b, 'Ada')]
    const base = { teamId: TEAM, myId: a.id, me: a.identity, keys: [a.key, b.key], memberIds: new Set([a.id, b.id]), warn: vi.fn() }
    expect(await planSeals({ ...base, share: { kind: 'none' }, mine })).toEqual({ kind: 'withdraw' })
    expect(await planSeals({ ...base, share: { kind: 'too_long' }, mine })).toEqual({ kind: 'withdraw' })
    expect(await planSeals({ ...base, share: { kind: 'none' }, mine: [] })).toEqual({ kind: 'nothing' })
  })

  it('never seals for a former member, even one whose key the directory serves', async () => {
    const [a, b, c] = await Promise.all([person('A'), person('B'), person('C')])
    // C has left: the directory still serves C's key to A because C's kept row for A exists (R54).
    const plan = await planSeals({ teamId: TEAM, myId: a.id, me: a.identity, share: { kind: 'name', name: 'Ada' }, keys: [a.key, b.key, c.key], mine: [], memberIds: new Set([a.id, b.id]), warn: vi.fn() })
    expect(plan.kind === 'write' && plan.entries.map((e) => e.recipientId)).toEqual([b.id])
  })

  it('skips, with a coded warning, a teammate whose served key the browser refuses', async () => {
    const [a, b, c] = await Promise.all([person('A'), person('B'), person('C')])
    const broken = new Uint8Array(c.identity.publicKey)
    broken[64] ^= 1
    const warn = vi.fn()
    const plan = await planSeals({ teamId: TEAM, myId: a.id, me: a.identity, share: { kind: 'name', name: 'Ada' }, keys: [a.key, b.key, { userId: c.id, publicKey: broken }], mine: [], memberIds: new Set([a.id, b.id, c.id]), warn })
    expect(plan.kind === 'write' && plan.entries.map((e) => e.recipientId)).toEqual([b.id])
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^team_names\//), { userId: c.id })
  })
})

describe('openNamesForMe: the recipient side', () => {
  it('opens names sealed for me, and marks a sender who left as former', async () => {
    const [a, b, c] = await Promise.all([person('A'), person('B'), person('C')])
    const names = await openNamesForMe({
      teamId: TEAM, myId: a.id, me: a.identity, keys: [a.key, b.key, c.key],
      forMe: [await rowFor(b, a, 'Bob'), await rowFor(c, a, 'Cleo')],
      memberIds: new Set([a.id, b.id]), warn: vi.fn(),
    })
    expect(names.get(b.id)).toEqual({ name: 'Bob', former: false })
    expect(names.get(c.id)).toEqual({ name: 'Cleo', former: true })
  })

  it('refuses and warns on a row not sealed to my key (review L6)', async () => {
    const [a, b] = await Promise.all([person('A'), person('B')])
    const row = await rowFor(b, a, 'Bob')
    const warn = vi.fn()
    const names = await openNamesForMe({
      teamId: TEAM, myId: a.id, me: a.identity, keys: [a.key, b.key],
      forMe: [{ ...row, recipientKeyId: await keyIdOf((await freshIdentity()).publicKey) }],
      memberIds: new Set([a.id, b.id]), warn,
    })
    expect(names.size).toBe(0)
    expect(warn).toHaveBeenCalledWith('team_names/foreign_recipient_key', { userId: b.id })
  })

  it('shows the id, with a coded warning, for a row that will not open, and still opens the rest', async () => {
    const [a, b, c] = await Promise.all([person('A'), person('B'), person('C')])
    const garbled = await rowFor(b, a, 'Bob')
    garbled.sealed[300] ^= 1
    const otherTeam = await rowFor(c, a, 'Cleo', OTHER_TEAM) // moved from another team: info differs
    const future = await rowFor(b, a, 'Bob')
    future.sealed[0] = 0x02
    const good = await rowFor(c, a, 'Cleo')
    const warn = vi.fn()
    const names = await openNamesForMe({
      teamId: TEAM, myId: a.id, me: a.identity, keys: [a.key, b.key, c.key],
      forMe: [garbled, otherTeam, future, good], memberIds: new Set([a.id, b.id, c.id]), warn,
    })
    expect([...names.entries()]).toEqual([[c.id, { name: 'Cleo', former: false }]])
    expect(warn).toHaveBeenCalledWith('team_names/open_failed', { userId: b.id })
    expect(warn).toHaveBeenCalledWith('team_names/open_failed', { userId: c.id })
    expect(warn).toHaveBeenCalledWith('team_names/unsupported_version', { userId: b.id })
  })

  it('refuses a row whose sender key id is not the served key’s, and a sender with no served key', async () => {
    const [a, b, c] = await Promise.all([person('A'), person('B'), person('C')])
    const row = await rowFor(b, a, 'Bob')
    const warn = vi.fn()
    const names = await openNamesForMe({
      teamId: TEAM, myId: a.id, me: a.identity, keys: [a.key, b.key],
      forMe: [{ ...row, senderKeyId: await keyIdOf(c.identity.publicKey) }, await rowFor(c, a, 'Cleo')],
      memberIds: new Set([a.id, b.id, c.id]), warn,
    })
    expect(names.size).toBe(0)
    expect(warn).toHaveBeenCalledWith('team_names/stale_key', { userId: b.id })
    expect(warn).toHaveBeenCalledWith('team_names/open_failed', { userId: c.id })
  })
})

describe('duplicateIds', () => {
  it('flags every person whose name equals another’s after cleaning and folding, the viewer’s own included', () => {
    const names = new Map([
      ['b', { name: 'Ada', former: false }],
      ['c', { name: 'ADA', former: true }],
      ['d', { name: 'Eve', former: false }],
      ['e', { name: 'Pat', former: false }],
    ])
    expect([...duplicateIds(names, null)].sort()).toEqual(['b', 'c'])
    expect([...duplicateIds(names, { userId: 'a', name: 'pat' })].sort()).toEqual(['a', 'b', 'c', 'e'])
  })

  it.each(['Pulse', 'pulse', ' PULSE ', 'You', 'you', 'Teammate', 'Former teammate', 'FORMER  TEAMMATE', 'Ｐｕｌｓｅ'])(
    'flags a name equal to one of Pulse’s own words (%j), alone on the page, as a duplicate is (R65)',
    (word) => {
      const names = new Map([
        ['b', { name: word, former: false }],
        ['c', { name: 'Eve', former: false }],
      ])
      expect([...duplicateIds(names, null)]).toEqual(['b'])
    },
  )

  it('leaves a name that only starts or ends with one of Pulse’s words alone', () => {
    const names = new Map([
      ['b', { name: 'Pulse fan', former: false }],
      ['c', { name: 'Your team', former: false }],
      ['d', { name: 'Teammates', former: false }],
      ['e', { name: 'Former', former: true }],
    ])
    expect([...duplicateIds(names, null)]).toEqual([])
  })

  it('flags the viewer’s own name too when it is one of Pulse’s words', () => {
    expect([...duplicateIds(new Map(), { userId: 'a', name: 'You' })]).toEqual(['a'])
  })
})
