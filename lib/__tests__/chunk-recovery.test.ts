// @vitest-environment jsdom
//
// lib/chunk-recovery: the shared matcher + guarded-reload used by the error
// boundaries (primary path — React delivers failed route imports there) and the
// useVersionCheck global listeners (secondary shapes).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isChunkLoadFailure, isChunkLoadError, recoverFromChunkFailure } from '../chunk-recovery'

describe('isChunkLoadFailure — each arm matches on its own', () => {
  // One case per arm, sharing no other arm's substring, so gutting any single
  // arm goes RED (a prior version of these tests left that mutation alive).
  it.each([
    ['ChunkLoadError'],
    ['Loading chunk 42 failed.'],
    ['Loading CSS chunk 7 failed.'],
    ['Failed to fetch dynamically imported module: https://x/y.js'],
    ['error loading dynamically imported module'],
    ['Importing a module script failed.'],
  ])('matches %s', (text) => {
    expect(isChunkLoadFailure(text)).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isChunkLoadFailure('NetworkError: fetch failed')).toBe(false)
    expect(isChunkLoadFailure('ReferenceError: foo is not defined')).toBe(false)
    expect(isChunkLoadFailure('')).toBe(false)
  })
})

describe('isChunkLoadError — error-shaped inputs', () => {
  it('matches on error NAME alone (minified builds can strip the message)', () => {
    expect(isChunkLoadError({ name: 'ChunkLoadError', message: '' })).toBe(true)
  })

  it('matches Error instances and rejects unrelated ones', () => {
    expect(isChunkLoadError(new Error('Loading chunk 9 failed'))).toBe(true)
    expect(isChunkLoadError(new Error('boom'))).toBe(false)
  })

  it('is safe on null, undefined and string reasons', () => {
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError('ChunkLoadError: Loading chunk 1 failed')).toBe(true)
  })
})

describe('recoverFromChunkFailure — the loop guard', () => {
  let reloadMock: ReturnType<typeof vi.fn>
  const realLocation = window.location

  beforeEach(() => {
    sessionStorage.clear()
    reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, reload: reloadMock },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
    vi.restoreAllMocks()
  })

  it('reloads on the first failure and arms the guard', () => {
    expect(recoverFromChunkFailure()).toBe(true)
    expect(reloadMock).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('pulse-chunk-recovery-at')).not.toBeNull()
  })

  it('refuses a second reload inside the guard window', () => {
    expect(recoverFromChunkFailure()).toBe(true)
    expect(recoverFromChunkFailure()).toBe(false)
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('reloads again once the guard window has passed', () => {
    sessionStorage.setItem('pulse-chunk-recovery-at', String(Date.now() - 61_000))
    expect(recoverFromChunkFailure()).toBe(true)
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('never reloads while OFFLINE — the tab may be running fine off the service worker', () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
    expect(recoverFromChunkFailure()).toBe(false)
    expect(reloadMock).not.toHaveBeenCalled()
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true })
  })

  it('treats a guard timestamp in the FUTURE (clock rollback) as expired, not as armed forever', () => {
    sessionStorage.setItem('pulse-chunk-recovery-at', String(Date.now() + 3_600_000))
    expect(recoverFromChunkFailure()).toBe(true)
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('never blind-reloads when storage is unavailable (private mode)', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(recoverFromChunkFailure()).toBe(false)
    expect(reloadMock).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
