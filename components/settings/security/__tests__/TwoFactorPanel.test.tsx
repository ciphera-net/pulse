import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const auth = vi.hoisted(() => ({ user: { id: 'u1', totp_enabled: false }, refresh: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: auth.user, refresh: auth.refresh }) }))

const api = vi.hoisted(() => ({
  setup2FA: vi.fn(),
  verify2FA: vi.fn(),
  disable2FA: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
}))
vi.mock('@/lib/api/2fa', () => api)

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, asChild, isLoading, ...p }: any) => <button {...p}>{children}</button>,
  Modal: ({ isOpen, title, children }: any) => (isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null),
  Input: (p: any) => <input {...p} />,
  Switcher: ({ options, value, onChange, 'aria-label': label }: any) => (
    <div role="radiogroup" aria-label={label}>
      {options.map((o: any) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  ),
  toast: toastMock,
}))

import TwoFactorPanel from '../TwoFactorPanel'

beforeEach(() => {
  auth.user = { id: 'u1', totp_enabled: false }
  auth.refresh.mockClear()
  Object.values(api).forEach((f) => f.mockReset())
  toastMock.success.mockClear()
  toastMock.error.mockClear()
})

describe('TwoFactorPanel', () => {
  it('turns two-factor on: setup, scan, one code, then the recovery codes once', async () => {
    api.setup2FA.mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXP', qr_code: 'data:image/png;base64,QR' })
    api.verify2FA.mockResolvedValue({ message: 'ok', recovery_codes: ['aaaa-1111', 'bbbb-2222'] })
    render(<TwoFactorPanel />)
    expect(screen.getByRole('heading', { level: 2, name: 'Two-factor authentication' })).toBeInTheDocument()
    expect(screen.getByText('Off')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Turn on…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Turn on two-factor authentication' })
    expect(api.setup2FA).toHaveBeenCalledTimes(1)
    expect(within(dialog).getByRole('img', { name: 'QR code for your authenticator app' })).toHaveAttribute('src', 'data:image/png;base64,QR')
    expect(within(dialog).getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Code from your app'), { target: { value: '12x3456' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }))
    await waitFor(() => expect(api.verify2FA).toHaveBeenCalledWith('123456'))
    expect(auth.refresh).toHaveBeenCalled()
    const codes = await screen.findByRole('dialog', { name: 'Your recovery codes' })
    expect(within(codes).getByText('aaaa-1111')).toBeInTheDocument()
    expect(within(codes).getByText('bbbb-2222')).toBeInTheDocument()
  })

  it('says a wrong code did not work, and keeps the dialog open', async () => {
    api.setup2FA.mockResolvedValue({ secret: 's', qr_code: 'data:x' })
    api.verify2FA.mockRejectedValue(new Error('invalid'))
    render(<TwoFactorPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Turn on…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Turn on two-factor authentication' })
    fireEvent.change(within(dialog).getByLabelText('Code from your app'), { target: { value: '000000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("That code didn't work")
    expect(screen.getByRole('dialog', { name: 'Turn on two-factor authentication' })).toBeInTheDocument()
  })

  it('turns two-factor off with a recovery code, sending only the second factor', async () => {
    auth.user = { id: 'u1', totp_enabled: true }
    api.disable2FA.mockResolvedValue(undefined)
    render(<TwoFactorPanel />)
    expect(screen.getByText('On')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Turn off…' }))
    const dialog = screen.getByRole('dialog', { name: 'Turn off two-factor authentication' })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Recovery code' }))
    fireEvent.change(within(dialog).getByLabelText('Recovery code'), { target: { value: ' cccc-3333 ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off' }))
    await waitFor(() => expect(api.disable2FA).toHaveBeenCalledWith('', { recovery_code: 'cccc-3333' }))
    expect(auth.refresh).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('regenerates recovery codes against an app code and shows the new set', async () => {
    auth.user = { id: 'u1', totp_enabled: true }
    api.regenerateRecoveryCodes.mockResolvedValue({ recovery_codes: ['dddd-4444'] })
    render(<TwoFactorPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate…' }))
    const dialog = screen.getByRole('dialog', { name: 'Regenerate recovery codes' })
    fireEvent.change(within(dialog).getByLabelText('Code from your app'), { target: { value: '654321' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(api.regenerateRecoveryCodes).toHaveBeenCalledWith('', { totp_code: '654321' }))
    const codes = await screen.findByRole('dialog', { name: 'Your recovery codes' })
    expect(within(codes).getByText('dddd-4444')).toBeInTheDocument()
  })

  it('offers no recovery-codes row while two-factor is off', () => {
    render(<TwoFactorPanel />)
    expect(screen.queryByText('Recovery codes')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Regenerate…' })).toBeNull()
  })
})
