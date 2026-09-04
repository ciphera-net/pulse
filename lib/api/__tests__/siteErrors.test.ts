import { describe, it, expect, vi } from 'vitest'

vi.mock('@ciphera-net/facet', () => ({
  getAuthErrorMessage: (e: unknown) =>
    (e as { status?: number })?.status === 403 ? 'Invalid credentials' : '',
}))

import { siteCreateError } from '../siteErrors'
import { ApiError } from '../client'

describe('siteCreateError', () => {
  // The whole point of P0: the real server reason must survive, because the
  // shared client overwrites ApiError.message with status-derived auth copy.
  it("returns the server's own message, not the status-derived auth message", () => {
    const err = new ApiError('Invalid credentials', 403, { error: 'Organization context required.', code: 'ORG_REQUIRED' })
    expect(siteCreateError(err).message).toBe('Organization context required.')
  })

  it('surfaces a 409 domain rejection with its human message', () => {
    const err = new ApiError('Something went wrong', 409, {
      error: 'That domain is already being tracked by a Pulse site.', code: 'DOMAIN_TAKEN',
    })
    expect(siteCreateError(err).message).toMatch(/already being tracked/)
  })

  it('surfaces the pending-deletion instruction', () => {
    const err = new ApiError('Something went wrong', 409, {
      error: 'This domain is pending deletion. Restore the existing site or permanently delete it first.',
      code: 'DOMAIN_PENDING_DELETION',
    })
    expect(siteCreateError(err).message).toMatch(/pending deletion/)
  })

  // A create OUTAGE must not read as "your domain is bad": with no skip on the
  // gated step, the user needs to know to retry, not to doubt their domain.
  it('treats a 5xx as transient and does NOT echo the server body', () => {
    const err = new ApiError('Something went wrong', 500, { error: 'Failed to check domain' })
    const m = siteCreateError(err).message
    expect(m).toMatch(/try again in a moment/)
    expect(m).toMatch(/Nothing is wrong with the domain/)
    expect(m).not.toMatch(/Failed to check domain/)
  })

  it('treats a network failure (no response) as transient', () => {
    expect(siteCreateError(new TypeError('Failed to fetch')).message).toMatch(/could not reach the server/)
  })

  it('falls back to the auth message when the server sent no body message', () => {
    const err = new ApiError('x', 403, {})
    expect(siteCreateError(err).message).toBe('Invalid credentials')
  })
})
