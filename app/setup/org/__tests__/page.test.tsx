import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

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

const clearOrgScopedCaches = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/swr/org-switch', () => ({
  clearOrgScopedCaches: (...a: unknown[]) => clearOrgScopedCaches(...a),
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
  clearOrgScopedCaches.mockClear()
})

describe('SetupOrgPage org creation', () => {
  it('purges the SWR cache BEFORE navigating — the session now points at a new org', async () => {
    render(<SetupOrgPage />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Fresh Org' } })
    fireEvent.click(screen.getByRole('button', { name: /Create/i }))

    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    // Every cached fact (sites, subscription, invoices, permissions) belongs to
    // the OLD org. Without the purge, the site step rendered the previous
    // org's site as "Pick up where you left off" (measured on staging, 25-08).
    expect(clearOrgScopedCaches).toHaveBeenCalledTimes(1)
    const purgeOrder = clearOrgScopedCaches.mock.invocationCallOrder[0]
    const navOrder = mockPush.mock.invocationCallOrder[0]
    expect(purgeOrder).toBeLessThan(navOrder)
  })
})
