import { describe, it, expect, vi } from 'vitest'

// getAuthErrorMessage is the fallback; stub it so we test OUR logic, not facet's.
vi.mock('@ciphera-net/facet', () => ({
  getAuthErrorMessage: (e: unknown) =>
    (e as { status?: number })?.status === 403 ? 'Invalid credentials' : '',
}))

import { siteCreateError } from '../siteErrors'
import { ApiError } from '../client'

describe('siteCreateError', () => {
  // The whole point of P0: the real server reason must survive, because the
  // shared client overwrites ApiError.message with status-derived auth copy.
  it("returns the server's own message and code, not the status-derived message", () => {
    const err = new ApiError('Invalid credentials', 403, {
      error: 'Organization context required.', code: 'ORG_REQUIRED',
    })
    expect(siteCreateError(err)).toEqual({ message: 'Organization context required.', code: 'ORG_REQUIRED' })
  })

  it('surfaces DOMAIN_PENDING_DELETION so the caller can offer a restore', () => {
    const err = new ApiError('Something went wrong', 409, {
      error: 'This domain is pending deletion. Restore the existing site or permanently delete it first.',
      code: 'DOMAIN_PENDING_DELETION',
    })
    expect(siteCreateError(err).code).toBe('DOMAIN_PENDING_DELETION')
  })

  it('surfaces DOMAIN_TAKEN with its human message', () => {
    const err = new ApiError('Something went wrong', 409, {
      error: 'That domain is already being tracked by a Pulse site.', code: 'DOMAIN_TAKEN',
    })
    expect(siteCreateError(err).message).toMatch(/already being tracked/)
  })

  it('falls back to the auth message when the server sent no body message', () => {
    const err = new ApiError('x', 403, {})
    expect(siteCreateError(err).message).toBe('Invalid credentials')
  })

  it('falls back to a friendly default for a non-ApiError', () => {
    expect(siteCreateError(new Error('boom')).message).toMatch(/could not add that site/i)
  })
})
