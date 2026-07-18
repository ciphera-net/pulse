import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import * as orgApi from '@/lib/api/organization'

// --- Mocks ---------------------------------------------------------------

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { id: 'u_owner', org_id: 'org_1' } }),
}))

let mockCan = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCan,
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
  mockCan = true
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

  it('hides the danger zone + save bar when the org.delete gate is denied', async () => {
    mockCan = false
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    expect(screen.queryByText('Danger zone')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Transfer' })).toBeNull()
  })
})
