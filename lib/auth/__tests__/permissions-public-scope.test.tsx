// usePermissions under a public scope (PUL-34 Phase 2 review, 20-10-2026): a signed-in visitor on /demo or a share link is
// never asked for their permissions (the request would carry their session and team to a member route from a public
// page), and holds none there. Against the real SWR; only the API function and the session are stubbed.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { SWRConfig } from 'swr'

const getMyPermissions = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/roles', () => ({ getMyPermissions }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'owner' } }) }))

import { useCan } from '@/lib/auth/permissions'
import { SITE_PAGES, SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'

const demo: SiteScope = { siteId: 'halden', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full' }

function Probe() {
  return <span data-testid="can">{String(useCan('funnels.manage'))}</span>
}
const under = (scope: SiteScope) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SiteScopeProvider scope={scope}><Probe /></SiteScopeProvider>
    </SWRConfig>,
  )

beforeEach(() => {
  getMyPermissions.mockReset()
  getMyPermissions.mockResolvedValue({ permissions: ['funnels.manage'] })
})
afterEach(() => cleanup())

describe('usePermissions under a public scope', () => {
  it('asks nothing and allows nothing for a signed-in visitor on the demo', async () => {
    const { getByTestId } = under(demo)
    await new Promise((r) => setTimeout(r, 30))
    expect(getMyPermissions).not.toHaveBeenCalled()
    expect(getByTestId('can').textContent).toBe('false')
  })

  it('control: a member scope still asks, and the owner may', async () => {
    const { findByText } = under(memberScope('site-1'))
    expect(await findByText('true')).toBeInTheDocument()
    expect(getMyPermissions).toHaveBeenCalledTimes(1)
  })
})
