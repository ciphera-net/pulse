// @vitest-environment node
//
// The session engine against a fake pulse-backend that keeps the routes' contract (design §6.2):
// POST /me/team-key takes a first key with no proof (R72) and never overwrites; PUT, the reset, spends
// its token and deletes every row in both directions; the directory serves current members' keys plus former senders with
// a kept row for the caller, and for each row the caller sent the SHA-256 of the row as stored; PUT
// team-names upserts the caller's rows or answers 409; DELETE takes back every row the caller sent. Real
// cryptography throughout.
//
// The team-emails routes keep pulse-backend's contract too (design §16.3, as built): the email directory
// lists the owners and admins with a key, the caller left out, serves the rows sealed for the caller only
// while they are an owner or admin, and the key of exactly the people it names; PUT team-emails refuses a
// recipient who is not a member, not an owner or admin, or under a stale key (409, nothing written); a role
// that stops being owner or admin deletes the rows sealed for it; DELETE takes back every address row the
// caller sent. A session runs the email pass only in a team whose flags say so; every test above the email
// block runs with team names alone, as before team emails.

import { createHash } from 'node:crypto'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { InvalidCredentialsError, vaultOpsFor, type VaultKey } from '@ciphera-net/tessera'
import { createIdentity } from '@/lib/crypto/team-names'
import type { Bytes } from '@/lib/crypto/hpke'
import type { DirectoryAnswer, EmailDirectoryAnswer, EmailEntry, KeyRow, NameEntry, PublishKeyBody, Warn } from '../api'
import { TeamNamesError } from '../errors'
import { TeamNamesSession, type SessionDeps, type TeamFlags, type TeamNamesApi } from '../session'

const TEAM = '7e7e7e7e-0000-4000-8000-000000000001'
const OTHER_TEAM = '7e7e7e7e-0000-4000-8000-0000000000f2'
const A = 'a1a1a1a1-0000-4000-8000-000000000001'
const B = 'b2b2b2b2-0000-4000-8000-000000000002'
const C = 'c3c3c3c3-0000-4000-8000-000000000003'

const sha256 = (b: Uint8Array): Bytes => new Uint8Array(createHash('sha256').update(b).digest())
const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b))

/** A team with team names alone: what every session ran before team emails. */
const NAMES_ONLY: TeamFlags = { names: true, emails: false }
const BOTH: TeamFlags = { names: true, emails: true }
const EMAILS_ONLY: TeamFlags = { names: false, emails: true }

type Role = 'owner' | 'admin' | 'member'

interface EmailRow {
  team: string
  sender: string
  recipient: string
  senderKeyId: Bytes
  recipientKeyId: Bytes
  emailTag: Bytes
  sealed: Bytes
  senderLeftAt: number | null
}

interface Row {
  team: string
  sender: string
  recipient: string
  senderKeyId: Bytes
  recipientKeyId: Bytes
  nameTag: Bytes
  sealed: Bytes
  senderLeftAt: number | null
}

class FakeServer {
  keys = new Map<string, KeyRow>()
  rows: Row[] = []
  members = new Map<string, Set<string>>([[TEAM, new Set([A, B, C])]])
  tokens = new Set<string>()
  events: string[] = []
  conflictsLeft = 0
  /** Roles per team (team emails go to owners and admins only); anyone not listed is a member. */
  roles = new Map<string, Map<string, Role>>([[TEAM, new Map<string, Role>([[A, 'owner'], [B, 'admin']])]])
  emailRows: EmailRow[] = []
  /** The next email PUTs answered 409, as when a key changed or a recipient was demoted since the read. */
  emailConflictsLeft = 0
  /** The next email directory read fails the way a 5xx or a dropped connection does. */
  failNextEmailRead = false
  /** The next email PUT fails the way a 5xx does. */
  failNextEmailWrite = false
  /** Directory reads per kind: a team without a kind's beta never reads its directory. */
  reads = { names: 0, emails: 0 }
  /** Runs inside POST before the insert: lets a test make another device win the race. */
  beforeInsert: ((caller: string) => Promise<void>) | null = null
  /** The next key POST fails the way a 5xx or a dropped connection does. */
  failNextPublish = false
  private minted = 0

  mint(): string {
    const token = `tmk-token-${++this.minted}-do-not-log`
    this.tokens.add(token)
    return token
  }

  leave(team: string, user: string) {
    this.members.get(team)?.delete(user)
    this.rows = this.rows.filter((r) => !(r.team === team && r.recipient === user))
    for (const r of this.rows) if (r.team === team && r.sender === user) r.senderLeftAt = Date.now()
    // The same two rules for addresses (R75): rows sealed for the leaver go, rows they sent are kept.
    this.emailRows = this.emailRows.filter((r) => !(r.team === team && r.recipient === user))
    for (const r of this.emailRows) if (r.team === team && r.sender === user) r.senderLeftAt = Date.now()
  }

  role(team: string, user: string): Role {
    return this.roles.get(team)?.get(user) ?? 'member'
  }

  /** A role change; migration 264's trigger deletes the rows sealed for someone who stops being an owner or admin. */
  setRole(team: string, user: string, role: Role) {
    if (!this.roles.has(team)) this.roles.set(team, new Map())
    this.roles.get(team)?.set(user, role)
    if (role === 'member') this.emailRows = this.emailRows.filter((r) => !(r.team === team && r.recipient === user))
  }

  private ownerOrAdmin(team: string, user: string): boolean {
    const role = this.role(team, user)
    return role === 'owner' || role === 'admin'
  }

  api(caller: string): TeamNamesApi {
    const insert = (body: PublishKeyBody): KeyRow => {
      const row: KeyRow = { keyId: sha256(body.publicKey), publicKey: new Uint8Array(body.publicKey), sealedPrivateKey: new Uint8Array(body.sealedPrivateKey) }
      this.keys.set(caller, row)
      return row
    }
    const spend = (token: string) => {
      if (!this.tokens.delete(token)) throw new TeamNamesError('team_names/reauth_required')
    }
    return {
      fetchOwnKey: async () => this.keys.get(caller) ?? null,
      publishKey: async (body) => {
        this.events.push('publish:start')
        if (this.failNextPublish) {
          this.failNextPublish = false
          throw new TeamNamesError('team_names/request_failed')
        }
        // R72: a first key carries no proof, and the browser sends none.
        if ('reauthToken' in body) throw new Error('a first key was sent with a re-auth token')
        const existing = this.keys.get(caller)
        if (existing) return existing
        await this.beforeInsert?.(caller)
        const winner = this.keys.get(caller)
        this.events.push('publish:end')
        return winner ?? insert(body)
      },
      resetKey: async (body) => {
        spend(body.reauthToken)
        this.rows = this.rows.filter((r) => r.sender !== caller && r.recipient !== caller)
        this.emailRows = this.emailRows.filter((r) => r.sender !== caller && r.recipient !== caller)
        this.events.push('reset')
        return insert(body)
      },
      fetchMemberIds: async (team) => [...(this.members.get(team) ?? [])],
      fetchDirectory: async (team): Promise<DirectoryAnswer> => {
        this.reads.names++
        const members = this.members.get(team) ?? new Set<string>()
        if (!members.has(caller)) return { kind: 'unavailable' }
        const kept = this.rows.filter((r) => r.team === team && r.recipient === caller && !members.has(r.sender)).map((r) => r.sender)
        const keyHolders = [...new Set([...members, ...kept])].filter((id) => this.keys.has(id))
        return {
          kind: 'directory',
          directory: {
            keys: keyHolders.map((id) => ({ userId: id, publicKey: (this.keys.get(id) as KeyRow).publicKey })),
            forMe: this.rows.filter((r) => r.team === team && r.recipient === caller)
              .map((r) => ({ senderId: r.sender, senderKeyId: r.senderKeyId, recipientKeyId: r.recipientKeyId, sealed: r.sealed })),
            mine: this.rows.filter((r) => r.team === team && r.sender === caller)
              .map((r) => ({ recipientId: r.recipient, recipientKeyId: r.recipientKeyId, nameTag: r.nameTag, sealedHash: sha256(r.sealed) })),
          },
        }
      },
      writeNames: async (team, entries: NameEntry[]) => {
        this.events.push('write')
        if (this.conflictsLeft > 0) {
          this.conflictsLeft--
          return { kind: 'conflict' }
        }
        const members = this.members.get(team) ?? new Set<string>()
        const mine = this.keys.get(caller)
        for (const e of entries) {
          const theirs = this.keys.get(e.recipientId)
          if (!members.has(e.recipientId) || e.recipientId === caller || !theirs || !mine) return { kind: 'conflict' }
          if (!same(e.recipientKeyId, theirs.keyId) || !same(e.senderKeyId, mine.keyId) || e.sealed.length !== 594) return { kind: 'conflict' }
        }
        for (const e of entries) {
          this.rows = this.rows.filter((r) => !(r.team === team && r.sender === caller && r.recipient === e.recipientId))
          this.rows.push({
            team, sender: caller, recipient: e.recipientId, senderKeyId: new Uint8Array(e.senderKeyId),
            recipientKeyId: new Uint8Array(e.recipientKeyId), nameTag: new Uint8Array(e.nameTag), sealed: new Uint8Array(e.sealed), senderLeftAt: null,
          })
        }
        return { kind: 'written' }
      },
      withdrawNames: async () => {
        this.events.push('withdraw')
        this.rows = this.rows.filter((r) => r.sender !== caller)
      },
      fetchEmailDirectory: async (team): Promise<EmailDirectoryAnswer> => {
        this.reads.emails++
        if (this.failNextEmailRead) {
          this.failNextEmailRead = false
          throw new TeamNamesError('team_names/request_failed')
        }
        const members = this.members.get(team) ?? new Set<string>()
        if (!members.has(caller)) return { kind: 'unavailable' }
        const recipients = [...members].filter((id) => id !== caller && this.ownerOrAdmin(team, id) && this.keys.has(id))
        const forMe = this.ownerOrAdmin(team, caller) ? this.emailRows.filter((r) => r.team === team && r.recipient === caller) : []
        const named = [...new Set([...recipients, ...forMe.map((r) => r.sender)])].filter((id) => this.keys.has(id))
        return {
          kind: 'directory',
          directory: {
            keys: named.map((id) => ({ userId: id, publicKey: (this.keys.get(id) as KeyRow).publicKey })),
            recipients,
            forMe: forMe.map((r) => ({ senderId: r.sender, senderKeyId: r.senderKeyId, recipientKeyId: r.recipientKeyId, sealed: r.sealed })),
            mine: this.emailRows.filter((r) => r.team === team && r.sender === caller)
              .map((r) => ({ recipientId: r.recipient, recipientKeyId: r.recipientKeyId, emailTag: r.emailTag, sealedHash: sha256(r.sealed) })),
          },
        }
      },
      writeEmails: async (team, entries: EmailEntry[]) => {
        this.events.push('email-write')
        if (this.failNextEmailWrite) {
          this.failNextEmailWrite = false
          throw new TeamNamesError('team_names/request_failed')
        }
        if (this.emailConflictsLeft > 0) {
          this.emailConflictsLeft--
          return { kind: 'conflict' }
        }
        const members = this.members.get(team) ?? new Set<string>()
        const mine = this.keys.get(caller)
        const seen = new Set<string>()
        for (const e of entries) {
          // A batch addressed to the caller, or naming a recipient twice, is a 400 for the whole batch.
          if (e.recipientId === caller || seen.has(e.recipientId)) throw new TeamNamesError('team_names/request_failed')
          seen.add(e.recipientId)
          const theirs = this.keys.get(e.recipientId)
          if (!members.has(e.recipientId) || !this.ownerOrAdmin(team, e.recipientId) || !theirs || !mine) return { kind: 'conflict' }
          if (!same(e.recipientKeyId, theirs.keyId) || !same(e.senderKeyId, mine.keyId) || e.sealed.length !== 594) return { kind: 'conflict' }
        }
        for (const e of entries) {
          this.emailRows = this.emailRows.filter((r) => !(r.team === team && r.sender === caller && r.recipient === e.recipientId))
          this.emailRows.push({
            team, sender: caller, recipient: e.recipientId, senderKeyId: new Uint8Array(e.senderKeyId),
            recipientKeyId: new Uint8Array(e.recipientKeyId), emailTag: new Uint8Array(e.emailTag), sealed: new Uint8Array(e.sealed), senderLeftAt: null,
          })
        }
        return { kind: 'written' }
      },
      withdrawEmails: async () => {
        this.events.push('email-withdraw')
        this.emailRows = this.emailRows.filter((r) => r.sender !== caller)
      },
    }
  }
}

async function newVmk(): Promise<VaultKey> {
  return (await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), 'HKDF', false, ['deriveKey'])) as VaultKey
}

interface Person {
  id: string
  vmk: VaultKey
  name: string | undefined
  /** The address in the person's vault. */
  email: string
  /** Each team's betas, as the provider would read them from /me; a team not listed has team names alone. */
  flags: Map<string, TeamFlags>
  vaultKeyHeld: boolean
  readFails: boolean
  warn: Mock<Warn>
  session: TeamNamesSession
}

async function person(server: FakeServer, id: string, name: string | undefined, email = 'x@example.com'): Promise<Person> {
  // Mutable on purpose: tests change the name, the address or the flags, or take the vault key away mid-session.
  const p = { id, vmk: await newVmk(), name, email, flags: new Map<string, TeamFlags>(), vaultKeyHeld: true, readFails: false, warn: vi.fn<Warn>() }
  const deps: SessionDeps = {
    userId: id,
    api: server.api(id),
    flagsFor: (team) => p.flags.get(team) ?? NAMES_ONLY,
    loadVaultKey: async () => (p.vaultKeyHeld ? p.vmk : null),
    readVault: async () => {
      if (p.readFails) throw new Error('network')
      return { email: p.email, ...(p.name === undefined ? {} : { display_name: p.name }) }
    },
    prove: async (password) => {
      if (password === 'unreachable') throw new Error('Network error, please try again.')
      if (password !== 'correct horse') throw new InvalidCredentialsError()
      return server.mint()
    },
    warn: p.warn,
  }
  return Object.assign(p, { session: new TeamNamesSession(deps) })
}

/** A person whose first visit with the vault open published their key (R72). */
async function keyed(server: FakeServer, id: string, name: string | undefined, email?: string): Promise<Person> {
  const p = await person(server, id, name, email)
  await p.session.start()
  expect(p.session.getSnapshot().status).toBe('ready')
  return p
}

describe('session start', () => {
  it('is locked without the vault key, and publishes nothing', async () => {
    const server = new FakeServer()
    const a = await person(server, A, 'Ada')
    a.vaultKeyHeld = false
    await a.session.start()
    expect(a.session.getSnapshot().status).toBe('locked')
    expect(server.events).not.toContain('publish:start')
    expect(server.keys.size).toBe(0)
  })

  it('opens the served key on a new device, with no password and no new key', async () => {
    const server = new FakeServer()
    const first = await keyed(server, A, 'Ada')
    const second = await person(server, A, 'Ada')
    second.vmk = first.vmk
    server.events.length = 0
    await second.session.start()
    expect(second.session.getSnapshot().status).toBe('ready')
    expect(second.session.getSnapshot().firstKey).toBeUndefined()
    expect(server.events).not.toContain('publish:start')
  })

  it('cannot open an envelope sealed under another vault key, and offers the reset', async () => {
    const server = new FakeServer()
    await keyed(server, A, 'Ada')
    const other = await person(server, A, 'Ada') // a different vault key
    await other.session.start()
    expect(other.session.getSnapshot().status).toBe('cannot_open')
  })

  it('refuses a served key that contradicts the envelope, or whose key id is not its SHA-256 (the own-key check)', async () => {
    const server = new FakeServer()
    const a = await keyed(server, A, 'Ada')
    const row = server.keys.get(A) as KeyRow
    const impostor = (await createIdentity(vaultOpsFor(await newVmk()))).identity.publicKey
    server.keys.set(A, { ...row, publicKey: impostor, keyId: sha256(impostor) })
    const again = await person(server, A, 'Ada')
    again.vmk = a.vmk
    await again.session.start()
    expect(again.session.getSnapshot().status).toBe('key_mismatch')

    server.keys.set(A, { ...row, keyId: sha256(new Uint8Array([1])) })
    const third = await person(server, A, 'Ada')
    third.vmk = a.vmk
    await third.session.start()
    expect(third.session.getSnapshot().status).toBe('key_mismatch')
  })
})

describe('the first key (R72)', () => {
  it('is published at the first visit with the vault open, with no password, and seals nothing before the POST answers', async () => {
    const server = new FakeServer()
    const b = await keyed(server, B, 'Bob')
    server.events.length = 0
    const a = await person(server, A, 'Ada')
    const mint = vi.spyOn(server, 'mint')
    await a.session.start()
    expect(mint).not.toHaveBeenCalled()
    expect(a.session.getSnapshot()).toMatchObject({ status: 'ready', firstKey: true })
    const row = server.keys.get(A) as KeyRow
    expect(row.publicKey.length).toBe(65)
    expect(row.sealedPrivateKey.length).toBe(219)
    expect(server.events).not.toContain('write') // the session seals nothing on its own; the provider asks
    // The provider then shares the name in every team with the beta at once.
    await a.session.reconcileAll([TEAM])
    expect(server.events.indexOf('publish:end')).toBeLessThan(server.events.indexOf('write'))
    expect(server.events.filter((e) => e === 'write')).toHaveLength(1)
    // B's next session reads Ada.
    await b.session.reconcile(TEAM)
    expect(b.session.getSnapshot().teams.get(TEAM)?.names.get(A)).toEqual({ name: 'Ada', former: false })
  })

  it('leaves the error state when the POST fails, not a password prompt, and retry publishes', async () => {
    const server = new FakeServer()
    const a = await person(server, A, 'Ada')
    server.failNextPublish = true
    await a.session.start()
    expect(a.session.getSnapshot().status).toBe('error')
    expect(a.warn).toHaveBeenCalledWith('team_names/request_failed')
    expect(server.keys.size).toBe(0)
    await a.session.retry()
    expect(a.session.getSnapshot()).toMatchObject({ status: 'ready', firstKey: true })
    expect(server.keys.size).toBe(1)
  })

  it('refuses a first key the server answers with another key id (the own-key check), and seals nothing', async () => {
    const server = new FakeServer()
    await keyed(server, B, 'Bob')
    const a = await person(server, A, 'Ada')
    const api = server.api(A)
    const s = new TeamNamesSession({
      userId: A,
      api: { ...api, publishKey: async (body) => ({ ...(await api.publishKey(body)), keyId: sha256(new Uint8Array([1])) }) },
      flagsFor: () => NAMES_ONLY,
      loadVaultKey: async () => a.vmk,
      readVault: async () => ({ email: 'x@example.com', display_name: 'Ada' }),
      prove: async () => { throw new Error('unused') },
      warn: a.warn,
    })
    await s.start()
    expect(s.getSnapshot().status).toBe('key_mismatch')
    expect(s.getSnapshot().firstKey).toBeUndefined()
    expect(a.warn).toHaveBeenCalledWith('team_names/own_key_mismatch', { userId: A })
    server.events.length = 0
    await s.reconcileAll([TEAM])
    expect(server.events).not.toContain('write')
  })

  it('adopts the key another device published first, opened with the same vault key', async () => {
    const server = new FakeServer()
    const a = await person(server, A, 'Ada')
    await keyed(server, B, 'Bob')
    // Another browser of A's, same vault key, publishes between A's read and A's insert.
    const won: { key: Bytes | null } = { key: null }
    server.beforeInsert = async (caller) => {
      const other = await createIdentity(vaultOpsFor(a.vmk))
      won.key = other.identity.publicKey
      server.keys.set(caller, { keyId: sha256(other.identity.publicKey), publicKey: other.identity.publicKey, sealedPrivateKey: other.envelope })
    }
    await a.session.start()
    expect(a.session.getSnapshot().status).toBe('ready')
    // The other device published, so its session is the one that shares the name everywhere.
    expect(a.session.getSnapshot().firstKey).toBeUndefined()
    if (!won.key) throw new Error('the race did not run')
    expect(same((server.keys.get(A) as KeyRow).publicKey, won.key)).toBe(true)
    // The rows A writes name the winner's key id.
    await a.session.reconcile(TEAM)
    const written = server.rows.filter((r) => r.sender === A)
    expect(written).toHaveLength(1)
    expect(same(written[0].senderKeyId, sha256(won.key))).toBe(true)
  })

  it('ends with one key when two devices start at once: one publishes, the other adopts it', async () => {
    const server = new FakeServer()
    const first = await person(server, A, 'Ada')
    const second = await person(server, A, 'Ada')
    second.vmk = first.vmk
    await Promise.all([first.session.start(), second.session.start()])
    // Both read no key and both sent a POST: the race ran, and the server kept the first.
    expect(server.events.filter((e) => e === 'publish:start')).toHaveLength(2)
    expect(first.session.getSnapshot().status).toBe('ready')
    expect(second.session.getSnapshot().status).toBe('ready')
    expect(server.keys.size).toBe(1)
    expect([first, second].filter((p) => p.session.getSnapshot().firstKey === true)).toHaveLength(1)
  })

  it('offers the reset when the winning device’s envelope does not open here', async () => {
    const server = new FakeServer()
    const a = await person(server, A, 'Ada')
    server.beforeInsert = async (caller) => {
      const other = await createIdentity(vaultOpsFor(await newVmk()))
      server.keys.set(caller, { keyId: sha256(other.identity.publicKey), publicKey: other.identity.publicKey, sealedPrivateKey: other.envelope })
    }
    await a.session.start()
    expect(a.session.getSnapshot().status).toBe('cannot_open')
    await a.session.reconcile(TEAM)
    expect(server.rows.filter((r) => r.sender === A)).toHaveLength(0)
  })
})

describe('the reset', () => {
  it('replaces the key, deletes every row of the old one in both directions, and teammates re-seal', async () => {
    const server = new FakeServer()
    const a = await keyed(server, A, 'Ada')
    const b = await keyed(server, B, 'Bob')
    await a.session.reconcile(TEAM)
    await b.session.reconcile(TEAM)
    expect(server.rows).toHaveLength(2)
    const lost = await person(server, A, 'Ada') // a device whose vault key does not open the envelope
    await lost.session.start()
    expect(lost.session.getSnapshot().status).toBe('cannot_open')
    await lost.session.reset('correct horse', [TEAM])
    expect(lost.session.getSnapshot().status).toBe('ready')
    // Only A's new row for B exists; B's row for A's old key went with the reset.
    expect(server.rows.map((r) => `${r.sender}>${r.recipient}`)).toEqual([`${A}>${B}`])
    await b.session.reconcile(TEAM)
    await lost.session.reconcile(TEAM)
    expect(lost.session.getSnapshot().teams.get(TEAM)?.names.get(B)?.name).toBe('Bob')
  })

  /** A's key, published from another device, and this device's vault key, which does not open it. */
  async function cannotOpen(server: FakeServer): Promise<Person> {
    await keyed(server, A, 'Ada')
    const lost = await person(server, A, 'Ada')
    await lost.session.start()
    expect(lost.session.getSnapshot().status).toBe('cannot_open')
    server.events.length = 0
    return lost
  }

  it('takes no key without the password, and maps the failure to a coded error that keeps its cause', async () => {
    const server = new FakeServer()
    const lost = await cannotOpen(server)
    const before = server.keys.get(A)
    const err = await lost.session.reset('wrong', [TEAM]).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TeamNamesError)
    expect((err as TeamNamesError).code).toBe('team_names/password_failed')
    expect(((err as TeamNamesError).cause as Error).message).toBe('tessera: invalid credentials')
    expect(server.keys.get(A)).toBe(before)
    expect(server.events).not.toContain('reset')
    expect(lost.session.getSnapshot().status).toBe('cannot_open')
  })

  it('asks for the password again when the proof is refused, and logs no token', async () => {
    const server = new FakeServer()
    const lost = await cannotOpen(server)
    vi.spyOn(server, 'mint').mockReturnValueOnce('tmk-token-never-issued-do-not-log')
    const err = await lost.session.reset('correct horse', [TEAM]).catch((e: unknown) => e)
    expect((err as TeamNamesError).code).toBe('team_names/reauth_required')
    expect(`${(err as Error).message} ${(err as Error).stack}`).not.toContain('do-not-log')
    expect(lost.session.getSnapshot().status).toBe('cannot_open')
    // Asked again, with a token Ciphera ID will accept, it goes through.
    await lost.session.reset('correct horse', [TEAM])
    expect(lost.session.getSnapshot().status).toBe('ready')
  })

  it('treats a ceremony that failed for another reason as the error state, not the password prompt', async () => {
    const server = new FakeServer()
    const lost = await cannotOpen(server)
    const err = await lost.session.reset('unreachable', [TEAM]).catch((e: unknown) => e)
    // Its own code: the reset says Ciphera ID's words for it, and Pulse's only for a refused key.
    expect((err as TeamNamesError).code).toBe('team_names/proof_failed')
    expect(((err as TeamNamesError).cause as Error).message).toMatch(/Network error/)
    expect(lost.session.getSnapshot().status).toBe('error')
    expect(server.events).not.toContain('reset')
    // retry reads the key again, which still does not open here.
    await lost.session.retry()
    expect(lost.session.getSnapshot().status).toBe('cannot_open')
  })

  it('spends no token when the vault key has gone since the session began', async () => {
    const server = new FakeServer()
    const lost = await cannotOpen(server)
    const mint = vi.spyOn(server, 'mint')
    lost.vaultKeyHeld = false
    await expect(lost.session.reset('correct horse', [TEAM])).rejects.toMatchObject({ code: 'team_names/not_ready' })
    expect(mint).not.toHaveBeenCalled()
    expect(lost.session.getSnapshot().status).toBe('locked')
  })

  it('is refused while locked or in the error state', async () => {
    const server = new FakeServer()
    const a = await person(server, A, 'Ada')
    a.vaultKeyHeld = false
    await a.session.start()
    await expect(a.session.reset('correct horse', [TEAM])).rejects.toMatchObject({ code: 'team_names/not_ready' })
    const b = await person(server, B, 'Bob')
    server.failNextPublish = true
    await b.session.start()
    expect(b.session.getSnapshot().status).toBe('error')
    await expect(b.session.reset('correct horse', [TEAM])).rejects.toMatchObject({ code: 'team_names/not_ready' })
  })
})

describe('reconcile', () => {
  it('shares my name, reads theirs, marks a sender who left as former, and never seals for them', async () => {
    const server = new FakeServer()
    const a = await keyed(server, A, 'Ada')
    const b = await keyed(server, B, 'Bob')
    const c = await keyed(server, C, 'Cleo')
    for (const p of [a, b, c]) await p.session.reconcile(TEAM)
    await a.session.reconcile(TEAM)
    const names = a.session.getSnapshot().teams.get(TEAM)?.names
    expect(names?.get(B)?.name).toBe('Bob')
    expect(names?.get(C)?.name).toBe('Cleo')

    server.leave(TEAM, C)
    server.events.length = 0
    await a.session.reconcile(TEAM)
    expect(a.session.getSnapshot().teams.get(TEAM)?.names.get(C)).toEqual({ name: 'Cleo', former: true })
    expect(server.events).not.toContain('write') // nothing new to seal, and nothing for C
    expect(server.rows.some((r) => r.recipient === C)).toBe(false)
  })

  it('reads again once after a 409, and stops there', async () => {
    const server = new FakeServer()
    await keyed(server, B, 'Bob')
    const a = await keyed(server, A, 'Ada')
    server.conflictsLeft = 1
    server.events.length = 0
    await a.session.reconcile(TEAM)
    expect(server.events.filter((e) => e === 'write')).toHaveLength(2)
    expect(server.rows.filter((r) => r.sender === A)).toHaveLength(1)

    server.rows = []
    server.conflictsLeft = 10
    server.events.length = 0
    await a.session.reconcile(TEAM)
    expect(server.events.filter((e) => e === 'write')).toHaveLength(2)
    expect(a.warn).toHaveBeenCalledWith('team_names/stale_key')
  })

  it('withdraws every row when the name is cleared', async () => {
    const server = new FakeServer()
    await keyed(server, B, 'Bob')
    const a = await keyed(server, A, 'Ada')
    await a.session.reconcile(TEAM)
    expect(server.rows.filter((r) => r.sender === A)).toHaveLength(1)
    a.name = undefined
    await a.session.reconcile(TEAM)
    expect(server.events).toContain('withdraw')
    expect(server.rows.filter((r) => r.sender === A)).toHaveLength(0)
    expect(a.session.getSnapshot().share).toBe('none')
  })

  it('never writes or withdraws when the name cannot be read, and still reads names', async () => {
    const server = new FakeServer()
    const b = await keyed(server, B, 'Bob')
    const a = await keyed(server, A, 'Ada')
    await b.session.reconcile(TEAM)
    a.readFails = true
    server.events.length = 0
    await a.session.reconcile(TEAM)
    expect(server.events.filter((e) => e === 'write' || e === 'withdraw')).toEqual([])
    expect(a.session.getSnapshot().teams.get(TEAM)?.names.get(B)?.name).toBe('Bob')
  })

  it('drops the key and every name when the vault key is gone (expiry, or Lock in another tab)', async () => {
    const server = new FakeServer()
    const b = await keyed(server, B, 'Bob')
    const a = await keyed(server, A, 'Ada')
    await b.session.reconcile(TEAM)
    await a.session.reconcile(TEAM)
    expect(a.session.getSnapshot().teams.get(TEAM)?.names.size).toBe(1)
    a.vaultKeyHeld = false
    await a.session.reconcile(TEAM)
    expect(a.session.getSnapshot()).toMatchObject({ status: 'locked', share: null })
    expect(a.session.getSnapshot().teams.size).toBe(0)
  })

  it('re-seals a row a stolen session replaced behind the genuine enc and tag, and the recipient reads the name again (review M1)', async () => {
    const server = new FakeServer()
    const a = await keyed(server, A, 'Ada')
    const b = await keyed(server, B, 'Bob')
    await a.session.reconcile(TEAM)
    await b.session.reconcile(TEAM)
    expect(b.session.getSnapshot().teams.get(TEAM)?.names.get(A)?.name).toBe('Ada')

    // A's session in other hands: every field of A's row for B kept but the 528 bytes behind the enc.
    const genuine = server.rows.find((r) => r.team === TEAM && r.sender === A && r.recipient === B) as Row
    const replaced = new Uint8Array(genuine.sealed)
    replaced.set(crypto.getRandomValues(new Uint8Array(528)), 1 + 65)
    const stolen = server.api(A)
    expect(await stolen.writeNames(TEAM, [{ recipientId: B, recipientKeyId: genuine.recipientKeyId, senderKeyId: genuine.senderKeyId, nameTag: genuine.nameTag, sealed: replaced }]))
      .toEqual({ kind: 'written' })
    await b.session.reconcile(TEAM)
    expect(b.session.getSnapshot().teams.get(TEAM)?.names.has(A)).toBe(false)
    expect(b.warn).toHaveBeenCalledWith('team_names/open_failed', { userId: A })

    // A's next reconcile does not take it for its own current row.
    server.events.length = 0
    await a.session.reconcile(TEAM)
    expect(server.events).toContain('write')
    await b.session.reconcile(TEAM)
    expect(b.session.getSnapshot().teams.get(TEAM)?.names.get(A)?.name).toBe('Ada')
  })

  it('re-seals, in another team, a row a stolen session copied there byte for byte (review M1)', async () => {
    const server = new FakeServer()
    server.members.set(OTHER_TEAM, new Set([A, B]))
    const a = await keyed(server, A, 'Ada')
    const b = await keyed(server, B, 'Bob')
    await a.session.reconcile(TEAM)

    const genuine = server.rows.find((r) => r.team === TEAM && r.sender === A && r.recipient === B) as Row
    const stolen = server.api(A)
    expect(await stolen.writeNames(OTHER_TEAM, [{ recipientId: B, recipientKeyId: genuine.recipientKeyId, senderKeyId: genuine.senderKeyId, nameTag: genuine.nameTag, sealed: genuine.sealed }]))
      .toEqual({ kind: 'written' })
    await b.session.reconcile(OTHER_TEAM)
    expect(b.session.getSnapshot().teams.get(OTHER_TEAM)?.names.has(A)).toBe(false)

    server.events.length = 0
    await a.session.reconcile(OTHER_TEAM)
    expect(server.events).toContain('write')
    await b.session.reconcile(OTHER_TEAM)
    expect(b.session.getSnapshot().teams.get(OTHER_TEAM)?.names.get(A)?.name).toBe('Ada')
  })

  it('refuses to go on when the directory serves another key for me', async () => {
    const server = new FakeServer()
    const a = await keyed(server, A, 'Ada')
    await keyed(server, B, 'Bob')
    const impostor = (await createIdentity(vaultOpsFor(await newVmk()))).identity.publicKey
    const api = server.api(A)
    const answer = await api.fetchDirectory(TEAM, vi.fn())
    if (answer.kind !== 'directory') throw new Error('no directory')
    const swapped: DirectoryAnswer = { kind: 'directory', directory: { ...answer.directory, keys: answer.directory.keys.map((k) => (k.userId === A ? { ...k, publicKey: impostor } : k)) } }
    const s2 = new TeamNamesSession({
      userId: A, api: { ...api, fetchDirectory: async () => swapped }, flagsFor: () => NAMES_ONLY, loadVaultKey: async () => a.vmk,
      readVault: async () => ({ email: 'x@example.com', display_name: 'Ada' }), prove: async () => { throw new Error('unused') }, warn: vi.fn(),
    })
    await s2.start()
    expect(s2.getSnapshot().status).toBe('ready')
    server.events.length = 0
    await s2.reconcile(TEAM)
    expect(s2.getSnapshot().status).toBe('key_mismatch')
    expect(server.events).not.toContain('write')
  })
})

describe('dispose', () => {
  it('drops everything and lets work in flight write nothing', async () => {
    const server = new FakeServer()
    await keyed(server, B, 'Bob')
    const a = await keyed(server, A, 'Ada')
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    const api = server.api(A)
    const s = new TeamNamesSession({
      userId: A,
      api: { ...api, fetchDirectory: async (team, warn) => { await gate; return api.fetchDirectory(team, warn) } },
      flagsFor: () => NAMES_ONLY,
      loadVaultKey: async () => a.vmk,
      readVault: async () => ({ email: 'x@example.com', display_name: 'Ada' }),
      prove: async () => { throw new Error('unused') },
      warn: vi.fn(),
    })
    await s.start()
    const listener = vi.fn()
    s.subscribe(listener)
    server.events.length = 0
    server.rows = []
    const inFlight = s.reconcile(TEAM)
    s.dispose()
    release()
    await inFlight
    expect(server.events).not.toContain('write')
    expect(s.getSnapshot()).toEqual({ status: 'loading', share: null, teams: new Map() })
    await expect(s.reset('correct horse', [TEAM])).rejects.toMatchObject({ code: 'team_names/not_ready' })
  })
})

// ─── The email pass (design §16.4) ───────────────────────────────────────────────────────────────────────────────

describe('the email pass (design §16.4)', () => {
  /** The team: A the owner, B an admin, C a member, each keyed, each with the betas `flags`. */
  async function team(flags: TeamFlags) {
    const server = new FakeServer()
    const a = await keyed(server, A, 'Ada', 'ada@example.com')
    const b = await keyed(server, B, 'Bob', 'bob@example.com')
    const c = await keyed(server, C, 'Cleo', 'cleo@example.com')
    for (const p of [a, b, c]) p.flags.set(TEAM, flags)
    return { server, a, b, c }
  }
  const teamOf = (p: Person) => p.session.getSnapshot().teams.get(TEAM)
  const emailsOf = (p: Person) => Object.fromEntries([...(teamOf(p)?.emails ?? new Map())])
  const sealedBy = (server: FakeServer, sender: string) => server.emailRows.filter((r) => r.sender === sender).map((r) => r.recipient).sort()
  const emailEvents = (server: FakeServer) => server.events.filter((e) => e.startsWith('email-'))

  it('seals my address for every owner and admin the server lists, never for a member or myself; an owner or admin opens it, a member opens none', async () => {
    const { server, a, b, c } = await team(BOTH)
    for (const p of [c, b, a]) await p.session.reconcile(TEAM)
    expect(sealedBy(server, C)).toEqual([A, B].sort())
    expect(sealedBy(server, B)).toEqual([A])
    expect(sealedBy(server, A)).toEqual([B])
    for (const p of [a, b, c]) await p.session.reconcile(TEAM)
    expect(emailsOf(a)).toEqual({ [B]: { email: 'bob@example.com', former: false }, [C]: { email: 'cleo@example.com', former: false } })
    expect(emailsOf(b)).toEqual({ [A]: { email: 'ada@example.com', former: false }, [C]: { email: 'cleo@example.com', former: false } })
    expect(emailsOf(c)).toEqual({})
    expect(teamOf(c)?.emailStatus).toBe('ready')
    // The names went their own way, as before: every teammate's, to everyone.
    expect(teamOf(c)?.names.get(A)?.name).toBe('Ada')
    expect(teamOf(a)?.names.get(C)?.name).toBe('Cleo')
  })

  it('writes nothing on the next visit: every row is current', async () => {
    const { server, a, b, c } = await team(BOTH)
    for (const p of [a, b, c]) await p.session.reconcile(TEAM)
    server.events.length = 0
    for (const p of [a, b, c]) await p.session.reconcile(TEAM)
    expect(emailEvents(server)).toEqual([])
  })

  it('in a team with only team emails: seals and opens addresses, and never reads the names directory', async () => {
    const { server, a, c } = await team(EMAILS_ONLY)
    server.reads = { names: 0, emails: 0 }
    await c.session.reconcile(TEAM)
    await a.session.reconcile(TEAM)
    expect(server.reads).toEqual({ names: 0, emails: 2 })
    expect(server.rows).toEqual([])
    expect(server.events).not.toContain('write')
    expect(emailsOf(a)).toEqual({ [C]: { email: 'cleo@example.com', former: false } })
    expect(teamOf(a)).toMatchObject({ status: 'loading', emailStatus: 'ready' })
    expect(teamOf(a)?.names.size).toBe(0)
    expect(teamOf(a)?.memberIds).toEqual(new Set([A, B, C]))
  })

  it('in a team without team emails: no email route is called and nothing is opened', async () => {
    const { server, a, b, c } = await team(NAMES_ONLY)
    server.reads = { names: 0, emails: 0 }
    for (const p of [a, b, c]) await p.session.reconcile(TEAM)
    expect(server.reads).toEqual({ names: 3, emails: 0 })
    expect(emailEvents(server)).toEqual([])
    expect(server.emailRows).toEqual([])
    expect(teamOf(a)).toMatchObject({ status: 'ready', emailStatus: 'off' })
    expect(teamOf(a)?.emails.size).toBe(0)
  })

  it('marks the addresses, never the names, when the email pass fails; addresses read before a failed write stay shown', async () => {
    const { server, a, b, c } = await team(BOTH)
    for (const p of [b, c]) await p.session.reconcile(TEAM)
    server.failNextEmailRead = true
    await a.session.reconcile(TEAM)
    expect(teamOf(a)).toMatchObject({ status: 'ready', emailStatus: 'error' })
    expect(teamOf(a)?.names.get(B)?.name).toBe('Bob')
    expect(a.warn).toHaveBeenCalledWith('team_names/request_failed')

    // Nothing of A's left on the server, so the next pass writes; the write fails after the addresses were opened.
    server.emailRows = server.emailRows.filter((r) => r.sender !== A)
    server.failNextEmailWrite = true
    await a.session.reconcile(TEAM)
    expect(teamOf(a)).toMatchObject({ status: 'ready', emailStatus: 'error' })
    expect(emailsOf(a)[B]).toEqual({ email: 'bob@example.com', former: false })
    expect(teamOf(a)?.names.get(C)?.name).toBe('Cleo')
  })

  it('runs the email pass even when the names directory fails, and marks only the names', async () => {
    const { server, a, c } = await team(BOTH)
    await c.session.reconcile(TEAM)
    const api = server.api(A)
    const s = new TeamNamesSession({
      userId: A,
      api: { ...api, fetchDirectory: async () => { throw new TeamNamesError('team_names/request_failed') } },
      flagsFor: () => BOTH,
      loadVaultKey: async () => a.vmk,
      readVault: async () => ({ email: 'ada@example.com', display_name: 'Ada' }),
      prove: async () => { throw new Error('unused') },
      warn: vi.fn(),
    })
    await s.start()
    await s.reconcile(TEAM)
    expect(s.getSnapshot().teams.get(TEAM)).toMatchObject({ status: 'error', emailStatus: 'ready' })
    expect(s.getSnapshot().teams.get(TEAM)?.emails.get(C)?.email).toBe('cleo@example.com')
  })

  it('reads again once after a 409, and stops there', async () => {
    const { server, c } = await team(BOTH)
    server.emailConflictsLeft = 1
    server.events.length = 0
    await c.session.reconcile(TEAM)
    expect(server.events.filter((e) => e === 'email-write')).toHaveLength(2)
    expect(sealedBy(server, C)).toEqual([A, B].sort())

    server.emailRows = []
    server.emailConflictsLeft = 10
    server.events.length = 0
    await c.session.reconcile(TEAM)
    expect(server.events.filter((e) => e === 'email-write')).toHaveLength(2)
    expect(c.warn).toHaveBeenCalledWith('team_names/stale_key')
    expect(server.emailRows).toEqual([])
    // A refusal is not a failure: the addresses' state stays readable.
    expect(teamOf(c)?.emailStatus).toBe('ready')
  })

  it('re-seals for every owner and admin when the address changes: the tag binds it', async () => {
    const { server, a, b, c } = await team(BOTH)
    for (const p of [c, a]) await p.session.reconcile(TEAM)
    c.email = 'cleo@new.example.com'
    server.events.length = 0
    await c.session.reconcile(TEAM)
    expect(server.events.filter((e) => e === 'email-write')).toHaveLength(1)
    await a.session.reconcile(TEAM)
    await b.session.reconcile(TEAM)
    expect(emailsOf(a)[C]?.email).toBe('cleo@new.example.com')
    expect(emailsOf(b)[C]?.email).toBe('cleo@new.example.com')
  })

  it('takes every address row back when the vault\'s address cannot be shared, and asks nothing when none was sent', async () => {
    const { server, c } = await team(BOTH)
    await c.session.reconcile(TEAM)
    expect(sealedBy(server, C)).toHaveLength(2)
    c.email = 'not an address'
    server.events.length = 0
    await c.session.reconcile(TEAM)
    expect(emailEvents(server)).toEqual(['email-withdraw'])
    expect(sealedBy(server, C)).toEqual([])
    server.events.length = 0
    await c.session.reconcile(TEAM)
    expect(emailEvents(server)).toEqual([])
  })

  it('never writes or withdraws an address when the vault cannot be read, and still opens what was sealed for me', async () => {
    const { server, a, c } = await team(BOTH)
    await c.session.reconcile(TEAM)
    a.readFails = true
    server.events.length = 0
    await a.session.reconcile(TEAM)
    expect(emailEvents(server)).toEqual([])
    expect(emailsOf(a)[C]?.email).toBe('cleo@example.com')
  })

  it('opens a former member\'s kept address, marked former, and seals nothing for them', async () => {
    const { server, a, c } = await team(BOTH)
    await c.session.reconcile(TEAM)
    server.leave(TEAM, C)
    await a.session.reconcile(TEAM)
    expect(emailsOf(a)[C]).toEqual({ email: 'cleo@example.com', former: true })
    expect(server.emailRows.some((r) => r.recipient === C)).toBe(false)
  })

  it('a demoted admin is served no address, and their next reconcile drops the ones they held', async () => {
    const { server, a, b, c } = await team(BOTH)
    for (const p of [a, c, b]) await p.session.reconcile(TEAM)
    expect(Object.keys(emailsOf(b)).sort()).toEqual([A, C].sort())
    server.setRole(TEAM, B, 'member')
    await b.session.reconcile(TEAM)
    expect(emailsOf(b)).toEqual({})
    // Nobody seals for the member any more: the rows for them went with the role.
    server.events.length = 0
    await c.session.reconcile(TEAM)
    expect(emailEvents(server)).toEqual([])
    expect(sealedBy(server, C)).toEqual([A])
  })

  it('flags two people showing one address, and a teammate showing mine, case-insensitively', async () => {
    const { a, b, c } = await team(BOTH)
    c.email = 'bob@example.com'
    for (const p of [b, c]) await p.session.reconcile(TEAM)
    await a.session.reconcile(TEAM)
    expect([...(teamOf(a)?.emailDuplicates ?? [])].sort()).toEqual([B, C].sort())
    c.email = 'ADA@EXAMPLE.com'
    await c.session.reconcile(TEAM)
    await a.session.reconcile(TEAM)
    expect(teamOf(a)?.emailDuplicates.has(C)).toBe(true)
    expect(teamOf(a)?.emailDuplicates.has(B)).toBe(false)
  })

  it('shows no address for a team too large to serve them', async () => {
    const { server, a } = await team(BOTH)
    const api = server.api(A)
    const s = new TeamNamesSession({
      userId: A,
      api: { ...api, fetchEmailDirectory: async () => ({ kind: 'too_large' }) },
      flagsFor: () => BOTH,
      loadVaultKey: async () => a.vmk,
      readVault: async () => ({ email: 'ada@example.com', display_name: 'Ada' }),
      prove: async () => { throw new Error('unused') },
      warn: vi.fn(),
    })
    await s.start()
    await s.reconcile(TEAM)
    expect(s.getSnapshot().teams.get(TEAM)).toMatchObject({ status: 'ready', emailStatus: 'too_large' })
    expect(s.getSnapshot().teams.get(TEAM)?.emails.size).toBe(0)
  })

  it('refuses to go on when the email directory serves another key for me', async () => {
    const { server, a, c } = await team(EMAILS_ONLY)
    await c.session.reconcile(TEAM)
    const impostor = (await createIdentity(vaultOpsFor(await newVmk()))).identity.publicKey
    const api = server.api(A)
    const s = new TeamNamesSession({
      userId: A,
      api: {
        ...api,
        fetchEmailDirectory: async (team, warn) => {
          const answer = await api.fetchEmailDirectory(team, warn)
          if (answer.kind !== 'directory') return answer
          return { kind: 'directory', directory: { ...answer.directory, keys: [...answer.directory.keys, { userId: A, publicKey: impostor }] } }
        },
      },
      flagsFor: () => EMAILS_ONLY,
      loadVaultKey: async () => a.vmk,
      readVault: async () => ({ email: 'ada@example.com', display_name: 'Ada' }),
      prove: async () => { throw new Error('unused') },
      warn: vi.fn(),
    })
    await s.start()
    server.events.length = 0
    await s.reconcile(TEAM)
    expect(s.getSnapshot().status).toBe('key_mismatch')
    expect(emailEvents(server)).toEqual([])
  })

  it('the first key seals the address too, in every team given (R72)', async () => {
    const server = new FakeServer()
    const a = await keyed(server, A, 'Ada', 'ada@example.com')
    const c = await person(server, C, 'Cleo', 'cleo@example.com')
    c.flags.set(TEAM, BOTH)
    await c.session.start()
    expect(c.session.getSnapshot()).toMatchObject({ status: 'ready', firstKey: true })
    await c.session.reconcileAll([TEAM])
    // B has no key yet, so only the owner is listed.
    expect(sealedBy(server, C)).toEqual([A])
    a.flags.set(TEAM, BOTH)
    await a.session.reconcile(TEAM)
    expect(emailsOf(a)[C]?.email).toBe('cleo@example.com')
  })

  it('a reset seals the address again, under the new key', async () => {
    const server = new FakeServer()
    const a = await keyed(server, A, 'Ada', 'ada@example.com')
    const c = await keyed(server, C, 'Cleo', 'cleo@example.com')
    for (const p of [a, c]) p.flags.set(TEAM, BOTH)
    await c.session.reconcile(TEAM)
    const lost = await person(server, C, 'Cleo', 'cleo@example.com') // a device whose vault key does not open the envelope
    lost.flags.set(TEAM, BOTH)
    await lost.session.start()
    expect(lost.session.getSnapshot().status).toBe('cannot_open')
    await lost.session.reset('correct horse', [TEAM])
    const row = server.emailRows.find((r) => r.sender === C && r.recipient === A)
    expect(row && same(row.senderKeyId, (server.keys.get(C) as KeyRow).keyId)).toBe(true)
    await a.session.reconcile(TEAM)
    expect(emailsOf(a)[C]?.email).toBe('cleo@example.com')
  })
})
