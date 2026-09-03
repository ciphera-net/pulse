import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * What the user READS when a passkey enrolment fails.
 *
 * 🔴 The bug these pin: `lib/api/client.ts` replaces every HTTP error message
 * with `authMessageFromStatus(status)` before it throws, and Facet maps 401 to
 * "Session expired, please sign in again." The most likely failure on this
 * dialog is a mistyped password, which id-backend answers 401 at
 * `/auth/reauth/finish` — so rendering `err.message` verbatim told a user with
 * a perfectly healthy session to sign in again. Following that instruction
 * changes nothing: they return, retype the same wrong password, and read the
 * same sentence. A loop with no hint that the password is what is wrong.
 *
 * The modal is driven through its real hook and its real submit handler, so
 * these assert what a person would actually see on screen — not the return
 * value of a helper that a refactor could stop calling.
 */

const enrolPasskeyMock = vi.hoisted(() => vi.fn())

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, type, ...rest }: React.ComponentProps<'button'>) => (
    <button type={type ?? 'button'} {...rest}>
      {children}
    </button>
  ),
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}))
vi.mock('@/lib/auth/tessera/passkey-enrol', () => ({ enrolPasskey: enrolPasskeyMock }))

import { ApiError } from '@/lib/api/client'
import { usePasskeyEnrolModal } from '../PasskeyEnrolModal'

function Harness() {
  const { requestPasskeyEnrol, modal } = usePasskeyEnrolModal()
  return (
    <div>
      <button type="button" onClick={() => requestPasskeyEnrol().catch(() => {})}>
        open
      </button>
      {modal}
    </div>
  )
}

/** Open the dialog, fill the two required fields, submit. */
async function submitWith(failure: unknown) {
  enrolPasskeyMock.mockRejectedValueOnce(failure)
  render(<Harness />)
  fireEvent.click(screen.getByText('open'))

  const inputs = await waitFor(() => {
    const found = document.querySelectorAll('input')
    if (found.length < 2) throw new Error('dialog did not open')
    return found
  })
  fireEvent.change(inputs[0], { target: { value: 'me@ciphera.test' } })
  fireEvent.change(inputs[1], { target: { value: 'wrong-password' } })
  fireEvent.submit(inputs[0].closest('form')!)
  await waitFor(() => expect(enrolPasskeyMock).toHaveBeenCalled())
}

describe('PasskeyEnrolModal failure messages', () => {
  beforeEach(() => {
    enrolPasskeyMock.mockReset()
    document.body.innerHTML = ''
  })

  it('does NOT tell a signed-in user to sign in again when the password is wrong', async () => {
    // Exactly what the ceremony throws: id-backend 401s /auth/reauth/finish and
    // apiRequest rewrites the message before it ever reaches this component.
    await submitWith(new ApiError('Session expired, please sign in again.', 401))

    await waitFor(() => {
      expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/sign in again/i)).not.toBeInTheDocument()
    })
    // And it names the thing the user can actually fix.
    expect(screen.getByText(/email or password/i)).toBeInTheDocument()
    expect(screen.getByText(/nothing was saved/i)).toBeInTheDocument()
  })

  it('says the same for a 403 — the other way a bad proof comes back', async () => {
    await submitWith(new ApiError('Session expired, please sign in again.', 403))
    await waitFor(() => expect(screen.getByText(/email or password/i)).toBeInTheDocument())
    expect(screen.queryByText(/sign in again/i)).not.toBeInTheDocument()
  })

  it('distinguishes a rate limit from a wrong password', async () => {
    await submitWith(new ApiError('Too many requests', 429))
    await waitFor(() => expect(screen.getByText(/too many attempts/i)).toBeInTheDocument())
    // Retyping the password is the WRONG advice here, so it must not appear.
    expect(screen.queryByText(/email or password/i)).not.toBeInTheDocument()
  })

  it('distinguishes an unreachable server (status 0) from a rejected proof', async () => {
    await submitWith(new ApiError('Network error', 0))
    await waitFor(() => expect(screen.getByText(/could not reach/i)).toBeInTheDocument())
    expect(screen.queryByText(/email or password/i)).not.toBeInTheDocument()
  })

  it('keeps the ceremony’s OWN sentences, which say more than any generic text', async () => {
    // passkey-enrol.ts throws deliberate, specific messages. Those are the one
    // case where the raw message is the right thing to show.
    await submitWith(new Error('This account has no encrypted vault to link a passkey to.'))
    await waitFor(() =>
      expect(screen.getByText(/no encrypted vault to link a passkey to/i)).toBeInTheDocument(),
    )
  })

  it('never shows a browser’s developer-facing text for a dismissed prompt', async () => {
    await submitWith(
      new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'),
    )
    await waitFor(() => expect(screen.getByText(/passkey prompt was dismissed/i)).toBeInTheDocument())
    expect(screen.queryByText(/timed out or was not allowed/i)).not.toBeInTheDocument()
  })

  it('keeps the dialog open on every failure so the user can correct and retry', async () => {
    await submitWith(new ApiError('Session expired, please sign in again.', 401))
    await waitFor(() => expect(screen.getByText(/email or password/i)).toBeInTheDocument())
    // Two inputs still on screen = still open. A closed dialog would strand the
    // user with an error they cannot act on.
    expect(document.querySelectorAll('input').length).toBeGreaterThanOrEqual(2)
  })
})
