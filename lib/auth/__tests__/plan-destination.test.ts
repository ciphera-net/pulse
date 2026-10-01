// D43: the ONE routing decision shared by components/PricingSection.tsx's
// handleSubscribe and the dashboard start address (/start/plan) that a future
// marketing /pricing page will link its plan buttons to. These pin the
// contract against the TRAFFIC_TIERS/PLAN_CATALOG the rest of the app sells.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRAFFIC_TIERS, PLAN_CATALOG } from '@/lib/plans'

const getUserOrganizations = vi.fn()
vi.mock('@/lib/api/organization', () => ({
  getUserOrganizations: (...a: unknown[]) => getUserOrganizations(...a),
}))

import { parsePlanQuery, planQueryString, resolvePlanDestination } from '../plan-destination'

const PAID_PLAN = PLAN_CATALOG[0].id
const A_LIMIT = TRAFFIC_TIERS[0].value

beforeEach(() => {
  getUserOrganizations.mockReset()
})

describe('parsePlanQuery', () => {
  it('accepts a real plan/interval/limit combination', () => {
    const params = new URLSearchParams(`plan=${PAID_PLAN}&interval=year&limit=${A_LIMIT}`)
    expect(parsePlanQuery(params)).toEqual({ plan: PAID_PLAN, interval: 'year', limit: A_LIMIT })
  })

  it.each([
    ['free — never sold through this address', `plan=free&interval=month&limit=${A_LIMIT}`],
    ['an unknown plan id', `plan=not-a-real-plan&interval=month&limit=${A_LIMIT}`],
    ['a missing plan', `interval=month&limit=${A_LIMIT}`],
    ['an unknown interval', `plan=${PAID_PLAN}&interval=weekly&limit=${A_LIMIT}`],
    ['a missing interval', `plan=${PAID_PLAN}&limit=${A_LIMIT}`],
    // The custom "10M+ / contact us" tier is not a TRAFFIC_TIERS value —
    // PricingSection never routes it through this address either.
    ['the custom 10M+ tier', `plan=${PAID_PLAN}&interval=month&limit=10000001`],
    ['a non-numeric limit', `plan=${PAID_PLAN}&interval=month&limit=lots`],
    ['a missing limit', `plan=${PAID_PLAN}&interval=month`],
    ['no query at all', ''],
  ])('rejects %s', (_label, qs) => {
    expect(parsePlanQuery(new URLSearchParams(qs))).toBeNull()
  })
})

describe('planQueryString', () => {
  it('builds the exact plan=&interval=&limit= shape', () => {
    expect(planQueryString({ plan: PAID_PLAN, interval: 'month', limit: A_LIMIT })).toBe(
      `plan=${PAID_PLAN}&interval=month&limit=${A_LIMIT}`,
    )
  })
})

describe('resolvePlanDestination', () => {
  const query = { plan: PAID_PLAN, interval: 'month' as const, limit: A_LIMIT }

  it('anonymous: starts a signup that remembers /setup/org with the plan params', async () => {
    const dest = await resolvePlanDestination({ isSignedIn: false, subscriptionStatus: null, query })
    expect(dest).toEqual({ kind: 'signup', returnTarget: `/setup/org?${planQueryString(query)}` })
    expect(getUserOrganizations).not.toHaveBeenCalled()
  })

  it('signed in with an active subscription: the plan switcher, never the wizard', async () => {
    const dest = await resolvePlanDestination({ isSignedIn: true, subscriptionStatus: 'active', query })
    expect(dest).toEqual({ kind: 'navigate', path: `/switch?${planQueryString(query)}` })
    expect(getUserOrganizations).not.toHaveBeenCalled()
  })

  it.each(['trialing', 'past_due', 'canceled', null, undefined])(
    'signed in, status %s (not active), zero organizations: /setup/org',
    async (status) => {
      getUserOrganizations.mockResolvedValue([])
      const dest = await resolvePlanDestination({ isSignedIn: true, subscriptionStatus: status, query })
      expect(dest).toEqual({ kind: 'navigate', path: `/setup/org?${planQueryString(query)}` })
    },
  )

  it('signed in, not active, has an organization already: /setup/plan', async () => {
    getUserOrganizations.mockResolvedValue([{ organization_id: 'org_1' }])
    const dest = await resolvePlanDestination({ isSignedIn: true, subscriptionStatus: 'trialing', query })
    expect(dest).toEqual({ kind: 'navigate', path: `/setup/plan?${planQueryString(query)}` })
  })

  it('the organizations read fails: falls back to /setup/plan, not a thrown error', async () => {
    getUserOrganizations.mockRejectedValue(new Error('network'))
    const dest = await resolvePlanDestination({ isSignedIn: true, subscriptionStatus: 'trialing', query })
    expect(dest).toEqual({ kind: 'navigate', path: `/setup/plan?${planQueryString(query)}` })
  })
})
