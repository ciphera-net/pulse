import { describe, it, expect, vi, beforeEach } from 'vitest'

// activateTeam is the bridge (Phase 2, PULSE-89): it still tells Ciphera ID
// (switchContext → setSessionAction → setAccessToken) before recording
// Pulse's OWN active-team preference (setActiveTeam → setActiveTeamAction).
// switchOrganizationSession is the MCP consent page's (and the top bar's)
// contract: activate, THEN refresh — and never navigate itself.

const h = vi.hoisted(() => {
  const order: string[] = []
  return {
    order,
    switchContext: vi.fn(async (_id: string | null) => { order.push('switchContext'); return { access_token: 'tok_b', expires_in: 900 } }),
    setSessionAction: vi.fn(async (_t: string) => {
      order.push('setSessionAction')
      return { success: true as const, user: { id: 'u1', email: 'a@b.c', totp_enabled: false } }
    }),
    setActiveTeamAction: vi.fn(async (_id: string | null) => { order.push('setActiveTeamAction'); return { success: true } }),
    setAccessToken: vi.fn((_t: string | null) => { order.push('setAccessToken') }),
    setActiveTeam: vi.fn((_id: string | null) => { order.push('setActiveTeam') }),
    refresh: vi.fn(async () => { order.push('refresh') }),
  }
})

vi.mock('@/lib/api/organization', () => ({ switchContext: h.switchContext }))
vi.mock('@/app/actions/auth', () => ({ setSessionAction: h.setSessionAction, setActiveTeamAction: h.setActiveTeamAction }))
vi.mock('@/lib/api/client', () => ({ setAccessToken: h.setAccessToken, setActiveTeam: h.setActiveTeam }))

import { activateTeam, switchOrganizationSession } from '@/lib/auth/switchOrganization'

beforeEach(() => {
  h.order.length = 0
  for (const fn of [h.switchContext, h.setSessionAction, h.setActiveTeamAction, h.setAccessToken, h.setActiveTeam, h.refresh]) fn.mockClear()
})

describe('activateTeam', () => {
  it('tells Ciphera ID first, THEN records the preference — the bridge order', async () => {
    const result = await activateTeam('org_b')

    expect(h.order).toEqual(['switchContext', 'setSessionAction', 'setAccessToken', 'setActiveTeam', 'setActiveTeamAction'])
    expect(h.switchContext).toHaveBeenCalledWith('org_b')
    expect(h.setSessionAction).toHaveBeenCalledWith('tok_b')
    expect(h.setAccessToken).toHaveBeenCalledWith('tok_b')
    expect(h.setActiveTeam).toHaveBeenCalledWith('org_b')
    expect(h.setActiveTeamAction).toHaveBeenCalledWith('org_b')
    expect(result.user.id).toBe('u1')
  })

  it('throws before priming the Bearer or recording the preference when the session could not be stored', async () => {
    h.setSessionAction.mockImplementationOnce(async () => { h.order.push('setSessionAction'); return { success: false } as never })

    await expect(activateTeam('org_b')).rejects.toThrow(/could not be stored/)

    expect(h.order).toEqual(['switchContext', 'setSessionAction'])
    expect(h.setAccessToken).not.toHaveBeenCalled()
    expect(h.setActiveTeam).not.toHaveBeenCalled()
    expect(h.setActiveTeamAction).not.toHaveBeenCalled()
  })

  it('accepts null (clearing the team) the same way', async () => {
    await activateTeam(null)
    expect(h.switchContext).toHaveBeenCalledWith(null)
    expect(h.setActiveTeam).toHaveBeenCalledWith(null)
    expect(h.setActiveTeamAction).toHaveBeenCalledWith(null)
  })
})

describe('switchOrganizationSession', () => {
  it('activates the team, THEN refreshes — and goes nowhere itself', async () => {
    await switchOrganizationSession('org_b', h.refresh)
    expect(h.order).toEqual(['switchContext', 'setSessionAction', 'setAccessToken', 'setActiveTeam', 'setActiveTeamAction', 'refresh'])
  })

  it('throws before refreshing when activateTeam fails', async () => {
    h.setSessionAction.mockImplementationOnce(async () => { h.order.push('setSessionAction'); return { success: false } as never })

    await expect(switchOrganizationSession('org_b', h.refresh)).rejects.toThrow(/could not be stored/)

    expect(h.order).toEqual(['switchContext', 'setSessionAction'])
    expect(h.refresh).not.toHaveBeenCalled()
  })
})
