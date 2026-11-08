// The provider and the hooks the surfaces read: a session runs for every signed-in person on an app
// route, whatever /me's feature flags say, and nothing runs or is fetched off one; names arrive, and
// the names and the private key leave memory on every path that ends the session without a reload
// (review L9): a sibling tab's sign-out or a definitive rejection (the user goes null), a vault-state
// change, and the Lock button, which changes neither. Every team gets both passes (design §16), and
// an owner's or admin's hooks answer teammates' addresses; a member's, a demoted viewer's and the
// viewer's own never do.

import { useEffect } from 'react'
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
    auth: { user: null as { id: string; org_id?: string; role?: string } | null, vaultState: 'unknown' as 'unknown' | 'open' | 'locked' },
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
      fetchEmailDirectory: vi.fn(),
      writeEmails: vi.fn(),
      withdrawEmails: vi.fn(),
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

import { createIdentity, keyIdOf, sealEmail, sealName, type TeamIdentity } from '@/lib/crypto/team-names'
import { TeamNamesProvider } from '../provider'
import { useTeamEmails, useTeamNames, useTeammateEmail, useTeammateName, useTeamNamesActions } from '../hooks'

/** /me with the person's teams, carrying no feature flags. */
const me = (...teams: string[]) => ({
  user_id: A,
  default_team_id: TEAM,
  teams: teams.map((id) => ({ id, name: id, slug: id, role: 'owner', onboarding_completed_at: null, last_active_at: null, joined_at: '2026-11-01T00:00:00Z' })),
})

let vmk: VaultKey
let a: { identity: TeamIdentity; envelope: Uint8Array }
let b: TeamIdentity
let bEnvelope: Uint8Array
let c: TeamIdentity
/** The address rows B and C sealed for A, as the email directory serves them to an owner or admin. */
let emailsForA: { senderId: string; senderKeyId: Uint8Array; recipientKeyId: Uint8Array; sealed: Uint8Array }[]

beforeEach(async () => {
  vmk = (await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), 'HKDF', false, ['deriveKey'])) as VaultKey
  a = await createIdentity(vaultOpsFor(vmk))
  ;({ identity: b, envelope: bEnvelope } = await createIdentity(vaultOpsFor(vmk)))
  c = (await createIdentity(vaultOpsFor(vmk))).identity
  const rowFrom = async (senderId: string, sender: TeamIdentity, name: string) => {
    const { sealed } = await sealName({ teamId: TEAM, senderId, recipientId: A, name, sender, recipientPublicKey: a.identity.publicKey, recipientKeyId: a.identity.keyId })
    return { senderId, senderKeyId: sender.keyId, recipientKeyId: a.identity.keyId, sealed }
  }
  const forMe = [await rowFrom(B, b, 'Bob'), await rowFrom(C, c, 'Cleo')]
  const emailFrom = async (senderId: string, sender: TeamIdentity, email: string) => {
    const { sealed } = await sealEmail({ teamId: TEAM, senderId, recipientId: A, email, sender, recipientPublicKey: a.identity.publicKey, recipientKeyId: a.identity.keyId })
    return { senderId, senderKeyId: sender.keyId, recipientKeyId: a.identity.keyId, sealed }
  }
  emailsForA = [await emailFrom(B, b, 'bob@example.com'), await emailFrom(C, c, 'cleo@example.com')]

  h.auth.user = { id: A, org_id: TEAM }
  h.auth.vaultState = 'open'
  h.path.current = '/settings/team'
  h.getMe.mockReset().mockResolvedValue(me(TEAM, OTHER_TEAM))
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
  // B is the team's other owner or admin; C has left, and their kept row is served (R75).
  h.api.fetchEmailDirectory.mockReset().mockResolvedValue({
    kind: 'directory',
    directory: { keys: [{ userId: B, publicKey: b.publicKey }, { userId: C, publicKey: c.publicKey }], recipients: [B], forMe: emailsForA, mine: [] },
  })
  h.api.writeEmails.mockReset().mockResolvedValue({ kind: 'written' })
  h.api.withdrawEmails.mockReset().mockResolvedValue(undefined)
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
      {JSON.stringify({ state: view.state, share: view.share, team: view.team?.status ?? null, self, bob, cleo })}
    </pre>
  )
}

/** What the address hooks answer. */
function EmailProbe() {
  const view = useTeamEmails()
  const self = useTeammateEmail(A)
  const bob = useTeammateEmail(B)
  const cleo = useTeammateEmail(C)
  return (
    <pre data-testid="emails">
      {JSON.stringify({ shown: view.shown, self, bob, cleo })}
    </pre>
  )
}

function tree() {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TeamNamesProvider>
        <Probe />
        <EmailProbe />
      </TeamNamesProvider>
    </SWRConfig>
  )
}

const read = () => JSON.parse(screen.getByTestId('probe').textContent ?? '{}')
const readEmails = () => JSON.parse(screen.getByTestId('emails').textContent ?? '{}')
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)) })
const apiCalls = () => Object.values(h.api).reduce((n, fn) => n + fn.mock.calls.length, 0)

describe('off an app route', () => {
  it('runs nothing, reads nothing and fetches nothing of the feature', async () => {
    h.path.current = '/demo'
    render(tree())
    await settle()
    expect(h.getMe).not.toHaveBeenCalled()
    expect(read()).toMatchObject({ state: 'off', self: { kind: 'self' }, bob: { kind: 'not_yet', former: null } })
    expect(apiCalls()).toBe(0)
    expect(h.loadVaultKey).not.toHaveBeenCalled()
  })
})

describe('without a feature flag in /me', () => {
  it.each([
    ['no features field on any team', {}],
    ['an empty features list on every team', { features: [] as string[] }],
  ])('%s: the session runs, names arrive, and an owner or admin sees the addresses', async (_what, extra) => {
    h.auth.user = { id: A, org_id: TEAM, role: 'admin' }
    h.getMe.mockResolvedValue({
      user_id: A,
      default_team_id: TEAM,
      teams: [TEAM, OTHER_TEAM].map((id) => ({ id, name: id, slug: id, role: 'admin', onboarding_completed_at: null, last_active_at: null, joined_at: '2026-11-01T00:00:00Z', ...extra })),
    })
    render(tree())
    await waitFor(() => expect(read().bob).toEqual({ kind: 'name', name: 'Bob', former: false, duplicate: false }))
    expect(read()).toMatchObject({ state: 'ready', team: 'ready', share: 'name', cleo: { kind: 'name', name: 'Cleo', former: true, duplicate: false } })
    await waitFor(() => expect(readEmails().bob).toEqual({ kind: 'email', email: 'bob@example.com', former: false, duplicate: false }))
    expect(readEmails()).toMatchObject({ shown: true, self: { kind: 'self' }, cleo: { kind: 'email', email: 'cleo@example.com', former: true, duplicate: false } })
    // Both passes ran for the open team, and both shares went out.
    await waitFor(() => expect(h.api.writeEmails).toHaveBeenCalledTimes(1))
    expect(h.api.writeNames).toHaveBeenCalledTimes(1)
    expect(h.api.fetchDirectory.mock.calls.map((call) => call[0])).toEqual([TEAM])
    expect(h.api.fetchEmailDirectory.mock.calls.map((call) => call[0])).toEqual([TEAM])
  })

  it('still takes the copies back when the name is cleared before the session holds a key', async () => {
    // The vault state is not known yet, so the session has not started: nothing of its own is fetched.
    h.auth.vaultState = 'unknown'
    render(tree())
    await settle()
    await act(async () => { await captured.actions?.nameChanged('   ') })
    expect(h.api.withdrawNames).toHaveBeenCalledTimes(1)
    await act(async () => { await captured.actions?.nameChanged('Ada') })
    expect(apiCalls()).toBe(1)
  })
})

describe('names', () => {
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

  it('publishes a first key with no password, and shares the name in every team of the person\'s at once (R72)', async () => {
    h.api.fetchOwnKey.mockResolvedValue(null)
    let published: Uint8Array | null = null
    h.api.publishKey.mockImplementation(async (body: { publicKey: Uint8Array; sealedPrivateKey: Uint8Array }) => {
      published = body.publicKey
      return { keyId: await keyIdOf(body.publicKey), publicKey: body.publicKey, sealedPrivateKey: body.sealedPrivateKey }
    })
    h.api.fetchDirectory.mockImplementation(async () => ({
      kind: 'directory',
      directory: { keys: [{ userId: A, publicKey: published }, { userId: B, publicKey: b.publicKey }], forMe: [], mine: [] },
    }))
    const view = render(tree())
    await waitFor(() => expect(read().state).toBe('ready'))
    expect(h.api.publishKey).toHaveBeenCalledTimes(1)
    expect(h.api.publishKey.mock.calls[0][0]).not.toHaveProperty('reauthToken')
    // My name reaches B in both teams, the open one and the other, with no step.
    await waitFor(() => expect(new Set(h.api.writeNames.mock.calls.map((call) => call[0]))).toEqual(new Set([TEAM, OTHER_TEAM])))
    const otherReads = () => h.api.fetchDirectory.mock.calls.filter((call) => call[0] === OTHER_TEAM).length
    expect(otherReads()).toBe(1)
    // Once per session: a later render sends nothing again.
    view.rerender(tree())
    await settle()
    expect(otherReads()).toBe(1)
    expect(h.api.publishKey).toHaveBeenCalledTimes(1)
  })

  it('reads and shares team by team when the key already exists', async () => {
    render(tree())
    await waitFor(() => expect(h.api.writeNames).toHaveBeenCalledTimes(1))
    await settle()
    expect(h.api.publishKey).not.toHaveBeenCalled()
    // Only the open team: the other is read when it is opened.
    expect(h.api.fetchDirectory.mock.calls.map((call) => call[0])).toEqual([TEAM])
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
    h.api.fetchOwnKey.mockResolvedValue({ keyId: b.keyId, publicKey: b.publicKey, sealedPrivateKey: bEnvelope })
    view.rerender(tree())
    // The new account's own session: it read B's key, and the names A's session held are gone.
    await waitFor(() => expect(h.api.fetchOwnKey).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(read().state).toBe('ready'))
    // B's session read the team, so it knows C left, but it holds no name for them.
    expect(read().cleo).toEqual({ kind: 'not_yet', former: true })
  })
})

describe('team emails (design §16)', () => {
  beforeEach(() => {
    h.auth.user = { id: A, org_id: TEAM, role: 'owner' }
  })

  it('reads the open team\'s addresses, seals mine for its other owner or admin, and marks a former member\'s kept one', async () => {
    render(tree())
    await waitFor(() => expect(readEmails().bob).toEqual({ kind: 'email', email: 'bob@example.com', former: false, duplicate: false }))
    expect(readEmails()).toMatchObject({ shown: true })
    expect(h.api.fetchEmailDirectory.mock.calls.map((call) => call[0])).toEqual([TEAM])
    // My address went to the team's other owner or admin.
    await waitFor(() => expect(h.api.writeEmails).toHaveBeenCalledTimes(1))
    expect(h.api.writeEmails.mock.calls[0][1].map((e: { recipientId: string }) => e.recipientId)).toEqual([B])
    // A former member's kept address, marked former (R75).
    expect(readEmails().cleo).toEqual({ kind: 'email', email: 'cleo@example.com', former: true, duplicate: false })
  })

  it('reads names and addresses in one reconcile of a team, the vault and the members once', async () => {
    render(tree())
    await waitFor(() => expect(readEmails().bob.kind).toBe('email'))
    expect(read().bob).toEqual({ kind: 'name', name: 'Bob', former: false, duplicate: false })
    await settle()
    expect(h.openVaultWithKey).toHaveBeenCalledTimes(1)
    expect(h.api.fetchMemberIds).toHaveBeenCalledTimes(1)
    expect(h.api.fetchDirectory).toHaveBeenCalledTimes(1)
    expect(h.api.fetchEmailDirectory).toHaveBeenCalledTimes(1)
  })

  it('answers "self" for the viewer, "off" for a member, and "off" at once for an owner demoted while the addresses are in memory', async () => {
    const view = render(tree())
    await waitFor(() => expect(readEmails().bob.kind).toBe('email'))
    expect(readEmails().self).toEqual({ kind: 'self' })
    const reads = h.api.fetchEmailDirectory.mock.calls.length
    h.auth.user = { id: A, org_id: TEAM, role: 'member' }
    view.rerender(tree())
    // Before any new reconcile: the role is read as it is now.
    expect(readEmails()).toMatchObject({ shown: false, bob: { kind: 'off' }, cleo: { kind: 'off' }, self: { kind: 'self' } })
    expect(h.api.fetchEmailDirectory.mock.calls.length).toBe(reads)
    // An admin sees them again.
    h.auth.user = { id: A, org_id: TEAM, role: 'admin' }
    view.rerender(tree())
    expect(readEmails().bob.kind).toBe('email')
  })

  it('answers "not_yet" for a teammate whose address has not reached this browser, once the team\'s addresses are read', async () => {
    h.api.fetchEmailDirectory.mockResolvedValue({
      kind: 'directory',
      directory: { keys: [{ userId: B, publicKey: b.publicKey }], recipients: [B], forMe: [emailsForA[0]], mine: [] },
    })
    h.api.fetchMemberIds.mockResolvedValue([A, B, C])
    render(tree())
    await waitFor(() => expect(readEmails().bob.kind).toBe('email'))
    expect(readEmails().cleo).toEqual({ kind: 'not_yet' })
  })

  it('answers "locked" when this browser holds no vault key', async () => {
    h.auth.vaultState = 'locked'
    h.loadVaultKey.mockResolvedValue(null)
    render(tree())
    await waitFor(() => expect(read().state).toBe('locked'))
    expect(readEmails().bob).toEqual({ kind: 'locked' })
    expect(h.api.fetchEmailDirectory).not.toHaveBeenCalled()
  })

  it('a first key seals the name and the address in every team of the person\'s, both passes in each (R72)', async () => {
    h.api.fetchOwnKey.mockResolvedValue(null)
    let published: Uint8Array | null = null
    h.api.publishKey.mockImplementation(async (body: { publicKey: Uint8Array; sealedPrivateKey: Uint8Array }) => {
      published = body.publicKey
      return { keyId: await keyIdOf(body.publicKey), publicKey: body.publicKey, sealedPrivateKey: body.sealedPrivateKey }
    })
    h.api.fetchDirectory.mockImplementation(async () => ({
      kind: 'directory',
      directory: { keys: [{ userId: A, publicKey: published }, { userId: B, publicKey: b.publicKey }], forMe: [], mine: [] },
    }))
    h.api.fetchEmailDirectory.mockImplementation(async () => ({
      kind: 'directory',
      directory: { keys: [{ userId: B, publicKey: b.publicKey }], recipients: [B], forMe: [], mine: [] },
    }))
    render(tree())
    await waitFor(() => expect(new Set(h.api.writeEmails.mock.calls.map((call) => call[0]))).toEqual(new Set([TEAM, OTHER_TEAM])))
    await waitFor(() => expect(new Set(h.api.writeNames.mock.calls.map((call) => call[0]))).toEqual(new Set([TEAM, OTHER_TEAM])))
    await settle()
    // The active team is reconciled for itself as well as with the rest (the session's queue runs both), and this
    // stand-in's `mine` never fills, so its writes are compared as sets.
    expect(new Set(h.api.writeEmails.mock.calls.map((call) => call[0]))).toEqual(new Set([TEAM, OTHER_TEAM]))
    expect(new Set(h.api.writeNames.mock.calls.map((call) => call[0]))).toEqual(new Set([TEAM, OTHER_TEAM]))
    expect(new Set(h.api.fetchEmailDirectory.mock.calls.map((call) => call[0]))).toEqual(new Set([TEAM, OTHER_TEAM]))
    expect(new Set(h.api.fetchDirectory.mock.calls.map((call) => call[0]))).toEqual(new Set([TEAM, OTHER_TEAM]))
  })

  it('writes no address to storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    render(tree())
    await waitFor(() => expect(readEmails().bob.kind).toBe('email'))
    expect(setItem).not.toHaveBeenCalled()
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) expect(store.getItem(store.key(i) ?? '') ?? '').not.toMatch(/@example\.com/)
    }
  })
})
