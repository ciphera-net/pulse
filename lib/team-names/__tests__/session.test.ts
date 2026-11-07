// @vitest-environment node
//
// The session engine against a fake pulse-backend that keeps the routes' contract (design §6.2):
// POST /me/team-key never overwrites and spends a token only when it writes; PUT resets and deletes
// every row in both directions; the directory serves current members' keys plus former senders with
// a kept row for the caller; PUT team-names upserts the caller's rows or answers 409; DELETE takes
// back every row the caller sent. Real cryptography throughout.

import { createHash } from 'node:crypto'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { InvalidCredentialsError, vaultOpsFor, type VaultKey } from '@ciphera-net/tessera'
import { createIdentity, rowEnc } from '@/lib/crypto/team-names'
import type { Bytes } from '@/lib/crypto/hpke'
import type { DirectoryAnswer, KeyRow, NameEntry, PublishKeyBody, Warn } from '../api'
import { TeamNamesError } from '../errors'
import { TeamNamesSession, type SessionDeps, type TeamNamesApi } from '../session'

const TEAM = '7e7e7e7e-0000-4000-8000-000000000001'
const A = 'a1a1a1a1-0000-4000-8000-000000000001'
const B = 'b2b2b2b2-0000-4000-8000-000000000002'
const C = 'c3c3c3c3-0000-4000-8000-000000000003'

const sha256 = (b: Uint8Array): Bytes => new Uint8Array(createHash('sha256').update(b).digest())
const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b))

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
        const existing = this.keys.get(caller)
        if (existing) return existing
        spend(body.reauthToken)
        await this.beforeInsert?.(caller)
        const winner = this.keys.get(caller)
        this.events.push('publish:end')
        return winner ?? insert(body)
      },
      resetKey: async (body) => {
        spend(body.reauthToken)
        this.rows = this.rows.filter((r) => r.sender !== caller && r.recipient !== caller)
        this.events.push('reset')
        return insert(body)
      },
      fetchMemberIds: async (team) => [...(this.members.get(team) ?? [])],
      fetchDirectory: async (team): Promise<DirectoryAnswer> => {
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
              .map((r) => ({ recipientId: r.recipient, recipientKeyId: r.recipientKeyId, nameTag: r.nameTag, enc: rowEnc(r.sealed) })),
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
  vaultKeyHeld: boolean
  readFails: boolean
  warn: Mock<Warn>
  session: TeamNamesSession
}

async function person(server: FakeServer, id: string, name: string | undefined): Promise<Person> {
  // Mutable on purpose: tests change the name or take the vault key away mid-session.
  const p = { id, vmk: await newVmk(), name, vaultKeyHeld: true, readFails: false, warn: vi.fn<Warn>() }
  const deps: SessionDeps = {
    userId: id,
    api: server.api(id),
    loadVaultKey: async () => (p.vaultKeyHeld ? p.vmk : null),
    readVault: async () => {
      if (p.readFails) throw new Error('network')
      return { email: 'x@example.com', ...(p.name === undefined ? {} : { display_name: p.name }) }
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

/** A person with a key already published (another browser of theirs did the one-time step). */
async function keyed(server: FakeServer, id: string, name: string | undefined): Promise<Person> {
  const p = await person(server, id, name)
  await p.session.start()
  await p.session.setUp('correct horse', [])
  expect(p.session.getSnapshot().status).toBe('ready')
  return p
}

describe('session start', () => {
  it('is locked without the vault key, and asks for the one-time step without a key', async () => {
    const server = new FakeServer()
    const a = await person(server, A, 'Ada')
    a.vaultKeyHeld = false
    await a.session.start()
    expect(a.session.getSnapshot().status).toBe('locked')
    const b = await person(server, B, 'Bob')
    await b.session.start()
    expect(b.session.getSnapshot().status).toBe('needs_setup')
  })

  it('opens the served key on a new device, with no password', async () => {
    const server = new FakeServer()
    const first = await keyed(server, A, 'Ada')
    const second = await person(server, A, 'Ada')
    second.vmk = first.vmk
    await second.session.start()
    expect(second.session.getSnapshot().status).toBe('ready')
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

describe('the one-time step', () => {
  it('publishes the key with the proof, and seals nothing before the POST answers', async () => {
    const server = new FakeServer()
    const b = await keyed(server, B, 'Bob')
    server.events.length = 0
    const a = await person(server, A, 'Ada')
    await a.session.start()
    const publish = vi.spyOn(server, 'mint')
    await a.session.setUp('correct horse', [TEAM])
    expect(publish).toHaveBeenCalledTimes(1)
    expect(a.session.getSnapshot().status).toBe('ready')
    const row = server.keys.get(A) as KeyRow
    expect(row.publicKey.length).toBe(65)
    expect(row.sealedPrivateKey.length).toBe(219)
    expect(server.tokens.size).toBe(0) // spent
    expect(server.events.indexOf('publish:end')).toBeLessThan(server.events.indexOf('write'))
    expect(server.events.filter((e) => e === 'write')).toHaveLength(1)
    // B's next session reads Ada.
    await b.session.reconcile(TEAM)
    expect(b.session.getSnapshot().teams.get(TEAM)?.names.get(A)).toEqual({ name: 'Ada', former: false })
  })

  it('takes no key without the password, and maps the failure to a coded error that keeps its cause', async () => {
    const server = new FakeServer()
    const a = await person(server, A, 'Ada')
    await a.session.start()
    const err = await a.session.setUp('wrong', [TEAM]).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TeamNamesError)
    expect((err as TeamNamesError).code).toBe('team_names/password_failed')
    expect(((err as TeamNamesError).cause as Error).message).toBe('tessera: invalid credentials')
    expect(server.keys.size).toBe(0)
    expect(server.events).not.toContain('publish:start')
    expect(a.session.getSnapshot().status).toBe('needs_setup')
  })

  it('keeps the step when the proof is refused, so the password is asked again, and logs no token', async () => {
    const server = new FakeServer()
    const a = await person(server, A, 'Ada')
    await a.session.start()
    vi.spyOn(server, 'mint').mockReturnValueOnce('tmk-token-never-issued-do-not-log')
    const err = await a.session.setUp('correct horse', [TEAM]).catch((e: unknown) => e)
    expect((err as TeamNamesError).code).toBe('team_names/reauth_required')
    expect(`${(err as Error).message} ${(err as Error).stack}`).not.toContain('do-not-log')
    expect(server.keys.size).toBe(0)
    expect(a.session.getSnapshot().status).toBe('needs_setup')
    // Asked again, with a token Ciphera ID will accept, it goes through.
    await a.session.setUp('correct horse', [TEAM])
    expect(a.session.getSnapshot().status).toBe('ready')
  })

  it('treats a ceremony that failed for another reason as the error state, not the password prompt', async () => {
    const server = new FakeServer()
    const a = await person(server, A, 'Ada')
    await a.session.start()
    const err = await a.session.setUp('unreachable', [TEAM]).catch((e: unknown) => e)
    expect((err as TeamNamesError).code).toBe('team_names/request_failed')
    expect(((err as TeamNamesError).cause as Error).message).toMatch(/Network error/)
    expect(a.session.getSnapshot().status).toBe('error')
    expect(server.events).not.toContain('publish:start')
  })

  it('turns any other failure into the error state, not a password prompt, and retry reads the key again', async () => {
    const server = new FakeServer()
    const a = await person(server, A, 'Ada')
    await a.session.start()
    server.failNextPublish = true
    await expect(a.session.setUp('correct horse', [TEAM])).rejects.toMatchObject({ code: 'team_names/request_failed' })
    expect(a.session.getSnapshot().status).toBe('error')
    await expect(a.session.setUp('correct horse', [TEAM])).rejects.toMatchObject({ code: 'team_names/not_ready' })
    await a.session.retry()
    expect(a.session.getSnapshot().status).toBe('needs_setup')
  })

  it('spends no token when the vault key has gone since the session began', async () => {
    const server = new FakeServer()
    const a = await person(server, A, 'Ada')
    await a.session.start()
    const mint = vi.spyOn(server, 'mint')
    a.vaultKeyHeld = false
    await expect(a.session.setUp('correct horse', [TEAM])).rejects.toMatchObject({ code: 'team_names/not_ready' })
    expect(mint).not.toHaveBeenCalled()
    expect(a.session.getSnapshot().status).toBe('locked')
  })

  it('adopts the key another device published first, opened with the same vault key', async () => {
    const server = new FakeServer()
    const a = await person(server, A, 'Ada')
    await a.session.start()
    await keyed(server, B, 'Bob')
    // Another browser of A's, same vault key, publishes between A's token check and A's insert.
    const won: { key: Bytes | null } = { key: null }
    server.beforeInsert = async (caller) => {
      const other = await createIdentity(vaultOpsFor(a.vmk))
      won.key = other.identity.publicKey
      server.keys.set(caller, { keyId: sha256(other.identity.publicKey), publicKey: other.identity.publicKey, sealedPrivateKey: other.envelope })
    }
    await a.session.setUp('correct horse', [TEAM])
    expect(a.session.getSnapshot().status).toBe('ready')
    if (!won.key) throw new Error('the race did not run')
    expect(same((server.keys.get(A) as KeyRow).publicKey, won.key)).toBe(true)
    // The rows A wrote name the winner's key id.
    const written = server.rows.filter((r) => r.sender === A)
    expect(written).toHaveLength(1)
    expect(same(written[0].senderKeyId, sha256(won.key))).toBe(true)
  })

  it('offers the reset when the winning device’s envelope does not open here', async () => {
    const server = new FakeServer()
    const a = await person(server, A, 'Ada')
    await a.session.start()
    server.beforeInsert = async (caller) => {
      const other = await createIdentity(vaultOpsFor(await newVmk()))
      server.keys.set(caller, { keyId: sha256(other.identity.publicKey), publicKey: other.identity.publicKey, sealedPrivateKey: other.envelope })
    }
    await a.session.setUp('correct horse', [TEAM])
    expect(a.session.getSnapshot().status).toBe('cannot_open')
    expect(server.rows.filter((r) => r.sender === A)).toHaveLength(0)
  })

  it('is refused outside the needs_setup state', async () => {
    const server = new FakeServer()
    const a = await keyed(server, A, 'Ada')
    await expect(a.session.setUp('correct horse', [TEAM])).rejects.toMatchObject({ code: 'team_names/not_ready' })
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
      userId: A, api: { ...api, fetchDirectory: async () => swapped }, loadVaultKey: async () => a.vmk,
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
    await expect(s.setUp('correct horse', [TEAM])).rejects.toMatchObject({ code: 'team_names/not_ready' })
  })
})
