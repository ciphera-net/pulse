import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'

/**
 * The decrypted email and display name live in memory only.
 *
 * 🔴 THE LEAK THIS GUARDS. Both came out of the zero-knowledge vault and were
 * then written to localStorage['user'] by every path that stores the session,
 * readable by anything on the origin long after the vault key was gone. The
 * stored object keeps restoring the session on reload; the vault effect
 * re-merges the PII in memory.
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

import { AuthProvider, useAuth, persistUser, scrubStoredUserPii } from '@/lib/auth/context'

let api: ReturnType<typeof useAuth>
function Probe() {
  api = useAuth()
  return <span data-testid="email">{api.user?.email ?? 'none'}</span>
}

beforeEach(() => {
  localStorage.clear()
})

describe('the stored user carries no decrypted PII', () => {
  it('login keeps email and display_name in memory and out of localStorage', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(api.loading).toBe(false))

    act(() => {
      api.login({ id: 'u1', email: 'ada@example.com', display_name: 'Ada', totp_enabled: false })
    })

    await waitFor(() => expect(screen.getByTestId('email').textContent).toBe('ada@example.com'))
    expect(api.user?.display_name).toBe('Ada')

    const stored = JSON.parse(localStorage.getItem('user') as string)
    expect(stored.id).toBe('u1')
    expect('email' in stored).toBe(false)
    expect('display_name' in stored).toBe(false)
    expect(localStorage.getItem('user')).not.toContain('ada@example.com')

    // The profile fetch that follows must not bring them back either.
    await waitFor(() => expect(api.user?.email).toBe('ada@example.com'))
    expect(localStorage.getItem('user')).not.toContain('ada@example.com')
    expect(localStorage.getItem('user')).not.toContain('Ada')
  })

  it('persistUser keeps every other field so a reload still restores the session', () => {
    persistUser({ id: 'u1', email: 'a@b.c', display_name: 'A', totp_enabled: true, org_id: 'o1', role: 'owner' })
    expect(JSON.parse(localStorage.getItem('user') as string)).toEqual({
      id: 'u1', totp_enabled: true, org_id: 'o1', role: 'owner',
    })
  })

  it('scrubs an entry written by an earlier build', () => {
    localStorage.setItem('user', JSON.stringify({ id: 'u1', email: 'a@b.c', display_name: 'A', totp_enabled: false }))
    scrubStoredUserPii()
    expect(JSON.parse(localStorage.getItem('user') as string)).toEqual({ id: 'u1', totp_enabled: false })
  })
})
