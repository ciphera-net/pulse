import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getRequestIdFromError,
  formatErrorMessage,
  logErrorWithRequestId,
  getSupportMessage,
} from '../errorHandler'
import { setLastRequestId, clearLastRequestId } from '../requestId'

beforeEach(() => {
  clearLastRequestId()
})

describe('getRequestIdFromError', () => {
  it('extracts request ID from error response body', () => {
    const errorData = { error: { request_id: 'REQ123_abc' } }
    expect(getRequestIdFromError(errorData)).toBe('REQ123_abc')
  })

  it('falls back to last stored request ID when not in response', () => {
    setLastRequestId('REQfallback_xyz')
    expect(getRequestIdFromError({ error: {} })).toBe('REQfallback_xyz')
  })

  it('falls back to last stored request ID when no error data', () => {
    setLastRequestId('REQfallback_xyz')
    expect(getRequestIdFromError()).toBe('REQfallback_xyz')
  })

  it('returns null when no ID available anywhere', () => {
    expect(getRequestIdFromError()).toBeNull()
  })
})

describe('formatErrorMessage', () => {
  it('returns plain message when no request ID available', () => {
    expect(formatErrorMessage('Something failed')).toBe('Something failed')
  })

  it('appends request ID in development mode', () => {
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    setLastRequestId('REQ123_abc')

    const msg = formatErrorMessage('Something failed')
    expect(msg).toContain('Something failed')
    expect(msg).toContain('REQ123_abc')

    process.env.NODE_ENV = original
  })

  it('appends request ID when showRequestId option is set', () => {
    setLastRequestId('REQ123_abc')
    const msg = formatErrorMessage('Something failed', undefined, { showRequestId: true })
    expect(msg).toContain('REQ123_abc')
  })
})

describe('logErrorWithRequestId', () => {
  it('logs with request ID when available', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setLastRequestId('REQ123_abc')

    logErrorWithRequestId('TestContext', new Error('fail'))

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('REQ123_abc'),
      expect.any(Error)
    )
    spy.mockRestore()
  })

  it('logs without request ID when not available', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logErrorWithRequestId('TestContext', new Error('fail'))

    expect(spy).toHaveBeenCalledWith('[TestContext]', expect.any(Error))
    spy.mockRestore()
  })
})

describe('getSupportMessage', () => {
  it('includes request ID when available', () => {
    const errorData = { error: { request_id: 'REQ123_abc' } }
    const msg = getSupportMessage(errorData)
    expect(msg).toContain('REQ123_abc')
    expect(msg).toContain('contact support')
  })

  it('returns generic message when no request ID', () => {
    const msg = getSupportMessage()
    expect(msg).toBe('If this persists, please contact support.')
  })
})
