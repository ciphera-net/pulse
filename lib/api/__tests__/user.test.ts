import { describe, it, expect, vi, beforeEach } from 'vitest'

// deleteAccount (Slice 4) sends the server-minted re-auth token as { reauth_token }
// and loud-fails on an empty token before any network call. The 409
// owns_organizations humanization must remain intact.
//
// NOTE: we use mockClear (not mockReset) + the *Once helpers on purpose. Under
// vitest v4, a mockReset in beforeEach combined with a persistent mockRejectedValue
// leaves a stray rejected promise that surfaces as an unhandled rejection; the Once
// variants scope the resolve/reject to the single expected call.
vi.mock('../client', () => {
  class ApiError extends Error {
    status: number
    data?: Record<string, unknown>
    constructor(message: string, status: number, data?: Record<string, unknown>) {
      super(message)
      this.status = status
      this.data = data
    }
  }
  return { default: vi.fn(), ApiError }
})

import apiRequest, { ApiError } from '../client'
import { deleteAccount, ownedOrganizationsMessage } from '../user'

const apiRequestSpy = vi.mocked(apiRequest)

describe('deleteAccount', () => {
  beforeEach(() => apiRequestSpy.mockClear())

  it('POSTs DELETE /auth/user with { reauth_token } and no workspaces by default', async () => {
    apiRequestSpy.mockResolvedValueOnce(undefined)

    await deleteAccount('tok-abc123')

    expect(apiRequestSpy).toHaveBeenCalledTimes(1)
    const [path, options] = apiRequestSpy.mock.calls[0]
    expect(path).toBe('/auth/user')
    expect(options).toMatchObject({ method: 'DELETE' })
    // An empty list is the server's OLD behaviour byte for byte: it refuses and
    // says what blocks. A caller that names nothing has agreed to nothing.
    expect(JSON.parse((options as { body: string }).body)).toEqual({
      reauth_token: 'tok-abc123',
      delete_organizations: [],
    })
  })

  it('echoes exactly the workspace ids it was given', async () => {
    apiRequestSpy.mockResolvedValueOnce(undefined)

    await deleteAccount('tok-abc123', ['org-1', 'org-2'])

    const [, options] = apiRequestSpy.mock.calls[0]
    expect(JSON.parse((options as { body: string }).body)).toEqual({
      reauth_token: 'tok-abc123',
      delete_organizations: ['org-1', 'org-2'],
    })
  })

  it('throws before any fetch when the token is empty (loud-fail)', async () => {
    await expect(deleteAccount('')).rejects.toThrow('Re-authentication token missing')
    expect(apiRequestSpy).not.toHaveBeenCalled()
  })

  it('humanizes a 409 owns_organizations body into an actionable message', async () => {
    apiRequestSpy.mockRejectedValueOnce(
      new ApiError('Conflict', 409, {
        error: 'owns_organizations',
        organizations: [
          {
            id: 'o1',
            name: 'Acme',
            slug: 'acme',
            member_count: 3,
            other_admins: 0,
            action_required: 'transfer_ownership',
          },
        ],
      })
    )

    const err = await deleteAccount('tok-abc123').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(err.message).toContain('Acme')
    expect(err.message).toMatch(/transfer ownership/)
  })
})

// PULSE-59: the caller that knows the person is alone re-words the refusal.
describe('ownedOrganizationsMessage', () => {
  const solo = { id: 'o1', name: 'Acme', slug: 'acme', member_count: 1, other_admins: 0, action_required: 'delete_workspace' as const }

  it('alone: no team, no Settings section, just try again', () => {
    const msg = ownedOrganizationsMessage([solo], true)
    expect(msg).toBe('Something changed since this page loaded. Check what goes with your account, then try again.')
    expect(msg).not.toMatch(/team|workspace|organi[sz]ation/i)
  })

  it('team wording whenever the refusal itself says there is a team', () => {
    expect(ownedOrganizationsMessage([solo], false)).toMatch(/You own 1 team[\s\S]*Acme — delete team[\s\S]*Go to Settings → Team\./)
    // "Alone" on this page, but the server lists two, or a transfer: that is a team.
    expect(ownedOrganizationsMessage([solo, { ...solo, id: 'o2', name: 'Beta' }], true)).toMatch(/You own 2 teams/)
    expect(ownedOrganizationsMessage([{ ...solo, action_required: 'transfer_ownership' }], true)).toMatch(/transfer ownership/)
  })
})
