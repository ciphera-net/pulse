import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
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

vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
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

import AccountSecurityAlertsPanel from '../AccountSecurityAlertsPanel'
import { toast } from '@ciphera-net/facet'

const mockUpdate = userApi.updateUserPreferences as unknown as ReturnType<typeof vi.fn>

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const SOURCE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'AccountSecurityAlertsPanel.tsx',
)

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

describe('AccountSecurityAlertsPanel', () => {
  it('renders one switch per ID alert preference, defaulting to on', () => {
    const { container } = render(<AccountSecurityAlertsPanel />)
    for (const label of ['New sign-ins', 'Password changes', 'Two-factor and passkeys']) {
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
    const { container } = render(<AccountSecurityAlertsPanel />)
    expect(switchFor(container, 'New sign-ins').getAttribute('aria-checked')).toBe('false')
    expect(switchFor(container, 'Password changes').getAttribute('aria-checked')).toBe('true')
    expect(switchFor(container, 'Two-factor and passkeys').getAttribute('aria-checked')).toBe('false')
  })

  it('writes the FULL preference block with only the flipped key changed', async () => {
    const { container } = render(<AccountSecurityAlertsPanel />)
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
      ['New sign-ins', 'login_alerts'],
      ['Password changes', 'password_alerts'],
      ['Two-factor and passkeys', 'two_factor_alerts'],
    ]
    for (const [label, key] of cases) {
      mockUpdate.mockClear()
      const { container, unmount } = render(<AccountSecurityAlertsPanel />)
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
    const { container } = render(<AccountSecurityAlertsPanel />)
    const control = switchFor(container, 'New sign-ins')
    fireEvent.click(control)

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    // No silent failure: the switch must not sit in a state the server rejected.
    expect(switchFor(container, 'New sign-ins').getAttribute('aria-checked')).toBe('true')
  })

  it('states the always-sent blocked-sign-in alert as a fact, with no switch', () => {
    const { container } = render(<AccountSecurityAlertsPanel />)
    expect(screen.getByText('Blocked sign-in attempts')).toBeInTheDocument()
    expect(screen.getByText('Always sent')).toBeInTheDocument()
    // id-backend sends id_suspicious_login_blocked with no preference gate. A
    // switch here — even a disabled one — would advertise a control we do not
    // have, so the row must carry none.
    expect(() => switchFor(container, 'Blocked sign-in attempts')).toThrow()
    expect(container.querySelectorAll('[role="switch"]')).toHaveLength(3)
  })

  it('renders the loading skeleton (not blank) while the session hydrates', () => {
    h.user = null
    render(<AccountSecurityAlertsPanel />)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })

  it('titles the panel "Your account" and explains it comes from Ciphera ID', () => {
    render(<AccountSecurityAlertsPanel />)
    const h2 = screen.getByRole('heading', { level: 2, name: 'Your account' })
    expect(h2.className).toMatch(/\btext-sm\b/)
    expect(h2.className).toMatch(/\bfont-semibold\b/)
    expect(h2.className).not.toMatch(/uppercase|micro-label/)
    expect(
      screen.getByText('Emails about signing in to your Ciphera account. They come from Ciphera ID, the sign-in behind Pulse.'),
    ).toBeInTheDocument()
  })

  it('has no raw button in the tree, only the three named switches and the panel', () => {
    render(<AccountSecurityAlertsPanel />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getAllByRole('switch')).toHaveLength(3)
  })

  it('never uses an em dash, en dash or a literal ellipsis in its user-facing copy', () => {
    const stripped = stripComments(readFileSync(SOURCE_PATH, 'utf8'))
    const stringLiterals = stripped.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g) ?? []
    const offenders = stringLiterals.filter(s => /[—–]/.test(s) || /\.\.\./.test(s))
    expect(offenders).toEqual([])
  })
})
