import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * lib/api/organization.ts (PULSE-92 Phase 5): every function targets Pulse's
 * own team-write routes now, never Ciphera ID's `/auth/organizations*`. The
 * routing decision itself lives in `apiRequest` (`isAuthRequest =
 * endpoint.startsWith('/auth')`) — these tests pin what organization.ts hands
 * it: the path, method and body for each function, exercised through the
 * REAL client so a function that quietly kept an `/auth` prefix would fail
 * here by landing on ID_API_URL instead of API_URL.
 */

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

const { API_URL, ID_API_URL, setAccessToken, setActiveTeam, markTeamResolved } = await import('../client')
import * as org from '../organization'

function okJson(body: unknown = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function lastCall(spy: ReturnType<typeof vi.fn>): { url: string; method: string; body: unknown } {
  const [url, init] = spy.mock.calls.at(-1) as [string, RequestInit]
  return { url, method: (init.method || 'GET'), body: init.body ? JSON.parse(String(init.body)) : undefined }
}

beforeEach(() => {
  setAccessToken('tok-1')
  setActiveTeam(null)
  markTeamResolved()
})

describe('every organization.ts function targets Pulse (API_URL), never Ciphera ID', () => {
  it('createOrganization: POST /organizations', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({ id: 'o1' }))
    vi.stubGlobal('fetch', fetchSpy)
    await org.createOrganization('Acme', 'acme')
    const call = lastCall(fetchSpy)
    expect(call.url).toBe(`${API_URL}/api/v1/organizations`)
    expect(call.url).not.toContain(ID_API_URL)
    expect(call.method).toBe('POST')
    expect(call.body).toEqual({ name: 'Acme', slug: 'acme' })
  })

  it('ensureDefaultOrganization: POST /organizations/ensure-default', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({ created: true, organization: { id: 'o1', name: 'n', slug: 's' } }))
    vi.stubGlobal('fetch', fetchSpy)
    await org.ensureDefaultOrganization()
    const call = lastCall(fetchSpy)
    expect(call.url).toBe(`${API_URL}/api/v1/organizations/ensure-default`)
    expect(call.method).toBe('POST')
  })

  it('getUserOrganizations: GET /organizations, unwraps {organizations}', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({ organizations: [{ organization_id: 'o1' }] }))
    vi.stubGlobal('fetch', fetchSpy)
    const result = await org.getUserOrganizations()
    const call = lastCall(fetchSpy)
    expect(call.url).toBe(`${API_URL}/api/v1/organizations`)
    expect(call.method).toBe('GET')
    expect(result).toEqual([{ organization_id: 'o1' }])
  })

  it('getUserOrganizations: an absent organizations field answers an empty array, not undefined', async () => {
    // A distinct active team keeps this GET's cache key from colliding with
    // the previous test's identical (method, path, body) key within the same
    // 2s micro-cache window (getRequestKey folds the active team in for
    // exactly this reason).
    setActiveTeam('team-cache-bust')
    const fetchSpy = vi.fn().mockResolvedValue(okJson({}))
    vi.stubGlobal('fetch', fetchSpy)
    expect(await org.getUserOrganizations()).toEqual([])
  })

  it('getOrganization: GET /organizations/:id', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({ id: 'o1' }))
    vi.stubGlobal('fetch', fetchSpy)
    await org.getOrganization('o1')
    expect(lastCall(fetchSpy).url).toBe(`${API_URL}/api/v1/organizations/o1`)
    expect(lastCall(fetchSpy).method).toBe('GET')
  })

  it('deleteOrganization: DELETE /organizations/:id', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({ ok: true }))
    vi.stubGlobal('fetch', fetchSpy)
    await org.deleteOrganization('o1')
    expect(lastCall(fetchSpy).url).toBe(`${API_URL}/api/v1/organizations/o1`)
    expect(lastCall(fetchSpy).method).toBe('DELETE')
  })

  it('completeOnboarding: POST /organizations/:id/complete-onboarding', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({}))
    vi.stubGlobal('fetch', fetchSpy)
    await org.completeOnboarding('o1')
    expect(lastCall(fetchSpy).url).toBe(`${API_URL}/api/v1/organizations/o1/complete-onboarding`)
    expect(lastCall(fetchSpy).method).toBe('POST')
  })

  it('updateOrganization: PUT /organizations/:id', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({ id: 'o1' }))
    vi.stubGlobal('fetch', fetchSpy)
    await org.updateOrganization('o1', 'New name', 'new-slug')
    const call = lastCall(fetchSpy)
    expect(call.url).toBe(`${API_URL}/api/v1/organizations/o1`)
    expect(call.method).toBe('PUT')
    expect(call.body).toEqual({ name: 'New name', slug: 'new-slug' })
  })

  it('getOrganizationMembers: GET /organizations/:id/members, unwraps {members}', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({ members: [{ user_id: 'u1' }] }))
    vi.stubGlobal('fetch', fetchSpy)
    const result = await org.getOrganizationMembers('o1')
    expect(lastCall(fetchSpy).url).toBe(`${API_URL}/api/v1/organizations/o1/members`)
    expect(result).toEqual([{ user_id: 'u1' }])
  })

  it('removeOrganizationMember: DELETE /organizations/:id/members/:userId', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({}))
    vi.stubGlobal('fetch', fetchSpy)
    await org.removeOrganizationMember('o1', 'u1')
    const call = lastCall(fetchSpy)
    expect(call.url).toBe(`${API_URL}/api/v1/organizations/o1/members/u1`)
    expect(call.method).toBe('DELETE')
  })

  it('leaveOrganization: POST /organizations/:id/leave', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({}))
    vi.stubGlobal('fetch', fetchSpy)
    await org.leaveOrganization('o1')
    const call = lastCall(fetchSpy)
    expect(call.url).toBe(`${API_URL}/api/v1/organizations/o1/leave`)
    expect(call.method).toBe('POST')
    expect(call.body).toBeUndefined()
  })

  it('transferOwnership: POST /organizations/:id/transfer-ownership {target_user_id}', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({}))
    vi.stubGlobal('fetch', fetchSpy)
    await org.transferOwnership('o1', 'u2')
    const call = lastCall(fetchSpy)
    expect(call.url).toBe(`${API_URL}/api/v1/organizations/o1/transfer-ownership`)
    expect(call.method).toBe('POST')
    expect(call.body).toEqual({ target_user_id: 'u2' })
  })

  // Pulse's route binds `expires_in` (required, one of 1h/24h/7d/30d; see
  // pulse-backend internal/api/invite_links.go) and resolves it server-side,
  // exactly as Ciphera ID did. An `expires_at` body is a 400 there.
  it('createInviteLink: POST /organizations/:id/invite-links, sends the expires_in duration', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({ id: 'l1' }))
    vi.stubGlobal('fetch', fetchSpy)
    await org.createInviteLink('o1', { name: 'Eng', role: 'member', expires_in: '7d' })
    const call = lastCall(fetchSpy)
    expect(call.url).toBe(`${API_URL}/api/v1/organizations/o1/invite-links`)
    expect(call.method).toBe('POST')
    expect(call.body).toEqual({ name: 'Eng', role: 'member', expires_in: '7d' })
  })

  it('getInviteLinks: GET /organizations/:id/invite-links, unwraps {invite_links}', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({ invite_links: [{ id: 'l1' }] }))
    vi.stubGlobal('fetch', fetchSpy)
    const result = await org.getInviteLinks('o1')
    expect(lastCall(fetchSpy).url).toBe(`${API_URL}/api/v1/organizations/o1/invite-links`)
    expect(result).toEqual([{ id: 'l1' }])
  })

  it('revokeInviteLink: DELETE /organizations/:id/invite-links/:linkId', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({}))
    vi.stubGlobal('fetch', fetchSpy)
    await org.revokeInviteLink('o1', 'l1')
    const call = lastCall(fetchSpy)
    expect(call.url).toBe(`${API_URL}/api/v1/organizations/o1/invite-links/l1`)
    expect(call.method).toBe('DELETE')
  })

  it('acceptInviteLink: POST /invite-links/:code/accept', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson({ organization_id: 'o1' }))
    vi.stubGlobal('fetch', fetchSpy)
    const result = await org.acceptInviteLink('code1')
    const call = lastCall(fetchSpy)
    expect(call.url).toBe(`${API_URL}/api/v1/invite-links/code1/accept`)
    expect(call.method).toBe('POST')
    expect(result).toEqual({ organization_id: 'o1' })
  })
})

describe('shouldProvisionWorkspace (pure, unchanged by Phase 5)', () => {
  it('is false only for a /join target', () => {
    expect(org.shouldProvisionWorkspace('/join/abc')).toBe(false)
    expect(org.shouldProvisionWorkspace('/sites')).toBe(true)
    expect(org.shouldProvisionWorkspace(null)).toBe(true)
    expect(org.shouldProvisionWorkspace(undefined)).toBe(true)
  })
})
