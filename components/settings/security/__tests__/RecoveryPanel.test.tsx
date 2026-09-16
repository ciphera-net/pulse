import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'

const statusMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/recovery', () => ({ getRecoveryStatus: statusMock }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, asChild, isLoading, ...p }: any) => <button {...p}>{children}</button>,
}))

import RecoveryPanel from '../RecoveryPanel'

// 🔴 Block body, on purpose. `mockReset()` returns the mock, and a function
// returned from beforeEach is a CLEANUP vitest calls after the test: an
// expression-bodied hook here called the rejecting implementation once more
// with nobody awaiting it, and the "cannot be read" case failed with the
// panel's own, handled, error after its body had passed.
beforeEach(() => {
  statusMock.mockReset()
})

describe('RecoveryPanel', () => {
  /**
   * 🔴 The failure this pins. Defaulting an unknown status to `false` shows
   * "Not set up" to somebody who IS enrolled, and invites them to enrol again,
   * which ROTATES the phrase they already wrote down. Nullable state with an
   * explicit third branch, never a sentinel.
   */
  it('never claims "not set up" while the answer is unknown', async () => {
    let resolve!: (v: { enrolled: boolean }) => void
    statusMock.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<RecoveryPanel onEnrol={async () => {}} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Account recovery' })).toBeInTheDocument()
    expect(screen.getAllByText(/Checking/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Not set up/)).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
    await act(async () => resolve({ enrolled: true }))
    expect(await screen.findByText('Set up')).toBeInTheDocument()
  })

  it('says so, rather than guessing, when the status cannot be read', async () => {
    statusMock.mockRejectedValue(new Error('offline'))
    render(<RecoveryPanel onEnrol={async () => {}} />)
    expect(await screen.findByText(/Couldn't check whether recovery is set up/)).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.queryByText(/Not set up/)).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('offers enrolment when there is none', async () => {
    statusMock.mockResolvedValue({ enrolled: false })
    render(<RecoveryPanel onEnrol={async () => {}} />)
    expect(await screen.findByText('Not set up')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveTextContent('Set up recovery…')
  })

  /** Replacing warns, because it discards a phrase the user may still hold. */
  it('names replacement as replacement when already enrolled', async () => {
    statusMock.mockResolvedValue({ enrolled: true })
    render(<RecoveryPanel onEnrol={async () => {}} />)
    // Wait on the enrolled chip, which exists ONLY in that state; the button
    // renders on the first pass with the pre-load label and would gate nothing.
    expect(await screen.findByText('Set up')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveTextContent('Replace phrase…')
    expect(screen.getByText(/replaces the phrase you have/)).toBeInTheDocument()
  })

  it('re-reads the status after an enrolment attempt, successful or not', async () => {
    statusMock.mockResolvedValueOnce({ enrolled: false }).mockResolvedValueOnce({ enrolled: true })
    render(<RecoveryPanel onEnrol={async () => {}} />)
    await screen.findByText('Not set up')
    fireEvent.click(screen.getByRole('button'))
    expect(await screen.findByText('Set up')).toBeInTheDocument()
  })

  it('re-reads even when the dialog throws, since an enrolment may have landed first', async () => {
    statusMock.mockResolvedValueOnce({ enrolled: false }).mockResolvedValueOnce({ enrolled: true })
    render(<RecoveryPanel onEnrol={async () => { throw new Error('boom') }} />)
    await screen.findByText('Not set up')
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(statusMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Set up')).toBeInTheDocument()
  })
})
