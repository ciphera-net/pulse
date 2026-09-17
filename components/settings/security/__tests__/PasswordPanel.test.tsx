import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const auth = vi.hoisted(() => ({ logout: vi.fn() }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ logout: auth.logout }) }))

const api = vi.hoisted(() => ({
  authFetch: vi.fn().mockResolvedValue(undefined),
  change: vi.fn().mockResolvedValue({ payload: { registration: 'blob' } }),
}))
vi.mock('@/lib/api/client', () => ({ authFetch: api.authFetch }))
vi.mock('@/lib/auth/tessera/opaque-change-password', () => ({ performOpaqueChangePassword: api.change }))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, asChild, isLoading, ...p }: any) => <button {...p}>{children}</button>,
  Modal: ({ isOpen, title, children }: any) => (isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null),
  PasswordInput: ({ label, ...p }: any) => <input type="password" aria-label={label} {...p} />,
  toast: toastMock,
}))

import PasswordPanel from '../PasswordPanel'

function fill(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } })
}

beforeEach(() => {
  auth.logout.mockReset()
  api.authFetch.mockReset().mockResolvedValue(undefined)
  api.change.mockReset().mockResolvedValue({ payload: { registration: 'blob' } })
})

describe('PasswordPanel', () => {
  it('is a titled panel with one row and a dialog behind it', () => {
    render(<PasswordPanel />)
    expect(screen.getByRole('heading', { level: 2, name: 'Password' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Change password…' }))
    expect(screen.getByRole('dialog', { name: 'Change password' })).toBeInTheDocument()
  })

  it("labels the row \"Your password\", not a second \"Password\" under the panel title", () => {
    render(<PasswordPanel />)
    expect(screen.getByText('Your password')).toBeInTheDocument()
    expect(screen.getByText('At least 12 characters.')).toBeInTheDocument()
    // Exactly one "Password" on the page: the panel title. The row used to repeat it.
    expect(screen.getAllByText('Password', { exact: true })).toHaveLength(1)
  })

  it('refuses a mismatch and a short password before any ceremony runs', () => {
    render(<PasswordPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Change password…' }))
    fill('old-password-1', 'new-password-123', 'new-password-124')
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(screen.getByRole('alert')).toHaveTextContent("The new passwords don't match.")
    fill('old-password-1', 'short', 'short')
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use at least 12 characters.')
    expect(api.change).not.toHaveBeenCalled()
  })

  it('runs the OPAQUE ceremony with the raw passwords, PUTs the payload without retry, then signs out', async () => {
    render(<PasswordPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Change password…' }))
    fill('old-password-1', 'new-password-123', 'new-password-123')
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1))
    expect(api.change).toHaveBeenCalledWith({ oldPassword: 'old-password-1', newPassword: 'new-password-123' })
    expect(api.authFetch).toHaveBeenCalledWith('/auth/user/password/opaque', {
      method: 'PUT',
      body: JSON.stringify({ registration: 'blob' }),
      skipAuthRetry: true,
    })
    expect(toastMock.success).toHaveBeenCalled()
  })

  it('shows the ceremony\'s own message on failure and does not sign out', async () => {
    api.change.mockRejectedValueOnce(new Error('This account has no encrypted vault, so its password cannot be changed here.'))
    render(<PasswordPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Change password…' }))
    fill('old-password-1', 'new-password-123', 'new-password-123')
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no encrypted vault')
    expect(auth.logout).not.toHaveBeenCalled()
    expect(api.authFetch).not.toHaveBeenCalled()
  })
})
