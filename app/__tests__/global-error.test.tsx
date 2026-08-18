// @vitest-environment jsdom
//
// app/global-error.tsx — the double-fault boundary. It does NOT render ErrorDisplay
// (it owns the whole document), so the glob sweep in error.test.tsx cannot reach it;
// it gets direct coverage here, plus the StrictMode dev-mode guarantee for the
// shared hook: React double-invokes effects in dev, and without the ref guard the
// second recoverFromChunkFailure() would hit the just-armed guard and flash the
// error UI mid-reload.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import GlobalError from '../global-error'
import ErrorDisplay from '@/components/ErrorDisplay'

function chunkError() {
  const e = new Error('Loading chunk 6907 failed.')
  e.name = 'ChunkLoadError'
  return e as Error & { digest?: string }
}

describe('app/global-error.tsx chunk-failure recovery', () => {
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

  it('reloads instead of rendering the crash page for a stale chunk', () => {
    const { queryByText } = render(<GlobalError error={chunkError()} reset={vi.fn()} />)

    expect(reloadMock).toHaveBeenCalledTimes(1)
    expect(queryByText('Something went wrong')).toBeNull()
  })

  it('shows the crash page when the guard blocks a reload loop', () => {
    sessionStorage.setItem('pulse-chunk-recovery-at', String(Date.now()))

    const { getByText } = render(<GlobalError error={chunkError()} reset={vi.fn()} />)

    expect(reloadMock).not.toHaveBeenCalled()
    expect(getByText('Something went wrong')).toBeInTheDocument()
  })

  it('shows the crash page for non-chunk errors without reloading', () => {
    const { getByText } = render(
      <GlobalError error={new Error('boom') as Error & { digest?: string }} reset={vi.fn()} />
    )

    expect(reloadMock).not.toHaveBeenCalled()
    expect(getByText('Something went wrong')).toBeInTheDocument()
  })
})

describe('StrictMode double-invoked effects (dev-only React behavior)', () => {
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

  it('recovers exactly once and never flashes the error UI mid-reload', () => {
    const { container, queryByText } = render(
      <StrictMode>
        <ErrorDisplay error={chunkError()} onRetry={vi.fn()} />
      </StrictMode>
    )

    // Without the ref guard in useChunkRecovery, the double-invoked effect's second
    // run hits the just-armed guard and overwrites 'reloading' with 'show'.
    expect(reloadMock).toHaveBeenCalledTimes(1)
    expect(queryByText('Try again')).toBeNull()
    expect(container).toBeEmptyDOMElement()
  })
})
