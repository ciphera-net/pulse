import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Role } from '@/lib/api/roles'

// --- Mocks ---------------------------------------------------------------

const createInviteLink = vi.fn()
vi.mock('@/lib/api/organization', () => ({
  createInviteLink: (...a: unknown[]) => createInviteLink(...a),
}))

vi.mock('@/lib/swr/sites', () => ({ useSites: () => ({ sites: [] }) }))

// Minimal facet doubles: Select becomes a native <select> so option changes are
// drivable; Modal renders its children only when open.
vi.mock('@ciphera-net/facet', () => ({
  Modal: ({ isOpen, children, title }: any) =>
    isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Select: ({ value, onChange, options, placeholder }: any) => (
    <select value={value} onChange={e => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
  Checkbox: ({ checked, onChange, label }: any) => (
    <label><input type="checkbox" checked={checked} onChange={onChange} />{label}</label>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import CreateInviteLinkModal from '../CreateInviteLinkModal'

const roles: Role[] = [
  { id: 'r1', slug: 'member', name: 'Member' } as Role,
]

const noop = () => {}

beforeEach(() => {
  createInviteLink.mockReset().mockResolvedValue({ id: 'l1', url: 'https://x/join/new', code: 'new' })
})

function renderModal() {
  return render(
    <CreateInviteLinkModal orgId="org1" roles={roles} open onOpenChange={noop} onCreated={noop} />,
  )
}

describe('CreateInviteLinkModal', () => {
  it('creates a link with the default (No limit) max_uses mapped to undefined', async () => {
    renderModal()
    fireEvent.change(screen.getByPlaceholderText(/Engineering team invite/i), {
      target: { value: 'Growth team' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Link' }))

    await waitFor(() => expect(createInviteLink).toHaveBeenCalledTimes(1))
    expect(createInviteLink).toHaveBeenCalledWith(
      'org1',
      expect.objectContaining({
        name: 'Growth team',
        role: 'member',
        expires_in: '7d',
        max_uses: undefined,
        metadata: expect.objectContaining({ app: 'pulse', role_id: 'r1' }),
      }),
    )
    // Success result screen replaces the form.
    await waitFor(() => expect(screen.getByText('Invite link created')).toBeInTheDocument())
  })

  it('maps a chosen numeric cap to max_uses (the No-limit sentinel is not a number)', async () => {
    renderModal()
    fireEvent.change(screen.getByPlaceholderText(/Engineering team invite/i), {
      target: { value: 'Capped invite' },
    })
    // Selects render in order: role, expires-in, max-uses.
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[2], { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Link' }))

    await waitFor(() => expect(createInviteLink).toHaveBeenCalledTimes(1))
    expect(createInviteLink).toHaveBeenCalledWith(
      'org1',
      expect.objectContaining({ max_uses: 10 }),
    )
  })
})
