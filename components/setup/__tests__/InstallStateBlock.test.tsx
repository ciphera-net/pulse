import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// The state the old code could not reach.
//
// /setup/done polled for 90 s and then simply stopped, with no state for
// having stopped — the spinner and "Waiting for first pageview…" stayed on
// screen forever, claiming to still be checking. These tests pin the branch
// that fixes it: once the watch window lapses the copy must stop implying we
// are still looking, and must offer both a retry and a route to help.
// ---------------------------------------------------------------------------

const mutate = vi.fn()
let status: string | undefined = 'never_installed'

vi.mock('@/lib/swr/dashboard', () => ({
  useInstallStatus: () => ({
    data: status === undefined ? undefined : { install_status: status },
    mutate,
  }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import InstallStateBlock from '../InstallStateBlock'

beforeEach(() => {
  status = 'never_installed'
  mutate.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('InstallStateBlock', () => {
  it('says nothing at all until the status is known', () => {
    status = undefined
    const { container } = render(<InstallStateBlock siteId="s1" domain="example.com" />)
    expect(container.textContent).toBe('')
  })

  it('waits without claiming a problem while the window is open', () => {
    render(<InstallStateBlock siteId="s1" domain="example.com" />)
    expect(screen.getByText('Waiting for the first event')).toBeTruthy()
    expect(screen.getByText(/confirms here within seconds/)).toBeTruthy()
    expect(screen.queryByText(/90 seconds we watched/)).toBeNull()
  })

  it('admits it stopped watching once the window lapses, with a way to act', async () => {
    vi.useFakeTimers()
    render(<InstallStateBlock siteId="s1" domain="example.com" />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000)
    })
    // The defect this replaces: after 90 s the old page still said it was
    // checking. It must now say otherwise, and offer both exits.
    expect(screen.getByText(/Nothing from example\.com in the 90 seconds we watched/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy()
    const guide = screen.getByRole('link', { name: 'Troubleshooting guide' })
    expect(guide.getAttribute('href')).toBe('https://help.ciphera.net/docs/pulse/troubleshooting')
  })

  it('re-opens the watch window when the reader checks again', async () => {
    vi.useFakeTimers()
    render(<InstallStateBlock siteId="s1" domain="example.com" />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    })
    expect(mutate).toHaveBeenCalled()
    // Back to honest waiting — not still asserting the lapsed message.
    expect(screen.queryByText(/90 seconds we watched/)).toBeNull()
    expect(screen.getByText(/confirms here within seconds/)).toBeTruthy()
  })

  it('reports success and fires onFirstEvent exactly once', () => {
    status = 'active'
    // A NEW callback identity on rerender, which is what re-runs the effect —
    // rerendering with the same props does not, so passing the same spy twice
    // cannot detect a missing once-guard (it did not: the mutation survived).
    // The guard exists because the caller POSTs /verify from here; firing it
    // again on every effect re-run would re-post on a loop.
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(
      <InstallStateBlock siteId="s1" domain="example.com" onFirstEvent={first} />,
    )
    expect(screen.getByText('First event received')).toBeTruthy()
    expect(screen.getByText(/example\.com is reporting/)).toBeTruthy()
    rerender(<InstallStateBlock siteId="s1" domain="example.com" onFirstEvent={second} />)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second, 'the first event must be announced once, not once per render').not.toHaveBeenCalled()
  })

  it('does not offer a retry once events are arriving', () => {
    status = 'active'
    render(<InstallStateBlock siteId="s1" domain="example.com" />)
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull()
  })

  it('distinguishes a site that went quiet from one that never reported', () => {
    status = 'stalled'
    render(<InstallStateBlock siteId="s1" domain="example.com" />)
    expect(screen.getByText('No recent events')).toBeTruthy()
    expect(screen.queryByText('Waiting for the first event')).toBeNull()
  })
})
