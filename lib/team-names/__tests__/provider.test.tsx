// The provider and the hooks the surfaces will read: nothing runs or is fetched with the beta off,
// names arrive with it on, and the names and the private key leave memory on every path that ends
// the session without a reload (review L9): a sibling tab's sign-out or a definitive rejection (the
// user goes null), a vault-state change, and the Lock button, which changes neither.

import React, { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { vaultOpsFor, type VaultKey } from '@ciphera-net/tessera'

const A = 'a1a1a1a1-0000-4000-8000-000000000001'
const B = 'b2b2b2b2-0000-4000-8000-000000000002'
const C = 'c3c3c3c3-0000-4000-8000-000000000003'
const TEAM = '7e7e7e7e-0000-4000-8000-000000000001'
const OTHER_TEAM = '7e7e7e7e-0000-4000-8000-0000000000f2'

const h = vi.hoisted(() => {
  const listeners = new Set<(c: 'saved' | 'forgotten') => void>()
  return {
    auth: { user: null as { id: string; org_id?: string } | null, vaultState: 'unknown' as 'unknown' | 'open' | 'locked' },
    path: { current: '/settings/team' },
    getMe: vi.fn(),
    loadVaultKey: vi.fn(),
    openVaultWithKey: vi.fn(),
    api: {
      fetchOwnKey: vi.fn(),
      publishKey: vi.fn(),
      resetKey: vi.fn(),
      fetchDirectory: vi.fn(),
      fetchMemberIds: vi.fn(),
      writeNames: vi.fn(),
      withdrawNames: vi.fn(),
    },
    custody: {
      listeners,
      emit: (c: 'saved' | 'forgotten') => {
        for (const l of [...listeners]) l(c)
      },
    },
  }
})

vi.mock('@/lib/auth/context', () => ({ useAuth: () => h.auth }))
vi.mock('next/navigation', () => ({ usePathname: () => h.path.current }))
vi.mock('@/lib/api/me', () => ({ getMe: h.getMe }))
vi.mock('@/lib/auth/vault-store', () => ({
  loadVaultKey: h.loadVaultKey,
  onVaultKeyCustodyChange: (l: (c: 'saved' | 'forgotten') => void) => {
    h.custody.listeners.add(l)
    return () => h.custody.listeners.delete(l)
  },
}))
vi.mock('@/lib/auth/vault-restore', () => ({ openVaultWithKey: h.openVaultWithKey }))
vi.mock('@/lib/team-names/api', async (importActual) => ({ ...(await importActual<object>()), ...h.api }))

import { createIdentity, sealName, type TeamIdentity } from '@/lib/crypto/team-names'
import { TeamNamesProvider } from '../provider'
import { useTeamNames, useTeammateName, useTeamNamesActions } from '../hooks'

const me = (features: Record<string, string[]>) => ({
  user_id: A,
  default_team_id: TEAM,
  teams: Object.entries(features).map(([id, f]) => ({ id, name: id, slug: id, role: 'owner', onboarding_completed_at: null, last_active_at: null, joined_at: '2026-11-01T00:00:00Z', features: f })),
})

let vmk: VaultKey
let a: { identity: TeamIdentity; envelope: Uint8Array }
let b: TeamIdentity
let c: TeamIdentity

beforeEach(async () => {
  vmk = (await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), 'HKDF', false, ['deriveKey'])) as VaultKey
  a = await createIdentity(vaultOpsFor(vmk))
  b = (await createIdentity(vaultOpsFor(vmk))).identity
  c = (await createIdentity(vaultOpsFor(vmk))).identity
  const rowFrom = async (senderId: string, sender: TeamIdentity, name: string) => {
    const { sealed } = await sealName({ teamId: TEAM, senderId, recipientId: A, name, sender, recipientPublicKey: a.identity.publicKey, recipientKeyId: a.identity.keyId })
    return { senderId, senderKeyId: sender.keyId, recipientKeyId: a.identity.keyId, sealed }
  }
  const forMe = [await rowFrom(B, b, 'Bob'), await rowFrom(C, c, 'Cleo')]

  h.auth.user = { id: A, org_id: TEAM }
  h.auth.vaultState = 'open'
  h.path.current = '/settings/team'
  h.getMe.mockReset().mockResolvedValue(me({ [TEAM]: ['team-names'], [OTHER_TEAM]: [] }))
  h.loadVaultKey.mockReset().mockResolvedValue(vmk)
  h.openVaultWithKey.mockReset().mockResolvedValue({ email: 'x@example.com', display_name: 'Ada' })
  h.api.fetchOwnKey.mockReset().mockResolvedValue({ keyId: a.identity.keyId, publicKey: a.identity.publicKey, sealedPrivateKey: a.envelope })
  h.api.fetchMemberIds.mockReset().mockResolvedValue([A, B]) // C has left; their kept row is still served
  h.api.fetchDirectory.mockReset().mockResolvedValue({
    kind: 'directory',
    directory: {
      keys: [{ userId: A, publicKey: a.identity.publicKey }, { userId: B, publicKey: b.publicKey }, { userId: C, publicKey: c.publicKey }],
      forMe,
      mine: [],
    },
  })
  h.api.writeNames.mockReset().mockResolvedValue({ kind: 'written' })
  h.api.withdrawNames.mockReset().mockResolvedValue(undefined)
  h.api.publishKey.mockReset()
  h.api.resetKey.mockReset()
  h.custody.listeners.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const captured: { actions: ReturnType<typeof useTeamNamesActions> } = { actions: null }

function Probe() {
  const view = useTeamNames()
  const self = useTeammateName(A)
  const bob = useTeammateName(B)
  const cleo = useTeammateName(C)
  const actions = useTeamNamesActions()
  useEffect(() => {
    captured.actions = actions
  }, [actions])
  return (
    <pre data-testid="probe">
      {JSON.stringify({ state: view.state, share: view.share, team: view.team?.status ?? null, active: view.activeTeamHasBeta, any: view.anyTeamHasBeta, self, bob, cleo })}
    </pre>
  )
}

function tree() {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TeamNamesProvider>
        <Probe />
      </TeamNamesProvider>
    </SWRConfig>
  )
}

const read = () => JSON.parse(screen.getByTestId('probe').textContent ?? '{}')
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)) })
const apiCalls = () => Object.values(h.api).reduce((n, fn) => n + fn.mock.calls.length, 0)

describe('with the beta off', () => {
  it('runs nothing and fetches nothing of the feature', async () => {
    h.getMe.mockResolvedValue(me({ [TEAM]: [], [OTHER_TEAM]: ['weekly-summary'] }))
    render(tree())
    await settle()
    expect(read()).toMatchObject({ state: 'off', self: { kind: 'self' }, bob: { kind: 'not_yet', former: null } })
    expect(apiCalls()).toBe(0)
    expect(h.loadVaultKey).not.toHaveBeenCalled()
  })

  it('does not even read the flags off an app route', async () => {
    h.path.current = '/demo'
    render(tree())
    await settle()
    expect(h.getMe).not.toHaveBeenCalled()
    expect(read().state).toBe('off')
  })

  it('still takes the copies back when the name is cleared (DELETE works with the beta off)', async () => {
    h.getMe.mockResolvedValue(me({ [TEAM]: [] }))
    render(tree())
    await settle()
    await act(async () => { await captured.actions?.nameChanged('   ') })
    expect(h.api.withdrawNames).toHaveBeenCalledTimes(1)
    await act(async () => { await captured.actions?.nameChanged('Ada') })
    expect(apiCalls()).toBe(1)
  })
})

describe('which teams have the beta', () => {
  it('says the active team has it, and so do some of the person\'s teams', async () => {
    render(tree())
    await waitFor(() => expect(read()).toMatchObject({ active: true, any: true }))
  })

  it('says only "some team" when the beta is on in another team, and runs the session for it', async () => {
    h.getMe.mockResolvedValue(me({ [TEAM]: [], [OTHER_TEAM]: ['team-names'] }))
    render(tree())
    await waitFor(() => expect(read()).toMatchObject({ active: false, any: true, state: 'ready' }))
    // No team view for the active team: its surfaces stay as they are.
    expect(read().team).toBeNull()
    expect(read().bob).toEqual({ kind: 'not_yet', former: null })
  })

  it('says neither with the beta off everywhere', async () => {
    h.getMe.mockResolvedValue(me({ [TEAM]: [], [OTHER_TEAM]: [] }))
    render(tree())
    await settle()
    expect(read()).toMatchObject({ active: false, any: false, state: 'off' })
  })
})

describe('with the beta on', () => {
  it('names a teammate, marks a former one, and names nobody else', async () => {
    render(tree())
    await waitFor(() => expect(read().bob).toEqual({ kind: 'name', name: 'Bob', former: false, duplicate: false }))
    expect(read()).toMatchObject({ state: 'ready', team: 'ready', share: 'name', self: { kind: 'self' } })
    expect(read().cleo).toEqual({ kind: 'name', name: 'Cleo', former: true, duplicate: false })
    // My name went to the one current teammate with a key.
    await waitFor(() => expect(h.api.writeNames).toHaveBeenCalledTimes(1))
    expect(h.api.writeNames.mock.calls[0][1].map((e: { recipientId: string }) => e.recipientId)).toEqual([B])
  })

  it('flags a teammate who took my name', async () => {
    h.openVaultWithKey.mockResolvedValue({ email: 'x@example.com', display_name: 'BOB' })
    render(tree())
    await waitFor(() => expect(read().bob).toMatchObject({ kind: 'name', duplicate: true }))
  })

  it('asks for the one-time step when the person has no key', async () => {
    h.api.fetchOwnKey.mockResolvedValue(null)
    render(tree())
    await waitFor(() => expect(read().state).toBe('needs_setup'))
    expect(h.api.fetchDirectory).not.toHaveBeenCalled()
    expect(read().bob).toEqual({ kind: 'not_yet', former: null })
  })

  it('writes nothing of the feature to storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    render(tree())
    await waitFor(() => expect(read().bob.kind).toBe('name'))
    expect(setItem).not.toHaveBeenCalled()
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) expect(store.getItem(store.key(i) ?? '') ?? '').not.toMatch(/Bob|Cleo/)
    }
  })
})

describe('the names leave memory when the session ends', () => {
  async function named() {
    const view = render(tree())
    await waitFor(() => expect(read().bob.kind).toBe('name'))
    return view
  }

  it('on a sibling tab’s sign-out or a definitive rejection (the user goes null, no reload)', async () => {
    const view = await named()
    h.auth.user = null
    view.rerender(tree())
    await settle()
    expect(read()).toMatchObject({ state: 'off', bob: { kind: 'not_yet' }, cleo: { kind: 'not_yet' } })
  })

  it('on a vault-state change', async () => {
    const view = await named()
    h.auth.vaultState = 'locked'
    h.loadVaultKey.mockResolvedValue(null)
    view.rerender(tree())
    await waitFor(() => expect(read().state).toBe('locked'))
    expect(read().bob).toEqual({ kind: 'not_yet', former: null })
  })

  it('on the Lock button, which changes neither the user nor the vault state', async () => {
    await named()
    h.loadVaultKey.mockResolvedValue(null)
    act(() => h.custody.emit('forgotten'))
    await waitFor(() => expect(read().state).toBe('locked'))
    expect(read().bob).toEqual({ kind: 'not_yet', former: null })
    expect(read().cleo).toEqual({ kind: 'not_yet', former: null })
  })

  it('on a switch to another account', async () => {
    const view = await named()
    h.auth.user = { id: B, org_id: TEAM }
    h.api.fetchOwnKey.mockResolvedValue(null)
    view.rerender(tree())
    await waitFor(() => expect(read().state).toBe('needs_setup'))
    expect(read().cleo).toEqual({ kind: 'not_yet', former: null })
  })
})
