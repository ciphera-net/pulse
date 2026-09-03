import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const statusMock = vi.hoisted(() => vi.fn())

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, type, ...rest }: React.ComponentProps<'button'>) => (
    <button type={type ?? 'button'} {...rest}>
      {children}
    </button>
  ),
}))
vi.mock('@/lib/api/recovery', () => ({ getRecoveryStatus: statusMock }))

import RecoveryCard, { useRecoveryNudge } from '../RecoveryCard'

describe('RecoveryCard', () => {
  beforeEach(() => {
    statusMock.mockReset()
    document.body.innerHTML = ''
  })

  /**
   * 🔴 The failure this pins. Defaulting an unknown status to `false` shows
   * "Not set up" to somebody who IS enrolled, and invites them to enrol again —
   * which ROTATES the phrase they already wrote down and safely stored. Nullable
   * state with an explicit third branch, never a sentinel.
   */
  it('never claims "not set up" while the answer is unknown', async () => {
    let resolve!: (v: { enrolled: boolean }) => void
    statusMock.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<RecoveryCard onEnrol={async () => {}} />)

    expect(screen.getByText(/Checking/)).toBeInTheDocument()
    expect(screen.queryByText(/Not set up/)).not.toBeInTheDocument()
    // And the action is unavailable until the truth is known.
    expect(screen.getByRole('button')).toBeDisabled()

    await act(async () => resolve({ enrolled: true }))
    expect(await screen.findByText(/^Set up\./)).toBeInTheDocument()
  })

  it('says so, rather than guessing, when the status cannot be read', async () => {
    statusMock.mockRejectedValue(new Error('offline'))
    render(<RecoveryCard onEnrol={async () => {}} />)
    expect(await screen.findByText(/Could not check whether recovery is set up/)).toBeInTheDocument()
    expect(screen.queryByText(/Not set up/)).not.toBeInTheDocument()
  })

  it('offers enrolment when there is none', async () => {
    statusMock.mockResolvedValue({ enrolled: false })
    render(<RecoveryCard onEnrol={async () => {}} />)
    expect(await screen.findByText(/Not set up/)).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveTextContent('Set up recovery')
  })

  /** Replacing warns, because it discards a phrase the user may still hold. */
  it('names replacement as replacement when already enrolled', async () => {
    statusMock.mockResolvedValue({ enrolled: true })
    render(<RecoveryCard onEnrol={async () => {}} />)
    expect(await screen.findByRole('button')).toHaveTextContent('Replace phrase')
    expect(screen.getByText(/replaces the phrase you have/)).toBeInTheDocument()
  })

  it('re-reads the status after an enrolment attempt, successful or not', async () => {
    statusMock.mockResolvedValueOnce({ enrolled: false }).mockResolvedValueOnce({ enrolled: true })
    render(<RecoveryCard onEnrol={async () => {}} />)
    await screen.findByText(/Not set up/)
    fireEvent.click(screen.getByRole('button'))
    expect(await screen.findByText(/^Set up\./)).toBeInTheDocument()
  })

  it('re-reads even when the dialog throws — an enrolment may have landed first', async () => {
    statusMock.mockResolvedValueOnce({ enrolled: false }).mockResolvedValueOnce({ enrolled: true })
    render(<RecoveryCard onEnrol={async () => { throw new Error('boom') }} />)
    await screen.findByText(/Not set up/)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(statusMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/^Set up\./)).toBeInTheDocument()
  })
})

function NudgeHarness() {
  const { shouldNudge, dismissNudge, markPasskeyEnrolled } = useRecoveryNudge()
  return (
    <div>
      <button type="button" onClick={markPasskeyEnrolled}>arm</button>
      <button type="button" onClick={dismissNudge}>dismiss</button>
      {shouldNudge ? <p>NUDGE</p> : null}
    </div>
  )
}

describe('useRecoveryNudge', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('stays silent until a passkey is actually enrolled', () => {
    render(<NudgeHarness />)
    expect(screen.queryByText('NUDGE')).not.toBeInTheDocument()
  })

  it('appears once armed', () => {
    render(<NudgeHarness />)
    fireEvent.click(screen.getByText('arm'))
    expect(screen.getByText('NUDGE')).toBeInTheDocument()
  })

  it('never returns after being dismissed', () => {
    const { unmount } = render(<NudgeHarness />)
    fireEvent.click(screen.getByText('arm'))
    fireEvent.click(screen.getByText('dismiss'))
    expect(screen.queryByText('NUDGE')).not.toBeInTheDocument()
    unmount()

    // A fresh mount, as on the next visit to the tab.
    render(<NudgeHarness />)
    fireEvent.click(screen.getByText('arm'))
    expect(screen.queryByText('NUDGE')).not.toBeInTheDocument()
  })

  /**
   * ⚠️ Private windows and blocked site data THROW on localStorage access. A
   * nudge that cannot remember being dismissed would return on every enrolment
   * forever, so the safe default is silence.
   */
  it('stays silent when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<NudgeHarness />)
    fireEvent.click(screen.getByText('arm'))
    expect(screen.queryByText('NUDGE')).not.toBeInTheDocument()
    spy.mockRestore()
  })
})
