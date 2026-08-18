// @vitest-environment jsdom
//
// Chunk-failure recovery through the error boundaries — the PRIMARY interception
// point. Measured 18-08-2026 (Playwright, route chunk blocked at the network layer):
// a failed route import during App Router navigation fires NO global event — React
// delivers it to the NEAREST error.tsx. This app has one boundary per dashboard
// section, so the recovery lives in the shared ErrorDisplay component and EVERY
// boundary is swept here via glob: a future boundary that renders ErrorDisplay
// without the error prop (or bypasses it entirely) turns this suite red instead of
// silently reintroducing dead clicks.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import GlobalError from '../error'

// import.meta.glob is provided by Vite (vitest's runtime); the repo's tsconfig has no
// vite/client types, so declare the one member we use rather than pulling them in.
declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>
  }
}

const boundaryModules = import.meta.glob('../**/error.tsx') as Record<
  string,
  () => Promise<{ default: React.ComponentType<{ error: Error; reset: () => void }> }>
>

function chunkError() {
  const e = new Error('Loading chunk 6907 failed.')
  e.name = 'ChunkLoadError'
  return e
}

describe('error boundaries self-heal chunk-load failures', () => {
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

  it('found the app’s boundaries (guard against the glob silently matching nothing)', () => {
    // 10 as of 18-08-2026: root, notifications, share, sites/[id] + its six tools.
    expect(Object.keys(boundaryModules).length).toBeGreaterThanOrEqual(10)
  })

  it('EVERY route boundary reloads instead of rendering an error page for a stale chunk', async () => {
    for (const [path, load] of Object.entries(boundaryModules)) {
      const { default: Boundary } = await load()
      sessionStorage.clear()
      reloadMock.mockClear()

      const { container } = render(<Boundary error={chunkError()} reset={vi.fn()} />)

      expect(reloadMock, `${path} did not self-heal a chunk failure`).toHaveBeenCalledTimes(1)
      // A routine self-heal must not flash "Something went wrong".
      expect(container, `${path} rendered error UI during recovery`).toBeEmptyDOMElement()
      cleanup()
    }
  })

  it('EVERY route boundary still shows its visible error UI for non-chunk errors', async () => {
    for (const [path, load] of Object.entries(boundaryModules)) {
      const { default: Boundary } = await load()
      reloadMock.mockClear()

      const { container } = render(<Boundary error={new Error('boom')} reset={vi.fn()} />)

      expect(reloadMock, `${path} reloaded on a non-chunk error`).not.toHaveBeenCalled()
      expect(container, `${path} rendered nothing for a real error`).not.toBeEmptyDOMElement()
      cleanup()
    }
  })

  it('falls through to the visible error UI when the guard blocks a reload loop', () => {
    sessionStorage.setItem('pulse-chunk-recovery-at', String(Date.now()))

    const { getByText } = render(<GlobalError error={chunkError()} reset={vi.fn()} />)

    expect(reloadMock).not.toHaveBeenCalled()
    expect(getByText('Something went wrong')).toBeInTheDocument()
  })
})
