import { describe, it, expect, vi } from 'vitest'

vi.mock('@ciphera-net/facet', () => ({
  getAuthErrorMessage: (e: unknown) =>
    (e as { status?: number })?.status === 403 ? 'Invalid credentials' : '',
}))

import { orgCreateError } from '../orgErrors'
import { ApiError } from '../client'

// The only P0 in the 07-09 friction audit. ciphera-id's guaranteed rejections
// — a name under three characters, a slug already taken — came out of a form
// whose ONLY field is that name as "Something went wrong, please try again."
// The shared client overwrites ApiError.message with status-derived auth copy,
// so the server's own words live in .data and had to be read from there.
describe('orgCreateError', () => {
  it("returns the server's own message, not the status-derived auth message", () => {
    const err = new ApiError('Invalid credentials', 403, {
      error: 'Organization name must be at least 3 characters',
    })
    expect(orgCreateError(err).message).toBe('Organization name must be at least 3 characters')
  })

  it('surfaces a slug collision with its human message', () => {
    const err = new ApiError('Something went wrong', 409, {
      error: 'That workspace URL is already taken',
    })
    expect(orgCreateError(err).message).toBe('That workspace URL is already taken')
  })

  it('does NOT show the server message on a 5xx — it says nothing about the name', () => {
    const err = new ApiError('Internal Server Error', 500, { error: 'pq: deadlock detected' })
    expect(orgCreateError(err).message).toContain('Nothing is wrong with the name')
    expect(orgCreateError(err).message).not.toContain('deadlock')
  })

  it('treats a throw with no response at all as transient', () => {
    expect(orgCreateError(new TypeError('Failed to fetch')).message).toContain('reach the server')
  })

  it('falls back to readable copy when the body carries no message', () => {
    const err = new ApiError('', 400, {})
    expect(orgCreateError(err).message).toBe('We could not create that workspace. Please try again.')
  })

  it('ignores a blank server message rather than showing an empty error', () => {
    const err = new ApiError('', 400, { error: '   ' })
    expect(orgCreateError(err).message).toBe('We could not create that workspace. Please try again.')
  })
})
