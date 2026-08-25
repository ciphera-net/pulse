import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'

// --- Mocks ---------------------------------------------------------------
// Deliberately NOT mocked: swr and @/lib/swr/org-switch. The first version of
// the org-switch cache fix used the GLOBAL mutate, which never touches the
// app's custom SWR cache provider — and its unit test mocked the purge module,
// so a fix that cleared a cache nothing reads passed green while the stale-org
// bug survived on staging. This test seeds a REAL provider cache and asserts
// the entry is actually gone.

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(''),
}))

const login = vi.fn()
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { org_id: 'org_old', display_name: 'QA' }, login }),
}))

const setOrg = vi.fn()
const completeStep = vi.fn()
vi.mock('@/lib/setup/context', () => ({
  useSetup: () => ({ setOrg, completeStep }),
}))

vi.mock('@/lib/api/organization', () => ({
  createOrganization: vi.fn().mockResolvedValue({ id: 'org_new' }),
  switchContext: vi.fn().mockResolvedValue({ access_token: 'tok' }),
}))

vi.mock('@/app/actions/auth', () => ({
  setSessionAction: vi.fn().mockResolvedValue({ success: true, user: { id: 'u1', email: 'qa@x', org_id: 'org_new' } }),
}))

vi.mock('@/lib/api/client', () => ({
  default: vi.fn().mockResolvedValue({ id: 'u1', email: 'qa@x', totp_enabled: false, org_id: 'org_new' }),
}))

vi.mock('@/lib/welcomeAnalytics', () => ({
  trackWelcomeWorkspaceCreated: vi.fn(),
}))

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
  PlusIcon: () => <span />,
}))

import SetupOrgPage from '../page'

beforeEach(() => {
  mockPush.mockClear()
})

describe('SetupOrgPage org creation', () => {
  it('purges the PROVIDER-SCOPED SWR cache before navigating', async () => {
    // Seed the cache the way the app would have it mid-session: the OLD org's
    // sites, the exact rows that rendered as "Pick up where you left off" on
    // the fresh org (measured on staging, 25-08).
    const cache = new Map()
    cache.set('sites', { data: [{ id: 'old-site', domain: 'old.example.com', created_at: '2026-07-18' }] })
    cache.set('subscription', { data: { plan_id: 'solo' } })

    render(
      <SWRConfig value={{ provider: () => cache }}>
        <SetupOrgPage />
      </SWRConfig>,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Fresh Org' } })
    fireEvent.click(screen.getByRole('button', { name: /Create/i }))

    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    // The session now points at the new org — the old org's cached facts must
    // be GONE from the provider cache, not merely marked for revalidation.
    expect(cache.get('sites')?.data).toBeUndefined()
    expect(cache.get('subscription')?.data).toBeUndefined()
  })
})
