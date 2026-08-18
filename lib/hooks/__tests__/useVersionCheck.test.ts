// @vitest-environment jsdom
//
// useVersionCheck: chunk-failure recovery.
//
// The failure this guards against (measured live 18-08-2026): after a deploy, a tab
// running the previous build clicks a sidebar link, the route's dynamic import()
// fails (stale chunk 404, or a 503 during a rollout), and the rejection surfaces as
// 'unhandledrejection' — which the pre-fix hook did not listen for. Result: dead
// clicks with no toast and no recovery.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useVersionCheck } from '../useVersionCheck'

const CHUNK_ERROR = 'ChunkLoadError: Loading chunk 4bd1 failed.'

function dispatchRejection(reason: unknown) {
  // jsdom has no PromiseRejectionEvent constructor and never fires the event natively;
  // a plain Event carrying `reason` exercises the same handler contract.
  const evt = new Event('unhandledrejection') as Event & { reason: unknown }
  evt.reason = reason
  window.dispatchEvent(evt)
}

function dispatchErrorEvent(message: string) {
  window.dispatchEvent(new ErrorEvent('error', { message }))
}

describe('useVersionCheck chunk-failure recovery', () => {
  let reloadMock: ReturnType<typeof vi.fn>
  const realLocation = window.location

  beforeEach(() => {
    sessionStorage.clear()
    reloadMock = vi.fn()
    // jsdom's location.reload is non-configurable; swap the whole object.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, reload: reloadMock },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
    vi.restoreAllMocks()
  })

  it('reloads once on a chunk-load promise rejection (dynamic import in an event handler)', () => {
    const onNewVersion = vi.fn()
    renderHook(() => useVersionCheck(onNewVersion))

    dispatchRejection(new Error(CHUNK_ERROR))

    expect(reloadMock).toHaveBeenCalledTimes(1)
    expect(onNewVersion).not.toHaveBeenCalled()
    // The guard is what prevents a reload loop on a genuinely broken build.
    expect(sessionStorage.getItem('pulse-chunk-recovery-at')).not.toBeNull()
  })

  it('falls back to the toast instead of looping when a second failure lands inside the guard window', () => {
    const onNewVersion = vi.fn()
    renderHook(() => useVersionCheck(onNewVersion))

    dispatchRejection(new Error(CHUNK_ERROR))
    dispatchRejection(new Error(CHUNK_ERROR))

    expect(reloadMock).toHaveBeenCalledTimes(1)
    expect(onNewVersion).toHaveBeenCalledTimes(1)
  })

  it('re-notifies on EVERY guard-blocked failure — a dismissed toast must not silence a broken tab', () => {
    const onNewVersion = vi.fn()
    renderHook(() => useVersionCheck(onNewVersion))

    dispatchRejection(new Error(CHUNK_ERROR)) // reloads, arms the guard
    dispatchRejection(new Error(CHUNK_ERROR)) // guard-blocked -> toast
    dispatchRejection(new Error(CHUNK_ERROR)) // still broken -> toast AGAIN

    expect(reloadMock).toHaveBeenCalledTimes(1)
    expect(onNewVersion).toHaveBeenCalledTimes(2)
  })

  it('recovers when the failure arrives as a window error event (the <script> chunk path)', () => {
    const onNewVersion = vi.fn()
    renderHook(() => useVersionCheck(onNewVersion))

    dispatchErrorEvent('Loading chunk 42 failed. (missing: https://example.test/x.js)')

    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('matches on the error NAME alone (minified builds can strip the message)', () => {
    renderHook(() => useVersionCheck(vi.fn()))

    // webpack sets error.name = 'ChunkLoadError'; the message can be anything or empty.
    dispatchRejection({ name: 'ChunkLoadError', message: '' })

    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('matches the dynamic-import failure message Safari/Firefox produce', () => {
    renderHook(() => useVersionCheck(vi.fn()))

    dispatchRejection(new TypeError('Failed to fetch dynamically imported module: https://x/y.js'))

    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('ignores unrelated rejections and errors', () => {
    const onNewVersion = vi.fn()
    renderHook(() => useVersionCheck(onNewVersion))

    dispatchRejection(new Error('NetworkError: fetch failed'))
    dispatchRejection('some string rejection')
    dispatchRejection(null)
    dispatchErrorEvent('ReferenceError: foo is not defined')

    expect(reloadMock).not.toHaveBeenCalled()
    expect(onNewVersion).not.toHaveBeenCalled()
  })

  it('stops listening after unmount', () => {
    const onNewVersion = vi.fn()
    const { unmount } = renderHook(() => useVersionCheck(onNewVersion))
    unmount()

    dispatchRejection(new Error(CHUNK_ERROR))
    dispatchErrorEvent(CHUNK_ERROR)

    expect(reloadMock).not.toHaveBeenCalled()
    expect(onNewVersion).not.toHaveBeenCalled()
  })
})
