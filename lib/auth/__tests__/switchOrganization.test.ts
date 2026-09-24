import { describe, it, expect, vi, beforeEach } from 'vitest'

// The MCP consent page (/connect, PULSE-41) switches workspace to show that
// workspace's sites, and must stay on the page: the pending connection request
// lives in its URL. So the shared switch keeps pulse#730's order and never
// navigates — the caller decides.

const h = vi.hoisted(() => {
  const order: string[] = []
  return {
    order,
    switchContext: vi.fn(async (_id: string) => { order.push('switchContext'); return { access_token: 'tok_b', expires_in: 900 } }),
    setSessionAction: vi.fn(async (_t: string) => { order.push('setSessionAction'); return { success: true as const } }),
    setAccessToken: vi.fn((_t: string | null) => { order.push('setAccessToken') }),
    refresh: vi.fn(async () => { order.push('refresh') }),
  }
})

vi.mock('@/lib/api/organization', () => ({ switchContext: h.switchContext }))
vi.mock('@/app/actions/auth', () => ({ setSessionAction: h.setSessionAction }))
vi.mock('@/lib/api/client', () => ({ setAccessToken: h.setAccessToken }))

import { switchOrganizationSession } from '@/lib/auth/switchOrganization'

beforeEach(() => {
  h.order.length = 0
  for (const fn of [h.switchContext, h.setSessionAction, h.setAccessToken, h.refresh]) fn.mockClear()
})

describe('switchOrganizationSession', () => {
  it('stores the session, primes the Bearer, then refreshes — and goes nowhere', async () => {
    await switchOrganizationSession('org_b', h.refresh)
    expect(h.order).toEqual(['switchContext', 'setSessionAction', 'setAccessToken', 'refresh'])
    expect(h.setAccessToken).toHaveBeenCalledWith('tok_b')
  })

  it('throws before priming the Bearer when the session could not be stored', async () => {
    h.setSessionAction.mockImplementationOnce(async () => { h.order.push('setSessionAction'); return { success: false } as never })
    await expect(switchOrganizationSession('org_b', h.refresh)).rejects.toThrow(/could not be stored/)
    expect(h.order).toEqual(['switchContext', 'setSessionAction'])
    expect(h.refresh).not.toHaveBeenCalled()
  })
})
