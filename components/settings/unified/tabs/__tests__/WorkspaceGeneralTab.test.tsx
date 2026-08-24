import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import * as orgApi from '@/lib/api/organization'

// --- Mocks ---------------------------------------------------------------

const refreshSession = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { id: 'u_owner', org_id: 'org_1' }, refreshSession }),
}))

let mockIsOwner = true
let mockIsAdminOrOwner = true
vi.mock('@/lib/auth/permissions', () => ({
  useIsOwner: () => mockIsOwner,
  useIsAdminOrOwner: () => mockIsAdminOrOwner,
}))

vi.mock('@/lib/api/organization', () => ({
  getOrganization: vi.fn().mockResolvedValue({ name: 'Acme Corp', slug: 'acme-corp' }),
  getOrganizationMembers: vi.fn().mockResolvedValue([]),
  updateOrganization: vi.fn().mockResolvedValue(undefined),
  deleteOrganization: vi.fn().mockResolvedValue(undefined),
  transferOwnership: vi.fn().mockResolvedValue(undefined),
}))

// Minimal Facet surface used by the tab + the shared components it renders
// (DangerZone/SaveBar/ErrorState). SaveBar/ErrorState short-circuit to null in
// the happy path, so their icon deps never render.
vi.mock('@ciphera-net/facet', () => ({
  // `@/lib/utils` re-exports cn from facet; the real panels call it.
  cn: (...args: any[]) => args.flat().filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  InputGroup: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  InputGroupAddon: ({ children, align, ...props }: any) => <div {...props}>{children}</div>,
  InputGroupInput: (props: any) => <input {...props} />,
  Select: ({ value, onChange, options, placeholder, ...props }: any) => (
    <select {...props} value={value} onChange={e => onChange?.(e.target.value)}>
      <option value="">{placeholder}</option>
      {options?.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
  Spinner: () => <div>loading</div>,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import WorkspaceGeneralTab from '../WorkspaceGeneralTab'

beforeEach(() => {
  mockIsOwner = true
  mockIsAdminOrOwner = true
  refreshSession.mockClear()
  vi.clearAllMocks()
  ;(orgApi.getOrganization as any).mockResolvedValue({ name: 'Acme Corp', slug: 'acme-corp' })
  ;(orgApi.getOrganizationMembers as any).mockResolvedValue([])
})

describe('WorkspaceGeneralTab (Facet structured panels)', () => {
  it('loads the workspace panel with name + slug once the org resolves', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    // Panel kicker + slug addon are present.
    expect(screen.getByText('Workspace')).toBeTruthy()
    expect(screen.getByText('pulse.ciphera.net/')).toBeTruthy()
    expect(screen.getByDisplayValue('acme-corp')).toBeTruthy()
  })

  it('renders the danger zone with distinct Transfer + Delete entry actions', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    expect(screen.getByText('Danger zone')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Transfer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('keeps the typed-DELETE gate: confirm stays disabled until DELETE is typed', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const confirm = await screen.findByRole('button', { name: 'Delete Organization' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    const field = screen.getByPlaceholderText('DELETE')
    fireEvent.change(field, { target: { value: 'DELETE' } })
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false))
  })

  it('hides the danger zone + save bar for plain members', async () => {
    mockIsOwner = false
    mockIsAdminOrOwner = false
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    expect(screen.queryByText('Danger zone')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Transfer' })).toBeNull()
  })

  it('admins can rename but never see the danger zone — two server rules, two gates', async () => {
    mockIsOwner = false
    mockIsAdminOrOwner = true
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    // Rename surfaces follow ciphera-id's owner-OR-admin rule.
    expect((screen.getByDisplayValue('Acme Corp') as HTMLInputElement).disabled).toBe(false)
    // Deletion/transfer stay owner-only.
    expect(screen.queryByRole('button', { name: 'Transfer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('transfer rotates the token before the reload — the old cookie still says owner', async () => {
    const { getOrganizationMembers } = await import('@/lib/api/organization')
    vi.mocked(getOrganizationMembers).mockResolvedValueOnce([
      { user_id: 'u_next', user_email: 'next@acme.com', role: 'member' } as never,
    ])
    // jsdom cannot navigate; capture href assignments instead.
    const hrefSpy = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, set href(v: string) { hrefSpy(v) } },
    })
    try {
      render(<WorkspaceGeneralTab />)
      await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
      fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
      fireEvent.change(screen.getByLabelText('New owner'), { target: { value: 'u_next' } })
      fireEvent.click(screen.getByRole('button', { name: 'Transfer Ownership' }))
      await waitFor(() => expect(hrefSpy).toHaveBeenCalledWith('/settings/organization/general'))
      expect(refreshSession).toHaveBeenCalledTimes(1)
      // Rotation strictly BEFORE navigation: a bare reload re-hydrates the old
      // role and the ex-owner's Danger Zone survives it.
      expect(refreshSession.mock.invocationCallOrder[0]).toBeLessThan(hrefSpy.mock.invocationCallOrder[0])
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    }
  })
})
