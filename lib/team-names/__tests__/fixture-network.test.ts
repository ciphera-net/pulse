// The made-up team's network answers (./fixtures/network.ts) put through the real session and the real decoders of
// lib/team-names/api.ts: each state opens to what the browser check of the built pages expects to draw, and none
// leaves anything for the reconcile to write, so the check's read-only guard never sees a write attempted.

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { vaultOpsFor, type VaultKey } from '@ciphera-net/tessera'

const net = vi.hoisted(() => ({ body: null as null | Record<string, unknown>, calls: [] as string[] }))
vi.mock('@/lib/api/client', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api/client')>()
  return {
    ...actual,
    default: async (path: string, options: { method?: string } = {}) => {
      const method = options.method ?? 'GET'
      net.calls.push(`${method} ${path}`)
      const b = net.body as Record<string, unknown>
      if (method !== 'GET') throw new Error(`a write was attempted: ${method} ${path}`)
      if (path === '/me/team-key') {
        if (!b.teamKey) throw new actual.ApiError('Not found', 404)
        return b.teamKey
      }
      if (path.endsWith('/team-names')) return b.directory
      if (path.endsWith('/members')) return b.members
      throw new Error(`unexpected ${path}`)
    },
  }
})

import { decryptVaultH } from '@/lib/crypto/vault-ops'
import { fetchDirectory, fetchMemberIds, fetchOwnKey, publishKey, resetKey, withdrawNames, writeNames } from '../api'
import { TeamNamesSession } from '../session'
import { buildMadeUpNetwork, type MadeUpAccount } from './fixtures/network'
import { AMARA, GONE, JONAS, LENA, MAREN, TOMAS, type MadeUpState } from './fixtures/madeUpTeam'

const ME = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const TEAM = '2c1f74ec-0000-4000-8000-000000000001'
const VMK = new Uint8Array(32).fill(7)

async function open(state: MadeUpState, account: MadeUpAccount = 'set') {
  const body = await buildMadeUpNetwork({ teamId: TEAM, myId: ME, state, account, now: new Date('2026-11-07T12:00:00Z'), vmk: VMK })
  net.body = body as unknown as Record<string, unknown>
  const key = (await crypto.subtle.importKey('raw', VMK, 'HKDF', false, ['deriveKey'])) as VaultKey
  const session = new TeamNamesSession({
    userId: ME,
    api: { fetchOwnKey, publishKey, resetKey, fetchDirectory, fetchMemberIds, writeNames, withdrawNames },
    loadVaultKey: async () => key,
    readVault: (k) => decryptVaultH({ kind: 'opaque', vault: vaultOpsFor(k) }, body.vault.encrypted_vault),
    prove: async () => {
      throw new Error('the check never runs the password step')
    },
    warn: vi.fn(),
  })
  await session.start()
  if (session.getSnapshot().status === 'ready') await session.reconcile(TEAM)
  return session.getSnapshot()
}

const names = (snapshot: Awaited<ReturnType<typeof open>>) =>
  Object.fromEntries([...(snapshot.teams.get(TEAM)?.names ?? new Map())].map(([id, n]) => [id, `${n.name}${n.former ? ' (former)' : ''}`]))

beforeEach(() => {
  net.calls = []
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

  it('first: the one-time step', async () => {
    expect((await open('first')).status).toBe('needs_setup')
    expect((await open('named', 'first')).status).toBe('needs_setup')
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
