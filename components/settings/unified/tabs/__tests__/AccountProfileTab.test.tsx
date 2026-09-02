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

const unlockMock = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('@/lib/auth/tessera/opaque-unlock', () => ({
  unlockVaultPII: unlockMock.fn,
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

  it('states the locked-vault fact without instructing the user to go anywhere', () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    const { container } = render(<AccountProfileTab />)
    expect(screen.getByText(/Your name and email stay encrypted/i)).toBeInTheDocument()
    expect(screen.getByText(/not unlocked in this browser/i)).toBeInTheDocument()
    // The banner must not promise a fix. Until April 2026 it told users to
    // "sign in on Ciphera ID once, then reload Pulse to restore them" — an
    // instruction that has been impossible since the cross-subdomain PII cookie
    // was removed. No restore claim may come back without a working unlock.
    expect(container.textContent).not.toMatch(/reload Pulse/i)
    expect(container.textContent).not.toMatch(/restore them/i)
    expect(container.textContent).not.toMatch(/Sign in on Ciphera ID/i)
  })

  it('renders no id.ciphera.net links in either PII state (the /settings URL is a 404)', () => {
    for (const user of [
      { id: 'u1', email: '', display_name: '' },
      { id: 'u1', email: 'ada@ciphera.net', display_name: 'Ada' },
    ]) {
      h.user = user
      const { container, unmount } = render(<AccountProfileTab />)
      const hrefs = Array.from(container.querySelectorAll('a')).map(a => a.getAttribute('href'))
      expect(hrefs.filter(href => href?.includes('id.ciphera.net'))).toEqual([])
      unmount()
    }
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

  it('unlocks the vault PII and shows the email, holding no key', async () => {
    // ZK account: no in-session email → the locked banner + Unlock action.
    h.user = { id: 'u1', email: '', display_name: '' }
    unlockMock.fn.mockReset()
    unlockMock.fn.mockResolvedValue({ email: 'ada@ciphera.net', display_name: 'Ada Lovelace' })
    const { container } = render(<AccountProfileTab />)

    // The email field starts empty (encrypted, not unlocked).
    expect(screen.queryByDisplayValue('ada@ciphera.net')).toBeNull()

    // Reveal the inline form, fill it, submit the form directly.
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    fireEvent.change(screen.getByPlaceholderText('Email you sign in with'), {
      target: { value: 'ada@ciphera.net' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pw' } })
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    // The unlock fn was called with what was typed, and on success the inline
    // form closes (its own email input disappears) — the decrypted PII now
    // populates the read-only profile field.
    await vi.waitFor(() =>
      expect(unlockMock.fn).toHaveBeenCalledWith({ email: 'ada@ciphera.net', password: 'pw' }),
    )
    await vi.waitFor(() =>
      expect(screen.queryByPlaceholderText('Email you sign in with')).toBeNull(),
    )
    // The vault display name surfaced into the (editable) display-name field.
    expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument()
  })

  it('keeps the locked state and surfaces an error on a bad password — never a blank name', async () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    unlockMock.fn.mockReset()
    unlockMock.fn.mockRejectedValue(new Error('bad password'))
    const { container } = render(<AccountProfileTab />)

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    fireEvent.change(screen.getByPlaceholderText('Email you sign in with'), {
      target: { value: 'ada@ciphera.net' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } })
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    // The error is surfaced and the form stays open for a retry — never a silent
    // close, and no PII was substituted (the profile email field stays empty).
    expect(await screen.findByText(/didn’t match/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Email you sign in with')).toBeInTheDocument()
    const profileEmail = container.querySelector('#account-display-name')
    expect(profileEmail).not.toBeNull()
  })
})
