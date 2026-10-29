import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'

/**
 * Sign-out empties Cache Storage.
 *
 * 🔴 THE LEAK THIS GUARDS. The service worker's runtime caches hold pages and
 * API responses fetched under the session. Sign-out cleared the token, the
 * stored user and the vault key, and left those caches behind for whoever uses
 * the browser next.
 *
 * Renders the real provider with its collaborators stubbed at the module edge.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/',
}))
vi.mock('swr', () => ({ useSWRConfig: () => ({ mutate: vi.fn() }) }))
vi.mock('@/lib/api/client', () => ({
  default: vi.fn(async () => ({ id: 'u1', email: '', totp_enabled: false })),
  setAccessToken: vi.fn(),
  setRefreshHandler: vi.fn(),
  setActiveTeam: vi.fn(),
  getActiveTeam: vi.fn(() => null),
  setTeamRecoveryHandler: vi.fn(),
  markTeamResolved: vi.fn(),
}))
vi.mock('@ciphera-net/facet', () => ({
  LoadingOverlay: () => null,
  SessionExpiryWarning: () => null,
  useSessionSync: vi.fn(),
  useSessionRefresh: () => ({
    showExpiredModal: false,
    refreshWithMutex: vi.fn(),
    refreshDetailed: vi.fn(async () => ({ ok: false, transient: false })),
  }),
}))
vi.mock('@/app/actions/auth', () => ({
  logoutAction: vi.fn(async () => ({ revoked: true })),
  getSessionAction: vi.fn(async () => null),
  setActiveTeamAction: vi.fn(),
}))
vi.mock('@/lib/api/organization', () => ({
  getUserOrganizations: vi.fn(async () => [{ organization_id: 'o1' }]),
  getOrganization: vi.fn(),
  ensureDefaultOrganization: vi.fn(),
}))
vi.mock('@/lib/auth/switchOrganization', () => ({ activateTeam: vi.fn(), switchOrganizationSession: vi.fn() }))
vi.mock('@/lib/api/me', () => ({ getMe: vi.fn(), pickActiveTeam: vi.fn(), teamRole: vi.fn() }))
vi.mock('@/lib/api/sites', () => ({ listSites: vi.fn(async () => []) }))
vi.mock('@/lib/auth/vault-store', () => ({ forgetVaultKeys: vi.fn(), loadVaultKey: vi.fn(async () => null) }))
vi.mock('@/lib/auth/vault-restore', () => ({ openVaultWithKey: vi.fn() }))
vi.mock('@/lib/utils/storage-cleanup', () => ({ cleanupStaleStorage: vi.fn() }))
vi.mock('@/lib/api/oauth-store', () => ({ forgetAllPendingAuth: vi.fn() }))
vi.mock('@/lib/utils/clientEvents', () => ({ reportClientEvent: vi.fn() }))

import { AuthProvider, useAuth } from '@/lib/auth/context'
import { logoutAction } from '@/app/actions/auth'

let api: ReturnType<typeof useAuth>
function Probe() {
  api = useAuth()
  return null
}

function stubCaches(keys: string[]) {
  const del = vi.fn(async () => true)
  vi.stubGlobal('caches', { keys: vi.fn(async () => keys), delete: del })
  return del
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(logoutAction).mockClear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('logout clears Cache Storage', () => {
  it('deletes every cache by name', async () => {
    const del = stubCaches(['pages-v1', 'api-v1', 'workbox-precache'])
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(api.loading).toBe(false))

    await act(async () => { await api.logout() })

    expect(logoutAction).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledTimes(3)
    expect(del.mock.calls.map((c) => (c as unknown[])[0]).sort()).toEqual(['api-v1', 'pages-v1', 'workbox-precache'])
  })

  it('still signs out where Cache Storage does not exist', async () => {
    vi.stubGlobal('caches', undefined)
    localStorage.setItem('user', '{"id":"u1"}')
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(api.loading).toBe(false))

    await act(async () => { await api.logout() })

    expect(localStorage.getItem('user')).toBeNull()
  })
})
