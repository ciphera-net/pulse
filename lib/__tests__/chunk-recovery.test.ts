// @vitest-environment jsdom
//
// lib/chunk-recovery: the shared matcher + guarded-reload used by the error
// boundaries (primary path — React delivers failed route imports there) and the
// useVersionCheck global listeners (secondary shapes).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isChunkLoadFailure,
  isChunkLoadError,
  isRecoverableCrash,
  isRenderLoopError,
  isRenderLoopFailure,
  recoverFromChunkFailure,
  recoverFromCrash,
} from '../chunk-recovery'

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

// ─────────────────────────────────────────────────────────────────────────────
// Render loops — the second failure shape a reload cures (09-09-2026).
// ─────────────────────────────────────────────────────────────────────────────
describe('isRenderLoopFailure — every wording React can produce', () => {
  it.each([
    // Production: the code, which is all a minified build ships. This exact string
    // is what production beaconed from /sites/<id> on 07-09, 08-09 and 09-09-2026.
    ['Minified React error #185; visit https://react.dev/errors/185 for the full message'],
    // The hosted URL on its own, in case the prefix ever changes.
    ['see https://react.dev/errors/185 for details'],
    // Development build.
    ['Maximum update depth exceeded. This can happen when a component calls setState'],
  ])('matches %s', (text) => {
    expect(isRenderLoopFailure(text)).toBe(true)
  })

  it('does not match other React error codes, or unrelated text containing 185', () => {
    expect(isRenderLoopFailure('Minified React error #418')).toBe(false)
    expect(isRenderLoopFailure('Minified React error #31')).toBe(false)
    expect(isRenderLoopFailure('request failed after 185 ms')).toBe(false)
    expect(isRenderLoopFailure('')).toBe(false)
  })

  it('is safe on error-shaped and nullish inputs', () => {
    expect(isRenderLoopError(new Error('Minified React error #185'))).toBe(true)
    expect(isRenderLoopError(null)).toBe(false)
    expect(isRenderLoopError(undefined)).toBe(false)
    expect(isRenderLoopError(new Error('boom'))).toBe(false)
  })
})

describe('isRecoverableCrash — the union the boundaries gate on', () => {
  it('covers both shapes and nothing else', () => {
    expect(isRecoverableCrash(new Error('Loading chunk 3 failed'))).toBe(true)
    expect(isRecoverableCrash(new Error('Minified React error #185'))).toBe(true)
    // 🔴 The bug this fix exists for: everything below used to be — and still is —
    // painted immediately. Widening this predicate further is a deliberate act,
    // because a reload only cures a WEDGED TAB, not a broken server.
    expect(isRecoverableCrash(new Error('Failed to fetch'))).toBe(false)
    expect(isRecoverableCrash(new Error('Session expired, please sign in again.'))).toBe(false)
  })
})

describe('recoverFromCrash — guard policy differs by failure shape', () => {
  let reloadMock: ReturnType<typeof vi.fn>
  const realLocation = window.location

  beforeEach(() => {
    sessionStorage.clear()
    reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, reload: reloadMock },
    })
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
    vi.restoreAllMocks()
  })

  it('reloads once for a render loop, then blocks for the life of the tab', () => {
    expect(recoverFromCrash(new Error('Minified React error #185'))).toBe('reloading')
    expect(reloadMock).toHaveBeenCalledTimes(1)
    expect(recoverFromCrash(new Error('Minified React error #185'))).toBe('blocked')
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('the render-loop guard has no expiry window, unlike the chunk guard', () => {
    expect(recoverFromCrash(new Error('Minified React error #185'))).toBe('reloading')
    // Chunk recovery re-arms after 60s; a render loop must not, or a deterministic
    // loop becomes a refresh every minute with the user watching.
    sessionStorage.setItem('pulse-chunk-recovery-at', String(Date.now() - 600_000))
    expect(recoverFromCrash(new Error('Minified React error #185'))).toBe('blocked')
  })

  it('a chunk failure keeps its own 60s window, independent of the loop guard', () => {
    expect(recoverFromCrash(new Error('Loading chunk 9 failed'))).toBe('reloading')
    expect(recoverFromCrash(new Error('Loading chunk 9 failed'))).toBe('blocked')
    // The render-loop guard was never armed by a chunk failure.
    expect(sessionStorage.getItem('pulse-render-loop-recovery-done')).toBeNull()
  })

  it('reports offline distinctly, and does NOT burn the guard doing so', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })

    expect(recoverFromCrash(new Error('Minified React error #185'))).toBe('offline')
    expect(reloadMock).not.toHaveBeenCalled()
    // 🔑 The whole point: a laptop waking from sleep reads onLine === false for a
    // beat. If that consumed the one-per-tab attempt, the failure this fix targets
    // would be the one case it could never recover from.
    expect(sessionStorage.getItem('pulse-render-loop-recovery-done')).toBeNull()

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    expect(recoverFromCrash(new Error('Minified React error #185'))).toBe('reloading')
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('returns blocked for an error no reload can cure', () => {
    expect(recoverFromCrash(new Error('Failed to fetch'))).toBe('blocked')
    expect(reloadMock).not.toHaveBeenCalled()
  })

  it('recoverFromChunkFailure keeps its boolean contract for the global listeners', () => {
    expect(recoverFromChunkFailure()).toBe(true)
    expect(reloadMock).toHaveBeenCalledTimes(1)
    expect(recoverFromChunkFailure()).toBe(false)
  })
})
