import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import * as userApi from '@/lib/api/user'

// --- Mocks ---------------------------------------------------------------

const h = vi.hoisted(() => ({
  user: null as null | {
    id: string
    email: string
    preferences?: { email_notifications?: Record<string, boolean> }
  },
  refresh: vi.fn(),
}))

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: h.user, refresh: h.refresh }),
}))

vi.mock('@/lib/api/user', () => ({
  updateUserPreferences: vi.fn().mockResolvedValue(undefined),
}))

// Facet stand-ins. Toggle keeps its real switch semantics (role + aria-checked)
// so the test queries the way a screen reader would, and the label association
// is what names each switch — a toggle nobody can name is a toggle nobody can
// use. StatusChip / SettingsPanel / the panel primitives render for real.
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Banner: ({ title, children }: any) => (
    <div role="status">
      <p>{title}</p>
      <div>{children}</div>
    </div>
  ),
  Toggle: ({ checked, onChange, disabled }: any) => (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
    />
  ),
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import AccountSecurityAlertsTab from '../AccountSecurityAlertsTab'
import { toast } from '@ciphera-net/facet'

const mockUpdate = userApi.updateUserPreferences as unknown as ReturnType<typeof vi.fn>

/** The switch sitting in the same PanelRow as `label`. */
function switchFor(container: HTMLElement, label: string): HTMLButtonElement {
  const labelNode = Array.from(container.querySelectorAll('span,label')).find(
    n => n.textContent === label,
  )
  if (!labelNode) throw new Error(`no row labelled "${label}"`)
  const row = labelNode.closest('div.grid') as HTMLElement
  const control = row?.querySelector('[role="switch"]') as HTMLButtonElement | null
  if (!control) throw new Error(`row "${label}" has no switch`)
  return control
}

beforeEach(() => {
  h.user = { id: 'u1', email: '' }
  h.refresh.mockClear().mockResolvedValue(undefined)
  mockUpdate.mockClear().mockResolvedValue(undefined)
})

describe('AccountSecurityAlertsTab', () => {
  it('renders one switch per ID alert preference, defaulting to on', () => {
    const { container } = render(<AccountSecurityAlertsTab />)
    for (const label of ['Login activity', 'Password changes', 'Two-factor authentication']) {
      expect(switchFor(container, label).getAttribute('aria-checked')).toBe('true')
    }
  })

  it('hydrates each switch from the stored preference, not the default', () => {
    h.user = {
      id: 'u1',
      email: '',
      preferences: {
        email_notifications: {
          new_file_received: true,
          file_downloaded: true,
          login_alerts: false,
          password_alerts: true,
          two_factor_alerts: false,
        },
      },
    }
    const { container } = render(<AccountSecurityAlertsTab />)
    expect(switchFor(container, 'Login activity').getAttribute('aria-checked')).toBe('false')
    expect(switchFor(container, 'Password changes').getAttribute('aria-checked')).toBe('true')
    expect(switchFor(container, 'Two-factor authentication').getAttribute('aria-checked')).toBe('false')
  })

  it('writes the FULL preference block with only the flipped key changed', async () => {
    const { container } = render(<AccountSecurityAlertsTab />)
    fireEvent.click(switchFor(container, 'Password changes'))

    // The PUT replaces the block, so a partial body silently resets the keys it
    // omits — including the two this product does not read.
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        email_notifications: {
          new_file_received: true,
          file_downloaded: true,
          login_alerts: true,
          password_alerts: false,
          two_factor_alerts: true,
        },
      }),
    )
    await waitFor(() => expect(h.refresh).toHaveBeenCalled())
  })

  it('sends the key the toggle claims to control — each row wires its own preference', async () => {
    const cases: Array<[string, string]> = [
      ['Login activity', 'login_alerts'],
      ['Password changes', 'password_alerts'],
      ['Two-factor authentication', 'two_factor_alerts'],
    ]
    for (const [label, key] of cases) {
      mockUpdate.mockClear()
      const { container, unmount } = render(<AccountSecurityAlertsTab />)
      fireEvent.click(switchFor(container, label))
      await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
      const sent = mockUpdate.mock.calls[0][0].email_notifications as Record<string, boolean>
      // Exactly one key went false, and it is this row's key.
      expect(Object.entries(sent).filter(([, v]) => v === false).map(([k]) => k)).toEqual([key])
      unmount()
    }
  })

  it('puts the switch back and surfaces the failure when the write is rejected', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('nope'))
    const { container } = render(<AccountSecurityAlertsTab />)
    const control = switchFor(container, 'Login activity')
    fireEvent.click(control)

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    // No silent failure: the switch must not sit in a state the server rejected.
    expect(switchFor(container, 'Login activity').getAttribute('aria-checked')).toBe('true')
  })

  it('states the always-sent blocked-sign-in alert as a fact, with no switch', () => {
    const { container } = render(<AccountSecurityAlertsTab />)
    expect(screen.getByText('Blocked sign-in attempts')).toBeInTheDocument()
    expect(screen.getByText('Always sent')).toBeInTheDocument()
    // id-backend sends id_suspicious_login_blocked with no preference gate. A
    // switch here — even a disabled one — would advertise a control we do not
    // have, so the row must carry none.
    expect(() => switchFor(container, 'Blocked sign-in attempts')).toThrow()
    expect(container.querySelectorAll('[role="switch"]')).toHaveLength(3)
  })

  it('says out loud that the switches are not enforced yet', () => {
    // Measured 02-09-2026: id-backend fires every alert unconditionally
    // (totp.go, opaque_settings.go, opaque_login.go, recovery*.go) and Relay's
    // suppressible-template map holds exactly two entries, neither an `id_*`.
    // A switch that silently does nothing is the defect the profile-banner fix
    // removed; this assertion is what stops it being re-added here by deleting
    // one sentence. It comes out when a sender starts reading the preference.
    render(<AccountSecurityAlertsTab />)
    expect(screen.getByText(/not enforced yet/i)).toBeInTheDocument()
    expect(screen.getByText(/no sender checks these preferences today/i)).toBeInTheDocument()
  })

  it('renders the loading skeleton (not blank) while the session hydrates', () => {
    h.user = null
    render(<AccountSecurityAlertsTab />)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })
})
