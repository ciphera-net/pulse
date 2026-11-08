// The made-up team's network answers (./fixtures/network.ts) put through the real session and the real decoders of
// lib/team-names/api.ts: each state opens to what the browser check of the built pages expects to draw. None but
// `first` leaves anything for the reconcile to write, so the check's read-only guard never sees a write attempted;
// `first` (no key yet) publishes a key with no proof and then shares the name, as the browser does since R72. With an
// email state the team-emails route answers too (design §16), and the same holds for addresses.

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { vaultOpsFor, type VaultKey } from '@ciphera-net/tessera'

const net = vi.hoisted(() => ({
  me: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  body: null as null | Record<string, unknown>,
  calls: [] as string[],
  /** The key the session published with POST /me/team-key, as the server would store it. */
  posted: null as null | { key_id: string; public_key: string; sealed_private_key: string },
  /** Rows written with PUT team-names after that POST. */
  written: 0,
  /** Rows written with PUT team-emails after that POST. */
  writtenEmails: 0,
}))
vi.mock('@/lib/api/client', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api/client')>()
  return {
    ...actual,
    default: async (path: string, options: { method?: string; body?: string } = {}) => {
      const method = options.method ?? 'GET'
      net.calls.push(`${method} ${path}`)
      const b = net.body as Record<string, unknown>
      // The two writes a person with no key makes (R72): the key, with no proof, then their name for the team.
      if (method === 'POST' && path === '/me/team-key') {
        const sent = JSON.parse(options.body ?? '{}') as Record<string, string>
        if (b.teamKey || net.posted || 'reauth_token' in sent) throw new Error(`a key POST that should not happen: ${Object.keys(sent)}`)
        const pub = Uint8Array.from(atob(sent.public_key), (ch) => ch.charCodeAt(0))
        const keyId = new Uint8Array(await crypto.subtle.digest('SHA-256', pub))
        net.posted = { key_id: btoa(String.fromCharCode(...keyId)), public_key: sent.public_key, sealed_private_key: sent.sealed_private_key }
        return net.posted
      }
      if (method === 'PUT' && path.endsWith('/team-names') && net.posted) {
        net.written += (JSON.parse(options.body ?? '{}') as { entries: unknown[] }).entries.length
        return null
      }
      if (method === 'PUT' && path.endsWith('/team-emails') && net.posted) {
        net.writtenEmails += (JSON.parse(options.body ?? '{}') as { entries: unknown[] }).entries.length
        return null
      }
      if (method !== 'GET') throw new Error(`a write was attempted: ${method} ${path}`)
      if (path === '/me/team-key') {
        const row = b.teamKey ?? net.posted
        if (!row) throw new actual.ApiError('Not found', 404)
        return row
      }
      if (path.endsWith('/team-names')) {
        // Once published, the server serves my key with the others.
        const directory = b.directory as { keys: { user_id: string; public_key: string }[] }
        return net.posted ? { ...directory, keys: [{ user_id: net.me, public_key: net.posted.public_key }, ...directory.keys] } : directory
      }
      if (path.endsWith('/members')) return b.members
      if (path.endsWith('/team-emails')) {
        // Without an email state the beta is off there: the router's own 404.
        if (!b.emailDirectory) throw new actual.ApiError('Not found', 404)
        return b.emailDirectory
      }
      throw new Error(`unexpected ${path}`)
    },
  }
})

import { decryptVaultH } from '@/lib/crypto/vault-ops'
import {
  fetchDirectory,
  fetchEmailDirectory,
  fetchMemberIds,
  fetchOwnKey,
  publishKey,
  resetKey,
  withdrawEmails,
  withdrawNames,
  writeEmails,
  writeNames,
} from '../api'
import { TeamNamesSession, type TeamFlags } from '../session'
import { buildMadeUpNetwork, type MadeUpAccount } from './fixtures/network'
import { AMARA, FORMER_EMAIL, GONE, JONAS, LENA, MADE_UP_PEOPLE, MAREN, TOMAS, type MadeUpEmailState, type MadeUpState } from './fixtures/madeUpTeam'

const ME = net.me
const TEAM = '2c1f74ec-0000-4000-8000-000000000001'
const VMK = new Uint8Array(32).fill(7)

async function open(state: MadeUpState, account: MadeUpAccount = 'set', opts: { emails?: MadeUpEmailState; flags?: TeamFlags } = {}) {
  const body = await buildMadeUpNetwork({ teamId: TEAM, myId: ME, state, account, now: new Date('2026-11-07T12:00:00Z'), vmk: VMK, emails: opts.emails })
  net.body = body as unknown as Record<string, unknown>
  const key = (await crypto.subtle.importKey('raw', VMK, 'HKDF', false, ['deriveKey'])) as VaultKey
  const session = new TeamNamesSession({
    userId: ME,
    api: { fetchOwnKey, publishKey, resetKey, fetchDirectory, fetchMemberIds, writeNames, withdrawNames, fetchEmailDirectory, writeEmails, withdrawEmails },
    // Team names alone unless a test says otherwise, as before team emails: then no email route is ever asked for.
    flagsFor: () => opts.flags ?? { names: true, emails: false },
    loadVaultKey: async () => key,
    readVault: (k) => decryptVaultH({ kind: 'opaque', vault: vaultOpsFor(k) }, body.vault.encrypted_vault),
    prove: async () => {
      throw new Error('no state asks for the password')
    },
    warn: vi.fn(),
  })
  await session.start()
  if (session.getSnapshot().status === 'ready') await session.reconcile(TEAM)
  return session.getSnapshot()
}

const names = (snapshot: Awaited<ReturnType<typeof open>>) =>
  Object.fromEntries([...(snapshot.teams.get(TEAM)?.names ?? new Map())].map(([id, n]) => [id, `${n.name}${n.former ? ' (former)' : ''}`]))

const emails = (snapshot: Awaited<ReturnType<typeof open>>) =>
  Object.fromEntries([...(snapshot.teams.get(TEAM)?.emails ?? new Map())].map(([id, e]) => [id, `${e.email}${e.former ? ' (former)' : ''}`]))
const addressOf = (id: string) => MADE_UP_PEOPLE.find((p) => p.id === id)?.email

beforeEach(() => {
  net.calls = []
  net.posted = null
  net.written = 0
  net.writtenEmails = 0
})

describe('the made-up team, through the real session', () => {
  it('named: every teammate and the former member, and nothing written', async () => {
    const s = await open('named')
    expect(s.status).toBe('ready')
    expect(names(s)).toEqual({
      [MAREN]: 'Maren Lindqvist',
      [AMARA]: 'Amara Okafor',
      [JONAS]: 'Jonas Weber',
      [LENA]: 'Lena Vogel',
      [TOMAS]: 'Tomás Ortega (former)',
    })
    expect(names(s)[GONE]).toBeUndefined()
    expect(s.share).toBe('name')
    expect(net.calls.filter((c) => !c.startsWith('GET'))).toEqual([])
  })

  it('partial: one name has not arrived', async () => {
    const s = await open('partial')
    expect(Object.keys(names(s))).not.toContain(AMARA)
    expect(Object.keys(names(s))).toHaveLength(4)
  })

  it('copies: two Marens and a member called Pulse, all flagged to show their ids', async () => {
    const s = await open('copies')
    expect(names(s)[AMARA]).toBe('Maren Lindqvist')
    expect(names(s)[LENA]).toBe('Pulse')
    expect([...(s.teams.get(TEAM)?.duplicates ?? [])].sort()).toEqual([AMARA, LENA, MAREN].sort())
  })

  it.each([
    ['first', 'set'],
    ['named', 'first'],
  ] as const)('no key yet (%s, %s): published with no step and no proof, then my name goes to every teammate (R72)', async (state, account) => {
    const s = await open(state, account)
    expect(s).toMatchObject({ status: 'ready', firstKey: true, share: 'name' })
    expect(net.calls.filter((c) => !c.startsWith('GET'))).toEqual(['POST /me/team-key', `PUT /organizations/${TEAM}/team-names`])
    expect(net.written).toBe(4) // the four current teammates; nothing for the former member
    // Nobody could seal a name for a key that did not exist: names arrive after each teammate's next visit.
    expect(names(s)).toEqual({})
  })

  it.each([
    ['noname', 'none'],
    ['long', 'too_long'],
  ] as const)('%s: names read, nothing shared and nothing taken back', async (account, share) => {
    const s = await open('named', account)
    expect(s.status).toBe('ready')
    expect(s.share).toBe(share)
    expect(net.calls.filter((c) => !c.startsWith('GET'))).toEqual([])
  })

  it('broken: a key this browser cannot open', async () => {
    expect((await open('named', 'broken')).status).toBe('cannot_open')
  })
})

describe('the made-up team\'s addresses (team emails), through the real session', () => {
  const BOTH = { names: true, emails: true }

  it('all: every teammate\'s address and the former member\'s kept one, beside every name, and nothing written', async () => {
    const s = await open('named', 'set', { emails: 'all', flags: BOTH })
    expect(s.status).toBe('ready')
    expect(emails(s)).toEqual({
      [MAREN]: addressOf(MAREN),
      [AMARA]: addressOf(AMARA),
      [JONAS]: addressOf(JONAS),
      [LENA]: addressOf(LENA),
      [TOMAS]: `${FORMER_EMAIL} (former)`,
    })
    expect(s.teams.get(TEAM)?.emailStatus).toBe('ready')
    expect(names(s)[MAREN]).toBe('Maren Lindqvist')
    expect(net.calls.filter((c) => !c.startsWith('GET'))).toEqual([])
  })

  it('partial: one admin\'s address has not arrived', async () => {
    const s = await open('named', 'set', { emails: 'partial', flags: BOTH })
    expect(Object.keys(emails(s))).not.toContain(AMARA)
    expect(Object.keys(emails(s))).toHaveLength(4)
  })

  it('team emails alone: the addresses arrive and the names directory is never asked for', async () => {
    const s = await open('named', 'set', { emails: 'all', flags: { names: false, emails: true } })
    expect(Object.keys(emails(s))).toHaveLength(5)
    expect(net.calls.some((c) => c.endsWith('/team-names'))).toBe(false)
    expect(names(s)).toEqual({})
    expect(net.calls.filter((c) => !c.startsWith('GET'))).toEqual([])
  })

  it('no key yet: published with no proof, then my name to every teammate and my address to the two admins (R72)', async () => {
    const s = await open('first', 'set', { emails: 'all', flags: BOTH })
    expect(s).toMatchObject({ status: 'ready', firstKey: true })
    expect(net.calls.filter((c) => !c.startsWith('GET'))).toEqual([
      'POST /me/team-key',
      `PUT /organizations/${TEAM}/team-names`,
      `PUT /organizations/${TEAM}/team-emails`,
    ])
    expect(net.written).toBe(4)
    expect(net.writtenEmails).toBe(2)
    expect(emails(s)).toEqual({})
  })
})
