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

const beginMock = vi.hoisted(() => vi.fn())
const completeMock = vi.hoisted(() => vi.fn())
const abandonMock = vi.hoisted(() => vi.fn())

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, type, ...rest }: React.ComponentProps<'button'>) => (
    <button type={type ?? 'button'} {...rest}>
      {children}
    </button>
  ),
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}))
vi.mock('@/lib/auth/tessera/passkey-enrol', () => {
  // A real class, so the modal's `instanceof` branch is exercised rather than
  // mocked away — that branch is what renders the named-provider copy.
  class PasskeyPrfUnsupportedError extends Error {
    profile: { name: string; prf: string; note?: string } | null
    constructor(profile: { name: string; prf: string; note?: string } | null, message: string) {
      super(message)
      this.name = 'PasskeyPrfUnsupportedError'
      this.profile = profile
    }
  }
  return {
    beginPasskeyEnrol: beginMock,
    completePasskeyEnrol: completeMock,
    abandonPasskeyEnrol: abandonMock,
    PasskeyPrfUnsupportedError,
  }
})

import { ApiError } from '@/lib/api/client'
import { PasskeyPrfUnsupportedError } from '@/lib/auth/tessera/passkey-enrol'
import { usePasskeyEnrolModal } from '../PasskeyEnrolModal'

/**
 * The mocked class, typed for construction.
 *
 * `vi.mock` replaces the MODULE, so at runtime this identifier is the two-arg
 * class defined above — which is what the modal's `instanceof` sees, and why
 * the error must be built from this exact reference rather than a lookalike.
 * The TYPE, however, still resolves to the real one-argument class, whose
 * message is derived from the profile rather than passed in. Constructing with
 * a fixed message here keeps these tests asserting the modal's rendering rather
 * than re-testing the copy builder, which has its own tests.
 */
const PrfUnsupported = PasskeyPrfUnsupportedError as unknown as new (
  profile: { name: string; prf: string; note?: string } | null,
  message: string,
) => Error

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

/** A handle as `beginPasskeyEnrol` resolves it. Only `profile` is read by the UI. */
const HANDLE = (profile: { name: string; prf: string; note?: string } | null = null) => ({
  profile,
  credentialId: 'cred-1',
  _sessionId: 's',
  _registration: {},
  _prfOutput: new ArrayBuffer(32),
  _salt: new Uint8Array(32),
  _opaqueWrap: 'w',
  _rpId: 'ciphera.net',
})

/** Open the dialog and clear the FIRST step — the biometric. */
async function openAndPassBiometric(profile: Parameters<typeof HANDLE>[0] = null) {
  beginMock.mockResolvedValueOnce(HANDLE(profile))
  render(<Harness />)
  fireEvent.click(screen.getByText('open'))
  fireEvent.click(await screen.findByText('Continue'))
  await waitFor(() => expect(beginMock).toHaveBeenCalled())
}

/**
 * Open, clear the biometric, fill the two required fields, submit.
 *
 * ⚠️ The biometric step is not optional scaffolding — it is the ordering this
 * dialog exists to enforce, so every failure-message test now has to pass
 * through it, and a regression that put the password first would break all of
 * them rather than none.
 */
async function submitWith(failure: unknown) {
  completeMock.mockRejectedValueOnce(failure)
  await openAndPassBiometric()

  const inputs = await waitFor(() => {
    const found = document.querySelectorAll('input')
    if (found.length < 2) throw new Error('password step did not open')
    return found
  })
  fireEvent.change(inputs[0], { target: { value: 'me@ciphera.test' } })
  fireEvent.change(inputs[1], { target: { value: 'wrong-password' } })
  fireEvent.submit(inputs[0].closest('form')!)
  await waitFor(() => expect(completeMock).toHaveBeenCalled())
}

describe('PasskeyEnrolModal failure messages', () => {
  beforeEach(() => {
    beginMock.mockReset()
    completeMock.mockReset()
    abandonMock.mockReset()
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

describe('the one-passkey cap', () => {
  beforeEach(() => {
    beginMock.mockReset()
    completeMock.mockReset()
    abandonMock.mockReset()
    document.body.innerHTML = ''
  })

  it('names the 409 rather than saying "refused"', async () => {
    // ProfileSettings refuses before the modal opens, so reaching this means
    // the count changed underneath us — another tab, another device. The user
    // still needs the actionable sentence, not a generic refusal.
    await submitWith(new ApiError('Conflict', 409))
    await waitFor(() =>
      expect(screen.getByText(/already has a passkey/i)).toBeInTheDocument(),
    )
    expect(screen.queryByText(/refused the request/i)).not.toBeInTheDocument()
    // And not the wrong-password advice — retyping it would not help here.
    expect(screen.queryByText(/email or password/i)).not.toBeInTheDocument()
  })
})

/**
 * R1 — the ordering. These are the tests that would have caught the UX problem
 * the 03-09-2026 audit named: a user typed an email and a password, THEN touched
 * the sensor, THEN learned their authenticator could not do this at all.
 */
describe('the biometric comes before the password', () => {
  beforeEach(() => {
    beginMock.mockReset()
    completeMock.mockReset()
    abandonMock.mockReset()
    document.body.innerHTML = ''
  })

  it('asks for NOTHING before running the ceremony', async () => {
    beginMock.mockResolvedValueOnce(HANDLE())
    render(<Harness />)
    fireEvent.click(screen.getByText('open'))

    // The whole point: no email field, no password field, nothing to fill in.
    await screen.findByText('Continue')
    expect(document.querySelectorAll('input').length).toBe(0)
    expect(beginMock).not.toHaveBeenCalled()
  })

  it('runs the ceremony on the first click, before any credentials exist', async () => {
    beginMock.mockResolvedValueOnce(HANDLE())
    render(<Harness />)
    fireEvent.click(screen.getByText('open'))
    fireEvent.click(await screen.findByText('Continue'))

    await waitFor(() => expect(beginMock).toHaveBeenCalledTimes(1))
    // Called with no arguments — it cannot need a password, which is the
    // structural guarantee behind the ordering.
    expect(beginMock).toHaveBeenCalledWith()
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('reveals the password form only after the ceremony succeeds', async () => {
    await openAndPassBiometric()
    await waitFor(() => expect(document.querySelectorAll('input').length).toBe(3))
  })

  /**
   * 🔴 The failure this whole reordering is for. Bitwarden and Proton Pass both
   * failed on real hardware during the 03-09-2026 gate. The user must never be
   * asked for a password they were always going to waste.
   */
  it('a PRF-incapable authenticator costs one tap and NEVER asks for a password', async () => {
    beginMock.mockRejectedValueOnce(
      new PrfUnsupported(
        { name: 'Bitwarden', prf: 'no' },
        'Bitwarden cannot do this yet — it has no PRF support for the passkeys it stores. Nothing was saved.',
      ),
    )
    render(<Harness />)
    fireEvent.click(screen.getByText('open'))
    fireEvent.click(await screen.findByText('Continue'))

    // R2: the provider is NAMED, not "this device".
    expect(await screen.findByText(/Bitwarden cannot do this yet/)).toBeInTheDocument()
    expect(screen.getByText(/Nothing was saved/)).toBeInTheDocument()
    // And no password was ever requested.
    expect(document.querySelectorAll('input[type="password"]').length).toBe(0)
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('names the authenticator on the way through, once it is known', async () => {
    await openAndPassBiometric({ name: 'iCloud Keychain', prf: 'yes' })
    expect(await screen.findByText(/iCloud Keychain can unlock your vault/)).toBeInTheDocument()
  })

  it('falls back to neutral copy when the authenticator did not identify itself', async () => {
    await openAndPassBiometric(null)
    expect(await screen.findByText(/That passkey can unlock your vault/)).toBeInTheDocument()
  })
})

/**
 * R3 — the orphan. Reordering means a credential can exist on the authenticator
 * while nothing exists on the server. We made it, so we clean it up.
 */
describe('abandoning after the biometric', () => {
  beforeEach(() => {
    beginMock.mockReset()
    completeMock.mockReset()
    abandonMock.mockReset()
    document.body.innerHTML = ''
  })

  it('signals the provider to forget the credential when the user cancels', async () => {
    await openAndPassBiometric()
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => expect(abandonMock).toHaveBeenCalledTimes(1))
    // The real handle, so the PRF secret it holds is wiped too.
    expect(abandonMock.mock.calls[0][0]).toMatchObject({ credentialId: 'cred-1' })
  })

  it('does NOT signal when the user cancels before the ceremony', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open'))
    fireEvent.click(await screen.findByText('Cancel'))
    // There is nothing to forget: create() never ran.
    expect(abandonMock).not.toHaveBeenCalled()
  })

  /**
   * A mistyped password is the likely failure here, and making the user touch
   * the sensor again to fix a typo would undo the point of the reordering.
   */
  it('keeps the handle after a wrong password so a retry needs no second tap', async () => {
    await submitWith(new ApiError('Session expired, please sign in again.', 401))
    await waitFor(() => expect(screen.getByText(/didn’t match/)).toBeInTheDocument())
    // Still on the password step, and no cleanup ran — the credential is still
    // wanted.
    expect(document.querySelectorAll('input[type="password"]').length).toBe(1)
    expect(abandonMock).not.toHaveBeenCalled()
    expect(beginMock).toHaveBeenCalledTimes(1)
  })
})
