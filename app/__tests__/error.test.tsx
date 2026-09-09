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

// What React actually throws for an infinite render loop. The production build
// ships the CODE, not the sentence — this exact string is what the owner's PWA
// beaconed from /sites/<id> on 07-09, 08-09 and 09-09-2026.
function renderLoopError() {
  return new Error(
    'Minified React error #185; visit https://react.dev/errors/185 for the full message ' +
      'or use the non-minified dev environment for full errors and additional helpful warnings.',
  )
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

// ─────────────────────────────────────────────────────────────────────────────
// Render loops (09-09-2026). The self-heal used to match six chunk strings and
// nothing else, so React #185 — "Maximum update depth exceeded" — was painted on
// the first frame with no recovery attempted. The owner met that screen most
// mornings for three days.
//
// reset() cannot fix it: production logged two crashes two seconds apart on one
// site, which is the boundary's own "Try again" re-entering the same loop with the
// module-level SWR cache still warm. A reload drops that state, which is why the
// owner's manual Refresh always worked.
// ─────────────────────────────────────────────────────────────────────────────
describe('error boundaries self-heal render loops (React #185)', () => {
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

  it('EVERY route boundary reloads instead of rendering an error page', async () => {
    for (const [path, load] of Object.entries(boundaryModules)) {
      const { default: Boundary } = await load()
      sessionStorage.clear()
      reloadMock.mockClear()

      const { container } = render(<Boundary error={renderLoopError()} reset={vi.fn()} />)

      expect(reloadMock, `${path} did not self-heal a render loop`).toHaveBeenCalledTimes(1)
      expect(container, `${path} rendered error UI during recovery`).toBeEmptyDOMElement()
      cleanup()
    }
  })

  it('recognises the development build’s wording too', () => {
    const dev = new Error(
      'Maximum update depth exceeded. This can happen when a component calls setState inside useEffect.',
    )
    render(<GlobalError error={dev} reset={vi.fn()} />)
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('reloads ONCE per tab, then shows the error page — never a silent refresh loop', () => {
    render(<GlobalError error={renderLoopError()} reset={vi.fn()} />)
    expect(reloadMock).toHaveBeenCalledTimes(1)
    cleanup()

    // Same tab, the loop came straight back: a second reload would be a refresh
    // loop the user watches, so the boundary must surrender the screen instead.
    reloadMock.mockClear()
    const { getByText } = render(<GlobalError error={renderLoopError()} reset={vi.fn()} />)
    expect(reloadMock).not.toHaveBeenCalled()
    expect(getByText('Something went wrong')).toBeInTheDocument()
  })

  it('is stricter than the chunk guard: expiring the 60s window does not re-arm it', () => {
    render(<GlobalError error={renderLoopError()} reset={vi.fn()} />)
    expect(reloadMock).toHaveBeenCalledTimes(1)
    cleanup()

    // A chunk failure would be recoverable again after 60s. A render loop is a code
    // defect, so its guard is per-tab and has no window to expire.
    sessionStorage.setItem('pulse-chunk-recovery-at', String(Date.now() - 120_000))
    reloadMock.mockClear()
    render(<GlobalError error={renderLoopError()} reset={vi.fn()} />)
    expect(reloadMock).not.toHaveBeenCalled()
  })
})
