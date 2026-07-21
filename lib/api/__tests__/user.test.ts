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
import { deleteAccount } from '../user'

const apiRequestSpy = vi.mocked(apiRequest)

describe('deleteAccount', () => {
  beforeEach(() => apiRequestSpy.mockClear())

  it('POSTs DELETE /auth/user with { reauth_token }', async () => {
    apiRequestSpy.mockResolvedValueOnce(undefined)

    await deleteAccount('tok-abc123')

    expect(apiRequestSpy).toHaveBeenCalledTimes(1)
    const [path, options] = apiRequestSpy.mock.calls[0]
    expect(path).toBe('/auth/user')
    expect(options).toMatchObject({ method: 'DELETE' })
    expect(JSON.parse((options as { body: string }).body)).toEqual({ reauth_token: 'tok-abc123' })
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
