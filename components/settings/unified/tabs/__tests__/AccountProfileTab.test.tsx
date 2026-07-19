import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'ada@ciphera.net', display_name: 'Ada' } as
    | { id: string; email: string; display_name?: string }
    | null,
  refresh: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: h.user, refresh: h.refresh, logout: h.logout }),
}))

vi.mock('@/lib/api/user', () => ({
  updateDisplayName: vi.fn().mockResolvedValue(undefined),
  deleteAccount: vi.fn().mockResolvedValue(undefined),
}))

// SaveBar is portal + shell-slot machinery — stub it to a marker so the smoke
// render doesn't depend on the shell being mounted. Its own behavior is covered
// elsewhere; here we only assert the tab wires dirty state into it.
vi.mock('@/components/settings/SettingsSaveBar', () => ({
  default: ({ isDirty }: { isDirty: boolean }) => (
    <div data-testid="savebar" data-dirty={String(isDirty)} />
  ),
}))

vi.mock('@ciphera-net/facet', () => ({
  // `@/lib/utils` (used by the panel primitives this tab renders) re-exports `cn`
  // from facet, so the mock must keep a working class-merge helper.
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Banner: ({ title, children, action }: any) => (
    <div role="status">
      <p>{title}</p>
      <div>{children}</div>
      <div>{action}</div>
    </div>
  ),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import AccountProfileTab from '../AccountProfileTab'

beforeEach(() => {
  h.user = { id: 'u1', email: 'ada@ciphera.net', display_name: 'Ada' }
  h.refresh.mockClear()
  h.logout.mockClear()
})

describe('AccountProfileTab (Facet structured panels)', () => {
  it('renders the Profile panel with the display name and disabled email', () => {
    render(<AccountProfileTab />)
    // Panel kicker + rows present.
    expect(screen.getByText('Profile')).toBeInTheDocument()
    const email = screen.getByDisplayValue('ada@ciphera.net') as HTMLInputElement
    expect(email.disabled).toBe(true)
    // Zero-knowledge info note (PII available branch).
    expect(screen.getByText(/end-to-end encrypted/i)).toBeInTheDocument()
  })

  it('flips SaveBar to dirty when the display name changes', () => {
    render(<AccountProfileTab />)
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('false')
    fireEvent.change(screen.getByDisplayValue('Ada'), { target: { value: 'Ada Lovelace' } })
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('true')
  })

  it('renders the honest "profile details unavailable" state when PII is not unlocked', () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    render(<AccountProfileTab />)
    expect(screen.getByText(/Profile details unavailable in this session/i)).toBeInTheDocument()
    // Recovery link to Ciphera ID survives.
    expect(screen.getByRole('link', { name: /Open Ciphera ID/i })).toBeInTheDocument()
  })

  it('gates the typed-DELETE confirm: delete stays disabled until DELETE + password', () => {
    const { container } = render(<AccountProfileTab />)
    // Reveal the confirm via the DangerZone trigger.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const confirmBtn = screen.getByRole('button', { name: /Delete account/i }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)

    const password = container.querySelector('#account-delete-password') as HTMLInputElement
    const confirmText = container.querySelector('#account-delete-confirm') as HTMLInputElement
    fireEvent.change(password, { target: { value: 'hunter2' } })
    fireEvent.change(confirmText, { target: { value: 'DELETE' } })
    expect(confirmBtn.disabled).toBe(false)
  })

  it('renders the loading skeleton (not blank) while the session hydrates', () => {
    h.user = null
    render(<AccountProfileTab />)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })
})
