import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Role, PermissionGroup } from '@/lib/api/roles'
import * as rolesApi from '@/lib/api/roles'

// --- Mocks ---------------------------------------------------------------

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
// its children so a masthead CTA (this tab has none) would still be assertable.
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
  RailGrid: ({ children }: any) => <div>{children}</div>,
  RailGridTile: ({ children }: any) => <div>{children}</div>,
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
    // Scope chip present.
    expect(screen.getAllByText('All sites').length).toBeGreaterThan(0)
  })

  it('titles the panel Roles and permissions as a sentence-case heading', async () => {
    render(<WorkspaceRolesTab />)
    const heading = await screen.findByRole('heading', { level: 2, name: 'Roles and permissions' })
    expect(heading.className).toMatch(/\btext-sm\b/)
    expect(heading.className).toMatch(/\bfont-semibold\b/)
    expect(heading.className).not.toMatch(/uppercase|micro-label/)
  })

  it('shows the loading skeleton, not a bare spinner, before roles resolve', () => {
    // Never-resolving promise: keeps the component on its loading branch.
    vi.mocked(rolesApi.listRoles).mockReturnValue(new Promise(() => {}))
    render(<WorkspaceRolesTab />)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('shows the empty state, never a header over nothing, when there are no roles', async () => {
    vi.mocked(rolesApi.listRoles).mockResolvedValueOnce({ roles: [] })
    render(<WorkspaceRolesTab />)
    await waitFor(() => expect(screen.getByText('No roles configured')).toBeTruthy())
    // Built-in roles always exist in practice, but the branch must still read
    // as "nothing here", never as a panel with a title and no rows beneath it.
    expect(screen.queryByText('Analyst')).toBeNull()
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

  it('never renders a Built-in label — every role is built-in, so the chip said nothing', async () => {
    render(<WorkspaceRolesTab />)
    await waitFor(() => expect(screen.getByText('Analyst')).toBeTruthy())
    expect(screen.queryByText('Built-in')).toBeNull()
  })

  it('expands a role through a real button with aria-expanded, not a clickable div', async () => {
    render(<WorkspaceRolesTab />)
    const trigger = await screen.findByRole('button', { name: /Analyst/i })
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('fades the permission panel in on the house curve as it opens, not height alone', async () => {
    render(<WorkspaceRolesTab />)
    const trigger = await screen.findByRole('button', { name: /Analyst/i })
    const panelId = trigger.getAttribute('aria-controls')
    const panel = document.getElementById(panelId!)!
    const fadeLayer = panel.querySelector('.transition-opacity')
    expect(fadeLayer).toBeTruthy()
    expect(fadeLayer!.className).toMatch(/\bduration-base\b/)
    expect(fadeLayer!.className).toMatch(/\bease-apple\b/)
    expect(fadeLayer!.className).toMatch(/\bopacity-0\b/)
    fireEvent.click(trigger)
    expect(fadeLayer!.className).toMatch(/\bopacity-100\b/)
    expect(fadeLayer!.className).not.toMatch(/\bopacity-0\b/)
  })

  it('is read-only for everyone — no create CTA, no row mutators, permissions are display-only glyphs', async () => {
    render(<WorkspaceRolesTab />)
    await waitFor(() => expect(screen.getByText('Analyst')).toBeTruthy())
    // Custom-role CRUD is gone (batch 4): nothing on this tab mutates.
    expect(screen.queryByRole('button', { name: /New role/i })).toBeNull()
    expect(screen.queryByLabelText('Delete role')).toBeNull()
    expect(screen.queryByLabelText('Rename role')).toBeNull()
    // No form control anywhere — a disabled checkbox used as a display glyph
    // was replaced by an inert granted/not-granted mark.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /Analyst/i }))
    await waitFor(() =>
      expect(screen.getAllByRole('img', { name: /Granted|Not granted/i }).length).toBeGreaterThan(0),
    )
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('surfaces an error state (not an empty state) when the load fails', async () => {
    vi.mocked(rolesApi.listRoles).mockRejectedValueOnce(new Error('boom'))
    render(<WorkspaceRolesTab />)
    await waitFor(() =>
      expect(screen.getByText("Couldn't load roles and permissions")).toBeTruthy(),
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    // The error branch must not read as "no roles".
    expect(screen.queryByText(/No roles configured/i)).toBeNull()
  })

  it('has no em dash or en dash in its source (comments stripped)', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/settings/unified/tabs/WorkspaceRolesTab.tsx'),
      'utf8',
    )
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(stripped).not.toMatch(/[—–]/)
  })
})
