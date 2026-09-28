import { describe, it, expect, vi, beforeEach } from 'vitest'

// activateTeam records Pulse's OWN active-team preference — setActiveTeam for
// the running tab, setActiveTeamAction for the pulse_team cookie. The bridge
// that told Ciphera ID first (switchContext → setSessionAction →
// setAccessToken) was deleted in Phase 5, PULSE-92. switchOrganizationSession
// is the MCP consent page's (and the top bar's) contract: activate, THEN
// refresh — and never navigate itself.

const h = vi.hoisted(() => {
  const order: string[] = []
  return {
    order,
    setActiveTeamAction: vi.fn(async (_id: string | null) => { order.push('setActiveTeamAction'); return { success: true } }),
    setActiveTeam: vi.fn((_id: string | null) => { order.push('setActiveTeam') }),
    refresh: vi.fn(async () => { order.push('refresh') }),
  }
})

vi.mock('@/app/actions/auth', () => ({ setActiveTeamAction: h.setActiveTeamAction }))
vi.mock('@/lib/api/client', () => ({ setActiveTeam: h.setActiveTeam }))

import { activateTeam, switchOrganizationSession } from '@/lib/auth/switchOrganization'

beforeEach(() => {
  h.order.length = 0
  for (const fn of [h.setActiveTeamAction, h.setActiveTeam, h.refresh]) fn.mockClear()
})

describe('activateTeam', () => {
  it('sets the in-memory active team, THEN persists the cookie preference', async () => {
    await activateTeam('org_b')

    expect(h.order).toEqual(['setActiveTeam', 'setActiveTeamAction'])
    expect(h.setActiveTeam).toHaveBeenCalledWith('org_b')
    expect(h.setActiveTeamAction).toHaveBeenCalledWith('org_b')
  })

  it('has already set the in-memory team before the cookie write can fail', async () => {
    h.setActiveTeamAction.mockRejectedValueOnce(new Error('cookie store unavailable'))

    await expect(activateTeam('org_b')).rejects.toThrow('cookie store unavailable')

    expect(h.setActiveTeam).toHaveBeenCalledWith('org_b')
  })

  it('accepts null (clearing the team) the same way', async () => {
    await activateTeam(null)
    expect(h.setActiveTeam).toHaveBeenCalledWith(null)
    expect(h.setActiveTeamAction).toHaveBeenCalledWith(null)
  })
})

describe('activateTeam serialisation (Fix 2, PULSE-89 review)', () => {
  // Without this, the recovery handler and a person's own switch could
  // interleave their writes — recovery's setActiveTeam/setActiveTeamAction
  // landing BETWEEN the person's own two steps.

  it("two concurrent calls run strictly in order: the second's setActiveTeam waits for the first's setActiveTeamAction to resolve", async () => {
    // A holder object, not a `let`: TypeScript cannot see an assignment made
    // inside the mock's callback and would narrow a bare variable to `null`.
    const gate: { release: () => void } = { release: () => {} }
    h.setActiveTeamAction.mockImplementationOnce(async (_id: string | null) => {
      await new Promise<void>((resolve) => { gate.release = resolve })
      h.order.push('setActiveTeamAction')
      return { success: true }
    })

    const p1 = activateTeam('org_a')
    const p2 = activateTeam('org_b')

    // Flush every microtask that CAN run right now: call 1 is parked inside
    // its (gated) setActiveTeamAction, so call 2 must not have started at
    // all — not even its setActiveTeam, the very first step.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(h.order).toEqual(['setActiveTeam'])
    expect(h.setActiveTeam).toHaveBeenCalledTimes(1)
    expect(h.setActiveTeam).toHaveBeenCalledWith('org_a')

    gate.release()
    await p1
    await p2

    expect(h.order).toEqual([
      'setActiveTeam', 'setActiveTeamAction',
      'setActiveTeam', 'setActiveTeamAction',
    ])
    expect(h.setActiveTeam).toHaveBeenNthCalledWith(1, 'org_a')
    expect(h.setActiveTeam).toHaveBeenNthCalledWith(2, 'org_b')
  })

  it('a rejected first call does not block an already-queued second', async () => {
    h.setActiveTeamAction.mockImplementationOnce(async () => {
      h.order.push('setActiveTeamAction')
      throw new Error('cookie store unavailable')
    })

    const p1 = activateTeam('org_a')
    const p2 = activateTeam('org_b')

    await expect(p1).rejects.toThrow('cookie store unavailable')
    await expect(p2).resolves.toBeUndefined()

    expect(h.setActiveTeam).toHaveBeenNthCalledWith(1, 'org_a')
    expect(h.setActiveTeam).toHaveBeenNthCalledWith(2, 'org_b')
  })
})

describe('switchOrganizationSession', () => {
  it('activates the team, THEN refreshes — and goes nowhere itself', async () => {
    await switchOrganizationSession('org_b', h.refresh)
    expect(h.order).toEqual(['setActiveTeam', 'setActiveTeamAction', 'refresh'])
  })

  it('throws before refreshing when activateTeam fails', async () => {
    h.setActiveTeamAction.mockRejectedValueOnce(new Error('cookie store unavailable'))

    await expect(switchOrganizationSession('org_b', h.refresh)).rejects.toThrow('cookie store unavailable')

    expect(h.order).toEqual(['setActiveTeam'])
    expect(h.refresh).not.toHaveBeenCalled()
  })
})
