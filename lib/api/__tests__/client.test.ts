import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@ciphera-net/ui', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

const { getLoginUrl, getSignupUrl, ApiError } = await import('../client')

describe('getLoginUrl', () => {
  it('builds login URL with default redirect', () => {
    const url = getLoginUrl()
    expect(url).toContain('/login')
    expect(url).toContain('client_id=pulse-app')
    expect(url).toContain('response_type=code')
    expect(url).toContain(encodeURIComponent('/auth/callback'))
  })

  it('builds login URL with custom redirect', () => {
    const url = getLoginUrl('/custom/path')
    expect(url).toContain(encodeURIComponent('/custom/path'))
  })
})

describe('getSignupUrl', () => {
  it('builds signup URL with default redirect', () => {
    const url = getSignupUrl()
    expect(url).toContain('/signup')
    expect(url).toContain('client_id=pulse-app')
    expect(url).toContain('response_type=code')
  })

  it('builds signup URL with custom redirect', () => {
    const url = getSignupUrl('/onboarding')
    expect(url).toContain(encodeURIComponent('/onboarding'))
  })
})

describe('ApiError', () => {
  it('creates error with message and status', () => {
    const err = new ApiError('Not found', 404)
    expect(err.message).toBe('Not found')
    expect(err.status).toBe(404)
    expect(err.data).toBeUndefined()
    expect(err).toBeInstanceOf(Error)
  })

  it('creates error with data payload', () => {
    const data = { retryAfter: 30 }
    const err = new ApiError('Rate limited', 429, data)
    expect(err.status).toBe(429)
    expect(err.data).toEqual({ retryAfter: 30 })
  })

  it('is catchable as a standard Error', () => {
    const fn = () => { throw new ApiError('fail', 500) }
    expect(fn).toThrow(Error)
    expect(fn).toThrow('fail')
  })
})
