import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { SWRConfig } from 'swr'

const statusMock = vi.hoisted(() => vi.fn())

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, type, ...rest }: React.ComponentProps<'button'>) => (
    <button type={type ?? 'button'} {...rest}>
      {children}
    </button>
  ),
}))
vi.mock('@/lib/api/recovery', () => ({ getRecoveryStatus: statusMock }))

// The per-account dismissal stamp (pulse-backend migration 180). 'unknown'
// while the fetch is in flight — a real state the nudge must stay silent in.
const prefsMock = vi.hoisted(() => ({
  recoveryPromptDismissed: 'no' as 'unknown' | 'no' | 'yes',
  stamp: vi.fn(async () => true),
}))
vi.mock('@/lib/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: undefined,
    tourCompleted: 'no' as const,
    recoveryPromptDismissed: prefsMock.recoveryPromptDismissed,
    stamp: prefsMock.stamp,
    mutate: vi.fn(),
  }),
}))

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
    // 🔴 Wait on text that exists ONLY in the enrolled state, never on the
    // button. The Button renders on the very first pass — the test above pins
    // that it is present and disabled while `enrolled` is still null — and its
    // label is `enrolled ? 'Replace phrase' : 'Set up recovery'`, so at that
    // point it reads "Set up recovery". `findByRole('button')` therefore
    // resolves immediately, against the pre-load label, and gates on nothing;
    // the assertion that follows then races the status fetch. This is the same
    // defect as WorkspaceAuditTab's `findByText('Created site')` barrier, which
    // matched an <option> that was always in the DOM.
    expect(await screen.findByText(/^Set up\./)).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveTextContent('Replace phrase')
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

function NudgeBody() {
  const { shouldNudge, dismissNudge, markPasskeyEnrolled } = useRecoveryNudge()
  return (
    <div>
      <button type="button" onClick={markPasskeyEnrolled}>arm</button>
      <button type="button" onClick={dismissNudge}>dismiss</button>
      {shouldNudge ? <p>NUDGE</p> : null}
    </div>
  )
}

/**
 * 🔴 A FRESH SWR CACHE PER RENDER. The hook reads the enrolment status through
 * SWR on a fixed key, and SWR's default cache is module-global — so without
 * this the SECOND test in the file is answered from the first one's data, the
 * fetcher is never called, and a test asserting "silent when enrolled" quietly
 * measures the previous test's "not enrolled". It reads as a timeout, which
 * looks like a slow test rather than a leaked one.
 */
function NudgeHarness() {
  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      <NudgeBody />
    </SWRConfig>
  )
}

describe('useRecoveryNudge', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    statusMock.mockReset()
    prefsMock.recoveryPromptDismissed = 'no'
    prefsMock.stamp.mockClear()
  })

  /**
   * 🔴 WHAT CHANGED, AND WHY. The nudge used to be armed ONLY inside the
   * passkey-enrolment success handler, so a person who never touched the
   * passkey flow was never once asked to set up recovery — in a product where
   * forgetting a password without a phrase loses the account. It is now armed
   * by the ACCOUNT's own state: not enrolled, not previously dismissed.
   *
   * And the dismissal is per account, not per browser. It was one localStorage
   * key with no user id in it, so on a shared profile one person's dismissal
   * silenced it for everybody, and a second computer was owed it again.
   */
  it('appears for an account with no recovery, without touching a passkey', async () => {
    statusMock.mockResolvedValue({ enrolled: false })
    render(<NudgeHarness />)
    expect(await screen.findByText('NUDGE')).toBeInTheDocument()
  })

  it('stays silent for an account that already has recovery', async () => {
    statusMock.mockResolvedValue({ enrolled: true })
    render(<NudgeHarness />)
    await waitFor(() => expect(statusMock).toHaveBeenCalled())
    expect(screen.queryByText('NUDGE')).not.toBeInTheDocument()
  })

  it('stays silent while either answer is still unknown', async () => {
    // Enrolment status in flight.
    statusMock.mockImplementation(() => new Promise(() => {}))
    const { unmount } = render(<NudgeHarness />)
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText('NUDGE')).not.toBeInTheDocument()
    unmount()

    // Dismissal stamp in flight. Appearing and then vanishing is worse than
    // arriving a moment late.
    statusMock.mockResolvedValue({ enrolled: false })
    prefsMock.recoveryPromptDismissed = 'unknown'
    render(<NudgeHarness />)
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText('NUDGE')).not.toBeInTheDocument()
  })

  it('stays silent for an account that dismissed it on ANOTHER device', async () => {
    statusMock.mockResolvedValue({ enrolled: false })
    prefsMock.recoveryPromptDismissed = 'yes'
    render(<NudgeHarness />)
    await waitFor(() => expect(statusMock).toHaveBeenCalled())
    expect(screen.queryByText('NUDGE')).not.toBeInTheDocument()
  })

  it('dismisses immediately and records it against the ACCOUNT', async () => {
    statusMock.mockResolvedValue({ enrolled: false })
    render(<NudgeHarness />)
    fireEvent.click(await screen.findByText('dismiss'))
    expect(screen.queryByText('NUDGE')).not.toBeInTheDocument()
    expect(prefsMock.stamp).toHaveBeenCalledWith(
      expect.objectContaining({ recovery_prompt_dismissed_at: expect.any(String) }),
    )
  })
})
