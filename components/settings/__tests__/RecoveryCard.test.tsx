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

import { useRecoveryNudge } from '../RecoveryCard'

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
