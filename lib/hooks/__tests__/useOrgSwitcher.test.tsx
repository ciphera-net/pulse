import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// pulse#730: the order of the workspace switch is the contract —
// preference recorded → refresh (which owns the cache purge) → navigate —
// and nothing cache-wide runs after refresh().

const h = vi.hoisted(() => {
  const order: string[] = []
  return {
    order,
    push: vi.fn((_path: string) => { order.push('router.push') }),
    refresh: vi.fn(async () => { order.push('auth.refresh') }),
    setActiveTeamAction: vi.fn(async (_id: string | null) => { order.push('setActiveTeamAction'); return { success: true } }),
    setActiveTeam: vi.fn((_id: string | null) => { order.push('setActiveTeam') }),
    error: vi.fn(),
    // One stable object: the hook's org-list effect depends on `auth.user`, and
    // a fresh object per render would re-run it (and re-render) forever.
    user: { id: 'u1', email: '', totp_enabled: false, org_id: 'org_a' },
  }
})

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push, refresh: vi.fn() }) }))
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: h.user, refresh: h.refresh }),
}))
vi.mock('@/lib/swr/organizations', () => ({
  useUserOrganizations: () => ({ organizations: [], error: null }),
}))
vi.mock('@/app/actions/auth', () => ({ setActiveTeamAction: h.setActiveTeamAction }))
vi.mock('@/lib/api/client', () => ({ setActiveTeam: h.setActiveTeam }))
vi.mock('@/lib/utils/logger', () => ({ logger: { error: h.error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

import { useOrgSwitcher } from '@/lib/hooks/useOrgSwitcher'

beforeEach(() => {
  h.order.length = 0
  for (const fn of [h.push, h.refresh, h.setActiveTeamAction, h.setActiveTeam, h.error]) fn.mockClear()
})

describe('useOrgSwitcher.switchOrganization', () => {
  it('records the preference, THEN refreshes (the purge), THEN navigates', async () => {
    const { result } = renderHook(() => useOrgSwitcher())

    await act(async () => { await result.current.switchOrganization('org_b') })

    expect(h.order).toEqual(['setActiveTeam', 'setActiveTeamAction', 'auth.refresh', 'router.push'])
    expect(h.setActiveTeam).toHaveBeenCalledWith('org_b')
    expect(h.setActiveTeamAction).toHaveBeenCalledWith('org_b')
    expect(h.push).toHaveBeenCalledWith('/')
    expect(h.error).not.toHaveBeenCalled()
  })

  it('stops when the preference could not be persisted — no refresh, no navigation', async () => {
    h.setActiveTeamAction.mockImplementationOnce(async () => {
      h.order.push('setActiveTeamAction')
      throw new Error('cookie store unavailable')
    })
    const { result } = renderHook(() => useOrgSwitcher())

    await act(async () => { await result.current.switchOrganization('org_b') })

    expect(h.order).toEqual(['setActiveTeam', 'setActiveTeamAction'])
    expect(h.refresh).not.toHaveBeenCalled()
    expect(h.push).not.toHaveBeenCalled()
    expect(h.error).toHaveBeenCalledTimes(1)
  })

  it('does nothing for a null workspace id', async () => {
    const { result } = renderHook(() => useOrgSwitcher())

    await act(async () => { await result.current.switchOrganization(null) })

    expect(h.order).toEqual([])
  })
})
