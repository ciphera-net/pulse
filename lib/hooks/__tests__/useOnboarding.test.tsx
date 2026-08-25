import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Three defects this pins, all of which shipped:
//   1. a one-person workspace could never finish the checklist, because
//      "Invite a teammate" counted toward completion — so the widget never
//      retired and its only exit was the dismiss X;
//   2. before a site existed, four steps had no destination and rendered
//      identically to the one that worked;
//   3. "Install tracking script" keyed on `is_verified`, a flag only ever set
//      by someone pressing a button, so a correctly installed site read as
//      incomplete forever.
// ---------------------------------------------------------------------------

let sites: Array<Record<string, unknown>> = []
let members: unknown[] = [{ id: 'u1' }]
let hasGoal: boolean | undefined = false

vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: { org_id: 'org1' } }) }))
vi.mock('@/lib/swr/sites', () => ({ useSites: () => ({ sites, isLoading: false }) }))
vi.mock('@/lib/swr/members', () => ({ useMembers: () => ({ members }) }))
vi.mock('@/lib/api/client', () => ({ default: vi.fn() }))

// SWR is keyed per-resource in the hook; return the right fixture per key.
// The goal check reads the org-wide /onboarding/status aggregate (WS2.4b) —
// hasGoal=undefined stands in for the request still being in flight.
vi.mock('swr', () => ({
  default: (key: unknown) => {
    const name = Array.isArray(key) ? key[0] : key
    if (name === 'onboarding-status') {
      return hasGoal === undefined
        ? { data: undefined, error: undefined, mutate: vi.fn() }
        : { data: { has_goal: hasGoal }, error: undefined, mutate: vi.fn() }
    }
    if (name === 'onboarding-dismissed') return { data: false, mutate: vi.fn() }
    return { data: undefined, mutate: vi.fn() }
  },
}))

import { useOnboarding } from '../useOnboarding'

const item = (r: ReturnType<typeof useOnboarding>, key: string) =>
  r.items.find((i) => i.key === key)!

beforeEach(() => {
  sites = [{ id: 's1', install_status: 'never_installed' }]
  members = [{ id: 'u1' }]
  hasGoal = false
})

describe('useOnboarding', () => {
  it('lets a solo workspace actually finish', () => {
    sites = [{ id: 's1', install_status: 'active' }]
    hasGoal = true
    const { result } = renderHook(() => useOnboarding())
    // Three counted steps, all done — with the old math this org was stuck
    // short forever because it had no second member.
    expect(result.current.total).toBe(3)
    expect(result.current.completedCount).toBe(3)
    expect(result.current.allDone).toBe(true)
    expect(result.current.visible).toBe(false)
  })

  it('still offers the teammate step, it just does not gate completion', () => {
    const { result } = renderHook(() => useOnboarding())
    const teammate = item(result.current, 'teammate')
    expect(teammate).toBeTruthy()
    expect(teammate.countsTowardCompletion).toBe(false)
    expect(result.current.total).toBe(3)
  })

  it('locks the steps that have nowhere to go before a site exists', () => {
    sites = []
    const { result } = renderHook(() => useOnboarding())
    for (const key of ['script', 'goal']) {
      const i = item(result.current, key)
      expect(i.href, `${key} should have no destination yet`).toBeUndefined()
      expect(i.lockedReason, `${key} should say what unlocks it`).toBe('add a site first')
    }
    // The one step you CAN take is not locked.
    expect(item(result.current, 'site').lockedReason).toBeUndefined()
    expect(item(result.current, 'site').href).toBe('/sites/new')
  })

  it('drops the lock once a site exists', () => {
    const { result } = renderHook(() => useOnboarding())
    expect(item(result.current, 'goal').lockedReason).toBeUndefined()
    expect(item(result.current, 'goal').href).toBe('/settings/site/goals')
  })

  it('counts an installed script from events, not from a manual flag', () => {
    // is_verified deliberately absent: the old check read that flag and would
    // call this site uninstalled forever.
    sites = [{ id: 's1', install_status: 'active' }]
    const { result } = renderHook(() => useOnboarding())
    expect(item(result.current, 'script').completed).toBe(true)
  })

  it('does not count a site that has never reported', () => {
    sites = [{ id: 's1', install_status: 'never_installed', is_verified: true }]
    const { result } = renderHook(() => useOnboarding())
    expect(item(result.current, 'script').completed).toBe(false)
  })

  it('completes the goal step from the org-wide aggregate, not sites[0]', () => {
    // The defect this swap fixes: two sites, goal on the SECOND — the old
    // sites[0]-scoped check never completed the item. The aggregate answers
    // for the whole org, so which site carries the goal cannot matter.
    sites = [{ id: 's1', install_status: 'active' }, { id: 's2', install_status: 'active' }]
    hasGoal = true
    const { result } = renderHook(() => useOnboarding())
    expect(item(result.current, 'goal').completed).toBe(true)
  })
})
