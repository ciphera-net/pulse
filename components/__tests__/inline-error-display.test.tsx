// InlineErrorDisplay carries ErrorDisplay's two contracts into in-shell
// boundaries (settings, setup): the client-error beacon fires, and a chunk
// failure does NOT flash the card (the self-heal reload runs instead). A
// boundary that loses either regresses silently — this is the pin.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InlineErrorDisplay from '@/components/InlineErrorDisplay'

const sendBeacon = vi.fn(() => true)

beforeEach(() => {
  sendBeacon.mockClear()
  Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true })
})

describe('InlineErrorDisplay', () => {
  it('renders the ErrorCard device and wires retry', () => {
    const onRetry = vi.fn()
    render(
      <InlineErrorDisplay
        title="This settings page failed to load"
        description="Retry, or pick another tab."
        onRetry={onRetry}
        error={new Error('boom')}
      />
    )
    expect(screen.getByText('This settings page failed to load')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('beacons the crash to /api/client-errors', () => {
    render(<InlineErrorDisplay title="t" error={new Error('boom')} />)
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(sendBeacon.mock.calls[0][0]).toBe('/api/client-errors')
  })

  it('does not flash the card for a chunk-load failure (self-heal runs)', () => {
    const chunkError = new Error('Loading chunk 42 failed (error: https://x/_next/static/chunks/42.js)')
    chunkError.name = 'ChunkLoadError'
    const { container } = render(<InlineErrorDisplay title="t" error={chunkError} />)
    expect(container.textContent).toBe('')
  })
})
