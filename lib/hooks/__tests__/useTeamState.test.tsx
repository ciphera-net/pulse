import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'

// PULSE-59: the ONE signal every surface reads. A person is alone when they
// belong to exactly one organization and it has exactly one member; anything
// else is a team; a failure is "not known" (null), which surfaces render as a
// team, because a failure must never hide team features from a team.

const h = vi.hoisted(() => ({
  getUserOrganizations: vi.fn(),
  getOrganizationMembers: vi.fn(),
  // One stable object: SWR keys and effects depend on it.
  user: { id: 'u1', email: '', totp_enabled: false, org_id: 'org_a' } as
    | { id: string; email: string; totp_enabled: boolean; org_id: string }
    | null,
}))

vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: h.user }) }))
vi.mock('@/lib/api/organization', () => ({
  getUserOrganizations: h.getUserOrganizations,
  getOrganizationMembers: h.getOrganizationMembers,
}))

import { deriveTeamState, useTeamState, useTeamStateStatus } from '@/lib/hooks/useTeamState'

const org = (id: string) => ({ organization_id: id, user_id: 'u1', role: 'owner' as const, joined_at: '' })
const member = (id: string) => ({ organization_id: 'org_a', user_id: id, role: 'member' as const, joined_at: '' })

// A fresh cache per test: SWR's default cache is module-global and would carry
// one test's answer into the next.
function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
}

beforeEach(() => {
  h.getUserOrganizations.mockReset()
  h.getOrganizationMembers.mockReset()
  h.user = { id: 'u1', email: '', totp_enabled: false, org_id: 'org_a' }
  localStorage.clear()
})

describe('deriveTeamState (the rule)', () => {
  it('1 organization + 1 member = alone', () => {
    expect(deriveTeamState([org('org_a')], [member('u1')])).toBe('alone')
  })
  it('1 organization + 2 members = team', () => {
    expect(deriveTeamState([org('org_a')], [member('u1'), member('u2')])).toBe('team')
  })
  it('2 organizations = team, whatever the member count', () => {
    expect(deriveTeamState([org('org_a'), org('org_b')], [member('u1')])).toBe('team')
    expect(deriveTeamState([org('org_a'), org('org_b')], null)).toBe('team')
  })
  it('is not known until the answers it needs arrive', () => {
    expect(deriveTeamState(null, [member('u1')])).toBeNull()
    expect(deriveTeamState([org('org_a')], null)).toBeNull()
  })
})

describe('useTeamState', () => {
  it('is alone for one organization with one member', async () => {
    h.getUserOrganizations.mockResolvedValue([org('org_a')])
    h.getOrganizationMembers.mockResolvedValue([member('u1')])
    const { result } = renderHook(() => useTeamState(), { wrapper })
    await waitFor(() => expect(result.current).toBe('alone'))
    expect(h.getOrganizationMembers).toHaveBeenCalledWith('org_a')
  })

  it('is team for one organization with two members', async () => {
    h.getUserOrganizations.mockResolvedValue([org('org_a')])
    h.getOrganizationMembers.mockResolvedValue([member('u1'), member('u2')])
    const { result } = renderHook(() => useTeamState(), { wrapper })
    await waitFor(() => expect(result.current).toBe('team'))
  })

  it('is team for two organizations', async () => {
    h.getUserOrganizations.mockResolvedValue([org('org_a'), org('org_b')])
    h.getOrganizationMembers.mockResolvedValue([member('u1')])
    const { result } = renderHook(() => useTeamState(), { wrapper })
    await waitFor(() => expect(result.current).toBe('team'))
  })

  it('is null (the team layout) when the organization list fails', async () => {
    h.getUserOrganizations.mockRejectedValue(new Error('id down'))
    h.getOrganizationMembers.mockResolvedValue([member('u1')])
    const { result } = renderHook(() => useTeamState(), { wrapper })
    await waitFor(() => expect(h.getUserOrganizations).toHaveBeenCalled())
    await waitFor(() => expect(h.getOrganizationMembers).toHaveBeenCalled())
    // Give both answers time to land; it must stay null, never alone.
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current).toBeNull()
  })

  it('is null when the member list fails, even though this browser remembers alone', async () => {
    localStorage.setItem('pulse_team_state_u1_org_a', 'alone')
    h.getUserOrganizations.mockResolvedValue([org('org_a')])
    h.getOrganizationMembers.mockRejectedValue(new Error('id down'))
    const { result } = renderHook(() => useTeamState(), { wrapper })
    await waitFor(() => expect(h.getOrganizationMembers).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current).toBeNull()
  })

  it('shows the remembered value while loading, and the fetched value wins', async () => {
    localStorage.setItem('pulse_team_state_u1_org_a', 'alone')
    let resolveMembers: (v: unknown) => void = () => {}
    h.getUserOrganizations.mockResolvedValue([org('org_a')])
    h.getOrganizationMembers.mockReturnValue(new Promise((r) => { resolveMembers = r }))
    const { result } = renderHook(() => useTeamState(), { wrapper })
    await waitFor(() => expect(result.current).toBe('alone'))
    // A teammate joined since the last visit: the server answer replaces the guess.
    resolveMembers([member('u1'), member('u2')])
    await waitFor(() => expect(result.current).toBe('team'))
    expect(localStorage.getItem('pulse_team_state_u1_org_a')).toBe('team')
  })

  it('remembers per person and organization, never across them', async () => {
    localStorage.setItem('pulse_team_state_u2_org_a', 'alone')
    h.getUserOrganizations.mockReturnValue(new Promise(() => {}))
    h.getOrganizationMembers.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useTeamState(), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current).toBeNull()
  })

  it('survives storage that throws', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    h.getUserOrganizations.mockResolvedValue([org('org_a')])
    h.getOrganizationMembers.mockResolvedValue([member('u1')])
    const { result } = renderHook(() => useTeamState(), { wrapper })
    await waitFor(() => expect(result.current).toBe('alone'))
    get.mockRestore()
    set.mockRestore()
  })

  it('fetches nothing without a signed-in person', async () => {
    h.user = null
    const { result } = renderHook(() => useTeamState(), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current).toBeNull()
    expect(h.getUserOrganizations).not.toHaveBeenCalled()
  })
})

// /connect waits on `settled`, so a remembered guess must never count as the
// server's answer, and a state that cannot be known must not wait forever.
describe('useTeamStateStatus', () => {
  it('is not settled on a remembered guess, and settles on the fetched answer', async () => {
    localStorage.setItem('pulse_team_state_u1_org_a', 'alone')
    let resolveMembers: (v: unknown) => void = () => {}
    h.getUserOrganizations.mockResolvedValue([org('org_a')])
    h.getOrganizationMembers.mockReturnValue(new Promise((r) => { resolveMembers = r }))
    const { result } = renderHook(() => useTeamStateStatus(), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('alone'))
    expect(result.current.settled).toBe(false)
    resolveMembers([member('u1')])
    await waitFor(() => expect(result.current.settled).toBe(true))
    expect(result.current.state).toBe('alone')
  })

  it('settles as null on a failure', async () => {
    h.getUserOrganizations.mockRejectedValue(new Error('id down'))
    h.getOrganizationMembers.mockResolvedValue([member('u1')])
    const { result } = renderHook(() => useTeamStateStatus(), { wrapper })
    await waitFor(() => expect(result.current.settled).toBe(true))
    expect(result.current.state).toBeNull()
  })

  it('settles when the session has no organization, rather than waiting on a member list never asked for', async () => {
    h.user = { id: 'u1', email: '', totp_enabled: false, org_id: '' }
    h.getUserOrganizations.mockResolvedValue([org('org_a')])
    const { result } = renderHook(() => useTeamStateStatus(), { wrapper })
    await waitFor(() => expect(result.current.settled).toBe(true))
    expect(result.current.state).toBeNull()
    expect(h.getOrganizationMembers).not.toHaveBeenCalled()
  })
})
