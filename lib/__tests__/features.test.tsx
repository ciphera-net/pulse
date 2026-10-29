// useFeature (OPS-27): the active team's betas from GET /api/v1/me. Against the real SWR; only the
// API function and the session are stubbed.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { SWRConfig } from 'swr'

const getMe = vi.hoisted(() => vi.fn())
const session = vi.hoisted(() => ({ user: { id: 'u1', org_id: 'org-1', role: 'owner' } as Record<string, unknown> | null }))
vi.mock('@/lib/api/me', () => ({ getMe }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: session.user }) }))

import { useFeature } from '@/lib/features'
import { SITE_PAGES, SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'

const demo: SiteScope = { siteId: 'halden', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full' }
const me = (teams: Array<Record<string, unknown>>) => ({ user_id: 'u1', default_team_id: 'org-1', teams })
const team = (id: string, features?: string[]) => ({
  id, name: id, slug: id, role: 'owner', onboarding_completed_at: null, last_active_at: null, joined_at: '2026-10-01T00:00:00Z',
  ...(features ? { features } : {}),
})

function Probe() {
  return <span data-testid="flag">{String(useFeature('beta-x'))}</span>
}
const mount = (scope: SiteScope = memberScope('site-1')) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SiteScopeProvider scope={scope}><Probe /></SiteScopeProvider>
    </SWRConfig>,
  )

beforeEach(() => {
  getMe.mockReset()
  session.user = { id: 'u1', org_id: 'org-1', role: 'owner' }
})
afterEach(() => cleanup())

describe('useFeature', () => {
  it('is null until /me answers, then true for the enrolled active team', async () => {
    let answer: (v: unknown) => void = () => {}
    getMe.mockReturnValue(new Promise((r) => { answer = r }))
    const { getByTestId, findByText } = mount()
    expect(getByTestId('flag').textContent).toBe('null')
    answer(me([team('org-1', ['beta-x']), team('org-2', [])]))
    expect(await findByText('true')).toBeInTheDocument()
  })

  it('is false when the flag is on for ANOTHER team only', async () => {
    getMe.mockResolvedValue(me([team('org-1', []), team('org-2', ['beta-x'])]))
    expect(await mount().findByText('false')).toBeInTheDocument()
  })

  it('follows a team switch without a second request', async () => {
    getMe.mockResolvedValue(me([team('org-1', []), team('org-2', ['beta-x'])]))
    const view = mount()
    expect(await view.findByText('false')).toBeInTheDocument()
    session.user = { id: 'u1', org_id: 'org-2', role: 'owner' }
    view.rerender(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SiteScopeProvider scope={memberScope('site-1')}><Probe /></SiteScopeProvider>
      </SWRConfig>,
    )
    expect(await view.findByText('true')).toBeInTheDocument()
  })

  it('reads a response without `features` (an older backend) as off', async () => {
    getMe.mockResolvedValue(me([team('org-1')]))
    expect(await mount().findByText('false')).toBeInTheDocument()
  })

  it('stays null, so the screen stays closed, when /me fails', async () => {
    getMe.mockRejectedValue(new Error('boom'))
    const { getByTestId } = mount()
    await new Promise((r) => setTimeout(r, 30))
    expect(getByTestId('flag').textContent).toBe('null')
  })

  it('asks nothing and offers no beta on a public page', async () => {
    getMe.mockResolvedValue(me([team('org-1', ['beta-x'])]))
    const { getByTestId } = mount(demo)
    await new Promise((r) => setTimeout(r, 30))
    expect(getMe).not.toHaveBeenCalled()
    expect(getByTestId('flag').textContent).toBe('false')
  })
})
