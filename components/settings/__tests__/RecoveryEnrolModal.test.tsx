import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const enrolMock = vi.hoisted(() => vi.fn())

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, type, ...rest }: React.ComponentProps<'button'>) => (
    <button type={type ?? 'button'} {...rest}>
      {children}
    </button>
  ),
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
  // Stands in for the real component; these tests are about the DIALOG's
  // control flow, and the phrase panel's own copy is guarded in facet.
  RecoveryPhraseDisplay: ({ phrase, onConfirmed }: { phrase: string; onConfirmed: () => void }) => (
    <div>
      <span>PHRASE:{phrase}</span>
      <button type="button" onClick={onConfirmed}>
        confirm
      </button>
    </div>
  ),
}))
vi.mock('@/lib/auth/tessera/recovery-enrol', () => ({ enrolRecoveryIdentity: enrolMock }))

import { ApiError } from '@/lib/api/client'
import { useRecoveryEnrolModal, isRecoveryEnrolCancelled } from '../RecoveryEnrolModal'

function Harness({ onSettled }: { onSettled?: (ok: boolean) => void }) {
  const { requestRecoveryEnrol, modal } = useRecoveryEnrolModal()
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          requestRecoveryEnrol().then(
            () => onSettled?.(true),
            (e) => onSettled?.(!isRecoveryEnrolCancelled(e)),
          )
        }
      >
        open
      </button>
      {modal}
    </div>
  )
}

async function fillAndSubmit() {
  fireEvent.click(screen.getByText('open'))
  const inputs = await waitFor(() => {
    const f = document.querySelectorAll('input')
    if (f.length < 2) throw new Error('dialog did not open')
    return f
  })
  fireEvent.change(inputs[0], { target: { value: 'me@ciphera.test' } })
  fireEvent.change(inputs[1], { target: { value: 'pw' } })
  fireEvent.submit(inputs[0].closest('form')!)
}

describe('RecoveryEnrolModal', () => {
  beforeEach(() => {
    enrolMock.mockReset()
    document.body.innerHTML = ''
  })

  /**
   * 🔴 THE PROPERTY THIS DIALOG EXISTS TO HOLD. The phrase the ceremony returns
   * is the ONLY copy — the server has a record that can verify it and a wrap
   * sealed under its entropy, and neither can reproduce it. Resolving or
   * closing on success would discard it before the user ever saw it.
   */
  it('does NOT close when the ceremony succeeds — it shows the phrase', async () => {
    const onSettled = vi.fn()
    enrolMock.mockResolvedValue('alpha bravo charlie')
    render(<Harness onSettled={onSettled} />)
    await fillAndSubmit()

    expect(await screen.findByText('PHRASE:alpha bravo charlie')).toBeInTheDocument()
    // Still open, and the caller has NOT been told it is finished.
    expect(document.querySelector('[role="dialog"]')).toBeInTheDocument()
    expect(onSettled).not.toHaveBeenCalled()
  })

  it('resolves only after the phrase is confirmed', async () => {
    const onSettled = vi.fn()
    enrolMock.mockResolvedValue('alpha bravo charlie')
    render(<Harness onSettled={onSettled} />)
    await fillAndSubmit()
    fireEvent.click(await screen.findByText('confirm'))

    await waitFor(() => expect(onSettled).toHaveBeenCalledWith(true))
    expect(document.querySelector('[role="dialog"]')).not.toBeInTheDocument()
  })

  it('clears the password as soon as it is spent, before showing the phrase', async () => {
    enrolMock.mockResolvedValue('alpha bravo charlie')
    render(<Harness />)
    await fillAndSubmit()
    await screen.findByText('PHRASE:alpha bravo charlie')
    // The password field is gone with the form, and no value survives in the DOM.
    expect(document.querySelectorAll('input[type="password"]').length).toBe(0)
  })

  /**
   * A mistyped password answers 401 at /auth/reauth/finish, and lib/api/client
   * rewrites that message to "Session expired, please sign in again." Telling a
   * signed-in user to sign in again is a loop with no hint about the password.
   */
  it('never tells a signed-in user to sign in again on a wrong password', async () => {
    enrolMock.mockRejectedValue(new ApiError('Session expired, please sign in again.', 401))
    render(<Harness />)
    await fillAndSubmit()

    expect(await screen.findByText(/didn’t match/)).toBeInTheDocument()
    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/sign in again/i)).not.toBeInTheDocument()
  })

  it('keeps the dialog open on failure so the user can correct and retry', async () => {
    enrolMock.mockRejectedValue(new ApiError('nope', 401))
    render(<Harness />)
    await fillAndSubmit()
    await screen.findByText(/didn’t match/)
    expect(document.querySelectorAll('input').length).toBe(2)
  })

  it('shows the ceremony’s own sentence, which says more than generic text', async () => {
    enrolMock.mockRejectedValue(new Error('Recovery setup did not produce a phrase. Nothing was saved.'))
    render(<Harness />)
    await fillAndSubmit()
    expect(await screen.findByText(/did not produce a phrase/)).toBeInTheDocument()
  })

  it('reports a cancel as a cancel, not a failure', async () => {
    const onSettled = vi.fn()
    render(<Harness onSettled={onSettled} />)
    fireEvent.click(screen.getByText('open'))
    fireEvent.click(await screen.findByText('Cancel'))
    await waitFor(() => expect(onSettled).toHaveBeenCalledWith(false))
  })
})
