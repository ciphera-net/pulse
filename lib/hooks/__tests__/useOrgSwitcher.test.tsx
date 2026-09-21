import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// pulse#730: the order of the workspace switch is the contract —
// session stored → Bearer primed → refresh (which owns the cache purge) →
// navigate — and nothing cache-wide runs after refresh().

const h = vi.hoisted(() => {
  const order: string[] = []
  return {
    order,
    push: vi.fn((_path: string) => { order.push('router.push') }),
    refresh: vi.fn(async () => { order.push('auth.refresh') }),
    switchContext: vi.fn(async (_id: string | null) => {
      order.push('switchContext')
      return { access_token: 'tok_b', expires_in: 900 }
    }),
    setSessionAction: vi.fn(async (_token: string) => {
      order.push('setSessionAction')
      return { success: true as const, user: { id: 'u1', email: '', totp_enabled: false, org_id: 'org_b' }, access_token: 'tok_b' }
    }),
    setAccessToken: vi.fn((_token: string | null) => { order.push('setAccessToken') }),
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
vi.mock('@/lib/api/organization', () => ({
  getUserOrganizations: vi.fn(async () => []),
  switchContext: h.switchContext,
}))
vi.mock('@/app/actions/auth', () => ({ setSessionAction: h.setSessionAction }))
vi.mock('@/lib/api/client', () => ({ setAccessToken: h.setAccessToken }))
vi.mock('@/lib/utils/logger', () => ({ logger: { error: h.error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

import { useOrgSwitcher } from '@/lib/hooks/useOrgSwitcher'

beforeEach(() => {
  h.order.length = 0
  for (const fn of [h.push, h.refresh, h.switchContext, h.setSessionAction, h.setAccessToken, h.error]) fn.mockClear()
})

describe('useOrgSwitcher.switchOrganization', () => {
  it('stores the session, primes the Bearer, THEN refreshes (the purge), THEN navigates', async () => {
    const { result } = renderHook(() => useOrgSwitcher())

    await act(async () => { await result.current.switchOrganization('org_b') })

    expect(h.order).toEqual(['switchContext', 'setSessionAction', 'setAccessToken', 'auth.refresh', 'router.push'])
    expect(h.switchContext).toHaveBeenCalledWith('org_b')
    expect(h.setSessionAction).toHaveBeenCalledWith('tok_b')
    expect(h.setAccessToken).toHaveBeenCalledWith('tok_b')
    expect(h.push).toHaveBeenCalledWith('/')
    expect(h.error).not.toHaveBeenCalled()
  })

  it('stops when the session could not be stored — no Bearer, no refresh, no navigation', async () => {
    h.setSessionAction.mockImplementationOnce(async () => {
      h.order.push('setSessionAction')
      return { success: false, error: 'invalid' } as never
    })
    const { result } = renderHook(() => useOrgSwitcher())

    await act(async () => { await result.current.switchOrganization('org_b') })

    expect(h.order).toEqual(['switchContext', 'setSessionAction'])
    expect(h.setAccessToken).not.toHaveBeenCalled()
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
