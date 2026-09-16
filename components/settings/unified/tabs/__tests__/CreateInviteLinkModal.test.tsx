import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Role } from '@/lib/api/roles'

// --- Mocks ---------------------------------------------------------------

const createInviteLink = vi.fn()
vi.mock('@/lib/api/organization', () => ({
  createInviteLink: (...a: unknown[]) => createInviteLink(...a),
}))

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
  getAuthErrorMessage: vi.fn(() => 'error'),
}))

import CreateInviteLinkModal from '../CreateInviteLinkModal'
import { toast, getAuthErrorMessage } from '@ciphera-net/facet'

function sourceWithoutComments(path: string): string {
  const raw = readFileSync(path, 'utf8')
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const roles: Role[] = [
  { id: 'r1', slug: 'member', name: 'Member', is_builtin: true } as Role,
  // Not invitable: the fine-grained roles were only ever assigned through the
  // removed metadata.role_id path, so offering one would silently mint a
  // member. The options filter must drop it.
  { id: 'r2', slug: 'analyst', name: 'Analyst', is_builtin: true } as Role,
  { id: 'r3', slug: 'custom-x', name: 'Custom X', is_builtin: false } as Role,
]

const noop = () => {}

beforeEach(() => {
  createInviteLink.mockReset().mockResolvedValue({ id: 'l1', url: 'https://x/join/new', code: 'new' })
  vi.mocked(getAuthErrorMessage).mockReset().mockReturnValue('error')
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
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))

    await waitFor(() => expect(createInviteLink).toHaveBeenCalledTimes(1))
    expect(createInviteLink).toHaveBeenCalledWith(
      'org1',
      expect.objectContaining({
        name: 'Growth team',
        role: 'member',
        expires_in: '7d',
        max_uses: undefined,
        // metadata carries the app marker ONLY — role_id/site_ids retired
        // with the backend's escalation branch.
        metadata: { app: 'pulse' },
      }),
    )
    // Success result screen replaces the form.
    await waitFor(() => expect(screen.getByText('Invite link created')).toBeInTheDocument())
  })

  it('offers only the invitable builtins — admin and member, never analyst or custom roles', () => {
    renderModal()
    const roleSelect = screen.getAllByRole('combobox')[0]
    const labels = Array.from(roleSelect.querySelectorAll('option')).map(o => o.textContent)
    expect(labels).toContain('Member')
    expect(labels).not.toContain('Analyst')
    expect(labels).not.toContain('Custom X')
  })

  it('maps a chosen numeric cap to max_uses (the No-limit sentinel is not a number)', async () => {
    renderModal()
    fireEvent.change(screen.getByPlaceholderText(/Engineering team invite/i), {
      target: { value: 'Capped invite' },
    })
    // Selects render in order: role, expires-in, max-uses.
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[2], { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))

    await waitFor(() => expect(createInviteLink).toHaveBeenCalledTimes(1))
    expect(createInviteLink).toHaveBeenCalledWith(
      'org1',
      expect.objectContaining({ max_uses: 10 }),
    )
  })
})

describe('CreateInviteLinkModal structure and copy (settings overhaul, 16-09-2026)', () => {
  it('titles the modal and its confirm with the same name, in sentence case', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Create invite link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create link' })).toBeInTheDocument()
  })

  it('puts Cancel and Done on the outline rung, never the retired secondary fill', async () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Cancel' }).getAttribute('variant')).toBe('outline')

    fireEvent.change(screen.getByPlaceholderText(/Engineering team invite/i), { target: { value: 'Growth team' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Done' }).getAttribute('variant')).toBe('outline')
  })

  it('shows the ellipsis character while submitting, never three literal periods', async () => {
    let resolveCreate!: (value: { id: string; url: string; code: string }) => void
    createInviteLink.mockReset().mockImplementationOnce(
      () => new Promise(resolve => { resolveCreate = resolve }),
    )
    renderModal()
    fireEvent.change(screen.getByPlaceholderText(/Engineering team invite/i), { target: { value: 'Growth team' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))

    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeInTheDocument()
    resolveCreate({ id: 'l2', url: 'https://x/join/new2', code: 'new2' })
    await waitFor(() => expect(screen.getByText('Invite link created')).toBeInTheDocument())
  })

  it('offers a Facet ghost copy button in the result screen, not a raw button', async () => {
    renderModal()
    fireEvent.change(screen.getByPlaceholderText(/Engineering team invite/i), { target: { value: 'Growth team' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))
    await waitFor(() => expect(screen.getByText('Invite link created')).toBeInTheDocument())

    const copyButton = screen.getByRole('button', { name: 'Copy invite link' })
    expect(copyButton.getAttribute('variant')).toBe('ghost')
  })

  it('falls back to the house error voice when the server gives no detail', async () => {
    vi.mocked(getAuthErrorMessage).mockReturnValueOnce('')
    createInviteLink.mockReset().mockRejectedValueOnce(new Error('boom'))
    renderModal()
    fireEvent.change(screen.getByPlaceholderText(/Engineering team invite/i), { target: { value: 'Growth team' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't create the invite link. Try again."),
    )
  })

  it('has no em or en dashes anywhere in its source', () => {
    const src = sourceWithoutComments(join(process.cwd(), 'components/settings/unified/tabs/CreateInviteLinkModal.tsx'))
    expect(src).not.toMatch(/[—–]/)
  })
})
