import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { Role, PermissionGroup } from '@/lib/api/roles'
import * as rolesApi from '@/lib/api/roles'

// --- Mocks ---------------------------------------------------------------

// framer-motion: render children directly, drop animation props.
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => ({ children }: any) => <div>{children}</div> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCanManage,
}))

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { org_id: 'org_1' } }),
}))

vi.mock('@/lib/swr/sites', () => ({
  useSites: () => ({ sites: [] }),
}))

// The shell portal slot: with no provider, MastheadAction renders null. Wrap
// its children so the "New role" CTA is assertable in tests.
vi.mock('@/components/settings/shell-slots', () => ({
  MastheadAction: ({ children }: any) => <>{children}</>,
}))

vi.mock('@/lib/api/roles', () => ({
  listRoles: vi.fn(),
  listPermissionGroups: vi.fn(),
  // Mirrors the real const — the component derives the Not-assignable chip
  // from it, and a mock factory replaces the whole module.
  INVITABLE_SLUGS: ['admin', 'member'],
}))

vi.mock('@ciphera-net/facet', () => ({
  // lib/utils (and the panel primitives) re-export cn from facet — keep it callable.
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Select: ({ value, onChange, options = [], ...props }: any) => (
    <select value={value} onChange={(e) => onChange?.(e.target.value)} {...props}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
  Checkbox: ({ checked, onChange, disabled, label, id }: any) => (
    <label>
      <input type="checkbox" id={id} checked={checked} disabled={disabled} onChange={() => onChange?.()} />
      {label}
    </label>
  ),
  RailGrid: ({ children }: any) => <div>{children}</div>,
  RailGridTile: ({ children }: any) => <div>{children}</div>,
  Spinner: () => <div>loading</div>,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <>{children}</>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title }: any) => (open ? <div role="dialog">{title}</div> : null),
}))

import WorkspaceRolesTab from '../WorkspaceRolesTab'

const groups: PermissionGroup[] = [
  {
    key: 'analytics',
    label: 'Analytics',
    permissions: [
      { permission: 'dashboards.view', label: 'View dashboards', description: 'See analytics.' },
      { permission: 'roles.manage', label: 'Manage roles', description: 'Owner only.' },
    ],
  },
]

const ownerRole: Role = {
  id: 'r_owner', organization_id: 'org_1', name: 'Owner', slug: 'owner',
  is_builtin: true, color: null, permissions: ['dashboards.view', 'roles.manage'],
  site_scoped: false, site_ids: [], created_at: '', updated_at: '',
}
const analyst: Role = {
  id: 'r_analyst', organization_id: 'org_1', name: 'Analyst', slug: 'analyst',
  is_builtin: false, color: '#22c55e', permissions: ['dashboards.view'],
  site_scoped: false, site_ids: [], created_at: '', updated_at: '',
}

beforeEach(() => {
  mockCanManage = true
  vi.mocked(rolesApi.listPermissionGroups).mockResolvedValue({ groups })
  vi.mocked(rolesApi.listRoles).mockResolvedValue({ roles: [ownerRole, analyst] })
})

describe('WorkspaceRolesTab', () => {
  it('renders the ruled role rows once loaded', async () => {
    render(<WorkspaceRolesTab />)
    await waitFor(() => expect(screen.getByText('Analyst')).toBeTruthy())
    expect(screen.getByText('Owner')).toBeTruthy()
    // Built-in scope chip present.
    expect(screen.getAllByText('All sites').length).toBeGreaterThan(0)
  })

  it('labels non-invitable builtins Not assignable — invitable ones stay unlabelled', async () => {
    render(<WorkspaceRolesTab />)
    await waitFor(() => expect(screen.getByText('Analyst')).toBeTruthy())
    // Analyst survives display-wise but nothing can assign it any more.
    expect(screen.getByText('Not assignable')).toBeTruthy()
    // Owner is excluded from the label by design, and the fixture has no
    // admin/member rows — exactly one chip must render.
    expect(screen.getAllByText('Not assignable')).toHaveLength(1)
  })

  it('is read-only for everyone — no create CTA, no row mutators, matrix disabled', async () => {
    render(<WorkspaceRolesTab />)
    await waitFor(() => expect(screen.getByText('Analyst')).toBeTruthy())
    // Custom-role CRUD is gone (batch 4): nothing on this tab mutates.
    expect(screen.queryByRole('button', { name: /New role/i })).toBeNull()
    expect(screen.queryByLabelText('Delete role')).toBeNull()
    expect(screen.queryByLabelText('Rename role')).toBeNull()
    // Expand a row: every permission checkbox is disabled.
    fireEvent.click(screen.getByText('Analyst'))
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0))
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toBeDisabled()
    }
  })

  it('surfaces an error state (not an empty state) when the load fails', async () => {
    vi.mocked(rolesApi.listRoles).mockRejectedValueOnce(new Error('boom'))
    render(<WorkspaceRolesTab />)
    await waitFor(() =>
      expect(screen.getByText(/couldn't load roles and permissions/i)).toBeTruthy(),
    )
    // The error branch must not read as "no roles".
    expect(screen.queryByText(/No roles configured/i)).toBeNull()
  })

})
