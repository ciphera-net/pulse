import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import * as orgApi from '@/lib/api/organization'
import { deferred, resetDeferred, commitLast, undoLast } from '@/lib/hold/__tests__/facetHoldStandIn'

// --- Mocks ---------------------------------------------------------------

const refresh = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { id: 'u_owner', org_id: 'org_1' }, refresh }),
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
  getUserOrganizations: vi.fn().mockResolvedValue([]),
  updateOrganization: vi.fn().mockResolvedValue(undefined),
  deleteOrganization: vi.fn().mockResolvedValue(undefined),
  transferOwnership: vi.fn().mockResolvedValue(undefined),
  leaveOrganization: vi.fn().mockResolvedValue(undefined),
}))

const activateTeam = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/auth/switchOrganization', () => ({
  activateTeam: (...a: unknown[]) => activateTeam(...a),
}))

const getMe = vi.fn().mockResolvedValue({ user_id: 'u_owner', teams: [{ id: 'org_2', role: 'member' }], default_team_id: 'org_2' })
vi.mock('@/lib/api/me', () => ({
  getMe: (...a: unknown[]) => getMe(...a),
  pickActiveTeam: (me: { teams: Array<{ id: string }>; default_team_id: string | null }, preferred: string | null) =>
    (preferred && me.teams.some((t) => t.id === preferred)) ? preferred : me.default_team_id,
}))

// Minimal Facet surface used by the tab + the shared components it renders
// (DangerZone/SaveBar). SettingsLoadingState and SettingsErrorState are the
// tab's own house devices and are exercised for real below, not stubbed, so
// the tests pin their actual DOM shape (role="status" / role="alert") rather
// than a mock's approximation of it.
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
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

// The hold dialog and the Undo window are facet-hold's own suite; here a
// confirm is one click and each deferred action is committed, undone or
// failed by the test itself (PUL-28).
vi.mock('@ciphera-net/facet-hold', async () =>
  (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

// The page is worded from the ONE team-state signal (PULSE-59).
let mockTeamState: 'alone' | 'team' | null = 'team'
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => mockTeamState }))

import WorkspaceGeneralTab from '../WorkspaceGeneralTab'

// Strips `//` and `/* */` comments so the source-text check below pins the
// actual user-facing copy, not the WHY-comments beside it. The component has
// no `//` inside a string literal (no URLs), so a plain regex is safe.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const SOURCE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'WorkspaceGeneralTab.tsx')
const SOURCE = readFileSync(SOURCE_PATH, 'utf8')

beforeEach(() => {
  mockTeamState = 'team'
  mockIsOwner = true
  mockIsAdminOrOwner = true
  refresh.mockClear()
  vi.clearAllMocks()
  ;(orgApi.getOrganization as any).mockResolvedValue({ name: 'Acme Corp', slug: 'acme-corp' })
  ;(orgApi.getOrganizationMembers as any).mockResolvedValue([])
  activateTeam.mockClear().mockResolvedValue(undefined)
  getMe.mockClear().mockResolvedValue({ user_id: 'u_owner', teams: [{ id: 'org_2', role: 'member' }], default_team_id: 'org_2' })
  resetDeferred()
})

function withHref() {
  const hrefSpy = vi.fn()
  const originalLocation = window.location
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, set href(v: string) { hrefSpy(v) } },
  })
  return {
    hrefSpy,
    restore: () => Object.defineProperty(window, 'location', { configurable: true, value: originalLocation }),
  }
}

describe('WorkspaceGeneralTab (Facet structured panels)', () => {
  it('loads the team panel with name + slug once the org resolves', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    // Panel title + slug addon are present.
    expect(screen.getByText('Team')).toBeTruthy()
    expect(screen.getByText('pulse.ciphera.net/')).toBeTruthy()
    expect(screen.getByDisplayValue('acme-corp')).toBeTruthy()
  })

  it('renders the panel title as a sentence-case level-2 heading, the SectionHeader idiom', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    expect(screen.getByRole('heading', { level: 2, name: 'Team' })).toBeTruthy()
  })

  it('renders the danger zone with distinct Transfer + Delete entry actions', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    expect(screen.getByText('Danger zone')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Transfer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('opens the Transfer dialog with the member picker, held off until a member is chosen', async () => {
    ;(orgApi.getOrganizationMembers as any).mockResolvedValueOnce([
      { user_id: 'u_next', user_email: 'next@acme.com', role: 'member' } as never,
    ])
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    const dialog = await screen.findByRole('dialog', { name: 'Transfer ownership?' })
    expect(dialog.textContent).toContain('Select a member to become the new owner. You will become a regular member.')
    const hold = screen.getByRole('button', { name: 'Hold to transfer' })
    expect((hold as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('New owner'), { target: { value: 'u_next' } })
    expect((hold as HTMLButtonElement).disabled).toBe(false)
  })

  it('opens the Delete dialog with the consequence list, no typed confirmation field', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete Acme Corp?' })
    expect(dialog.textContent).toContain('This permanently deletes:')
    expect(dialog.textContent).toContain('All sites and their analytics data')
    expect(dialog.textContent).toContain('All team members and pending invitations')
    expect(dialog.textContent).toContain('It also cancels any active subscription.')
    expect(screen.getByRole('button', { name: 'Hold to delete' })).toBeTruthy()
    expect(screen.queryByPlaceholderText('DELETE')).toBeNull()
  })

  it('names the team as SAVED in the dialog and the Undo bar, never an unsaved draft of the Name field', async () => {
    // Review, 14-10-2026: the title read `Delete ${draft}?` while the request
    // targeted the saved team.
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    fireEvent.change(screen.getByDisplayValue('Acme Corp'), { target: { value: 'Something Unsaved' } })

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('dialog', { name: 'Delete Acme Corp?' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Delete Something Unsaved?' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    expect(deferred[0]!.message).toBe('Acme Corp deleted')
  })

  it('keeps all three team actions off while one waits behind the Undo bar, then turns them back on', async () => {
    // A second confirm would send the first at once, past its Undo.
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hold to delete' }))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true))
    expect((screen.getByRole('button', { name: 'Transfer' }) as HTMLButtonElement).disabled).toBe(true)
    undoLast()
    await waitFor(() => expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(false))
    expect((screen.getByRole('button', { name: 'Transfer' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('opens only one danger-zone dialog at a time', async () => {
    ;(orgApi.getOrganizationMembers as any).mockResolvedValueOnce([
      { user_id: 'u_next', user_email: 'next@acme.com', role: 'member' } as never,
    ])
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    expect(await screen.findByRole('dialog', { name: 'Transfer ownership?' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('dialog', { name: 'Delete Acme Corp?' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Transfer ownership?' })).toBeNull()
  })

  it('shows the house loading skeleton while the organization loads, never a bare centred spinner', async () => {
    let resolveOrg: (v: unknown) => void = () => {}
    ;(orgApi.getOrganization as any).mockReturnValueOnce(new Promise((resolve) => { resolveOrg = resolve }))

    render(<WorkspaceGeneralTab />)
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByDisplayValue('Acme Corp')).toBeNull()

    resolveOrg({ name: 'Acme Corp', slug: 'acme-corp' })
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
  })

  it('shows a named error state when the organization fails to load, never a stale or empty panel', async () => {
    ;(orgApi.getOrganization as any).mockRejectedValueOnce(new Error('boom'))

    render(<WorkspaceGeneralTab />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain("Couldn't load your team")
    expect(screen.queryByText('Workspace')).toBeNull()
  })

  it('shows an empty row when there are no other members to transfer to, not a bare paragraph', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    expect(await screen.findByText('No other members')).toBeTruthy()
    expect(screen.getByText('Invite and verify a member first.')).toBeTruthy()
  })

  it('shows a named error banner when members fail to load, never the empty-members copy', async () => {
    ;(orgApi.getOrganizationMembers as any).mockRejectedValueOnce(new Error('boom'))

    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    const banner = await screen.findByRole('alert')
    expect(banner.textContent).toContain("Couldn't load the members")
    expect(screen.queryByText('No other members')).toBeNull()
  })

  it('hides Transfer/Delete but still offers Leave for plain members', async () => {
    mockIsOwner = false
    mockIsAdminOrOwner = false
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    expect(screen.getByText('Danger zone')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Transfer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    const leaveButton = screen.getByRole('button', { name: 'Leave' })
    expect((leaveButton as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText("You will lose access to this team's sites and settings.")).toBeTruthy()
  })

  it('admins can rename but never see Transfer/Delete: two server rules, two gates', async () => {
    mockIsOwner = false
    mockIsAdminOrOwner = true
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    // Rename surfaces follow ciphera-id's owner-OR-admin rule.
    expect((screen.getByDisplayValue('Acme Corp') as HTMLInputElement).disabled).toBe(false)
    // Deletion/transfer stay owner-only; Leave is still there for an admin.
    expect(screen.queryByRole('button', { name: 'Transfer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Leave' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('never uses an em dash, en dash or a literal ellipsis in its source, comments included', () => {
    const stripped = stripComments(SOURCE)
    expect(stripped).not.toMatch(/[—–]/)
    expect(stripped).not.toMatch(/\.\.\./)
  })
})

// ─── Transfer ownership (PUL-28: hold + Undo, no in-page reveal) ───
describe('WorkspaceGeneralTab — Transfer ownership', () => {
  function openTransferAndHold() {
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    fireEvent.change(screen.getByLabelText('New owner'), { target: { value: 'u_next' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hold to transfer' }))
  }

  beforeEach(() => {
    ;(orgApi.getOrganizationMembers as any).mockResolvedValue([
      { user_id: 'u_next', user_email: 'next@acme.com', role: 'member' } as never,
    ])
  })

  it('holding transfers defers the request: nothing is sent and the dialog closes at once', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    openTransferAndHold()
    expect(screen.queryByRole('dialog', { name: 'Transfer ownership?' })).toBeNull()
    expect(orgApi.transferOwnership).not.toHaveBeenCalled()
    expect(deferred[0]!.message).toBe('Ownership transferred to next@acme.com')
  })

  it('commitLast sends with keepalive false, re-fetches the session, then navigates', async () => {
    const { hrefSpy, restore } = withHref()
    try {
      render(<WorkspaceGeneralTab />)
      await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
      openTransferAndHold()

      await commitLast()
      expect(orgApi.transferOwnership).toHaveBeenCalledWith('org_1', 'u_next', { keepalive: false })
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(hrefSpy).toHaveBeenCalledWith('/settings/organization/general')
      // Re-fetch strictly BEFORE navigation: a bare reload re-hydrates the old
      // role and the ex-owner's Danger Zone survives it.
      expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(hrefSpy.mock.invocationCallOrder[0])
    } finally {
      restore()
    }
  })

  it('commitLast({ keepalive: true }) passes keepalive through to the request', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    openTransferAndHold()

    await commitLast({ keepalive: true })
    expect(orgApi.transferOwnership).toHaveBeenCalledWith('org_1', 'u_next', { keepalive: true })
  })

  it('undoLast sends nothing and the page never navigates', async () => {
    const { hrefSpy, restore } = withHref()
    try {
      render(<WorkspaceGeneralTab />)
      await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
      openTransferAndHold()

      undoLast()
      expect(orgApi.transferOwnership).not.toHaveBeenCalled()
      expect(hrefSpy).not.toHaveBeenCalled()
      expect(refresh).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('a rejected transfer shows the error and never navigates', async () => {
    const { hrefSpy, restore } = withHref()
    try {
      ;(orgApi.transferOwnership as any).mockRejectedValueOnce(new Error('boom'))
      const { toast } = await import('@ciphera-net/facet')
      render(<WorkspaceGeneralTab />)
      await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
      openTransferAndHold()

      await commitLast()
      expect(toast.error).toHaveBeenCalledWith('error')
      expect(hrefSpy).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })
})

// ─── Delete team / Delete all data (PUL-28: hold + Undo, no typed DELETE) ───
describe('WorkspaceGeneralTab — Delete team', () => {
  function openDeleteAndHold() {
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
  }

  it('holding delete hides nothing yet to send: the dialog closes and the Undo bar names the team', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    openDeleteAndHold()
    expect(screen.queryByRole('dialog', { name: 'Delete Acme Corp?' })).toBeNull()
    expect(orgApi.deleteOrganization).not.toHaveBeenCalled()
    expect(deferred[0]!.message).toBe('Acme Corp deleted')
  })

  it('commitLast deletes with keepalive false, finds a survivor team and navigates to it', async () => {
    const { hrefSpy, restore } = withHref()
    try {
      ;(orgApi.getUserOrganizations as any).mockResolvedValueOnce([
        { organization_id: 'org_1' },
        { organization_id: 'org_2' },
      ])
      render(<WorkspaceGeneralTab />)
      await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
      openDeleteAndHold()

      await commitLast()
      expect(orgApi.deleteOrganization).toHaveBeenCalledWith('org_1', { keepalive: false })
      expect(activateTeam).toHaveBeenCalledWith('org_2')
      expect(hrefSpy).toHaveBeenCalledWith('/')
    } finally {
      restore()
    }
  })

  it('commitLast({ keepalive: true }) passes keepalive through to the request', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    openDeleteAndHold()

    await commitLast({ keepalive: true })
    expect(orgApi.deleteOrganization).toHaveBeenCalledWith('org_1', { keepalive: true })
  })

  it('lands in /setup/org when no survivor team is found', async () => {
    const { hrefSpy, restore } = withHref()
    try {
      ;(orgApi.getUserOrganizations as any).mockResolvedValueOnce([])
      render(<WorkspaceGeneralTab />)
      await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
      openDeleteAndHold()

      await commitLast()
      expect(hrefSpy).toHaveBeenCalledWith('/setup/org')
    } finally {
      restore()
    }
  })

  it('undoLast sends nothing and the page never navigates', async () => {
    const { hrefSpy, restore } = withHref()
    try {
      render(<WorkspaceGeneralTab />)
      await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
      openDeleteAndHold()

      undoLast()
      expect(orgApi.deleteOrganization).not.toHaveBeenCalled()
      expect(hrefSpy).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('a rejected delete shows the team-worded error and never navigates', async () => {
    const { hrefSpy, restore } = withHref()
    try {
      ;(orgApi.deleteOrganization as any).mockRejectedValueOnce(new Error('boom'))
      const { toast } = await import('@ciphera-net/facet')
      render(<WorkspaceGeneralTab />)
      await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
      openDeleteAndHold()

      await commitLast()
      expect(toast.error).toHaveBeenCalledWith('error')
      expect(hrefSpy).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })
})

// ─── PULSE-59: unlisted for somebody alone, but the route still renders ───
describe('WorkspaceGeneralTab, alone', () => {
  it('renders without calling the container a team, workspace or organization', async () => {
    mockTeamState = 'alone'
    const { container } = render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Details' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete all your data?' })
    expect(dialog.textContent).toContain('All pending invitations')
    expect(screen.getByRole('button', { name: 'Hold to delete' })).toBeTruthy()
    expect(container.textContent).not.toMatch(/team|workspace|organi[sz]ation/i)
  })

  it('names the deleted account in alone mode, not the team', async () => {
    mockTeamState = 'alone'
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Details' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hold to delete' }))
    expect(deferred[0]!.message).toBe('All data deleted')
  })

  // PULSE-92 Phase 5: nobody to leave and nobody to invite you back, the row
  // itself would also leak the word "team" the test above forbids.
  it('never shows a Leave row: there is no team to leave', async () => {
    mockTeamState = 'alone'
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Details' })).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull()
  })
})

// ─── Leave team (Option A, owner-approved 27-09-2026, PULSE-92 Phase 5) ───
describe('WorkspaceGeneralTab — Leave team', () => {
  it("the owner's Leave row is disabled and points at Transfer instead", async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    expect(screen.getByText('Transfer ownership to another member first.')).toBeTruthy()
    const leaveButton = screen.getByRole('button', { name: 'Leave' })
    expect((leaveButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('a member opens the dialog with the team named in the title, and Hold to leave / Cancel', async () => {
    mockIsOwner = false
    mockIsAdminOrOwner = false
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    const dialog = await screen.findByRole('dialog', { name: 'Leave Acme Corp?' })
    expect(dialog.textContent).toContain('An owner or admin can invite you back.')
    expect(screen.getByRole('button', { name: 'Hold to leave' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it("the owner's disabled Leave button opens no dialog when clicked", async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.queryByRole('dialog', { name: 'Leave Acme Corp?' })).toBeNull()
  })

  it('opening Leave (as a member) after re-rendering as owner closes an open Transfer dialog', async () => {
    mockIsOwner = false
    mockIsAdminOrOwner = false
    const { rerender } = render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(await screen.findByRole('dialog', { name: 'Leave Acme Corp?' })).toBeTruthy()

    // Re-render as the owner: the row set changes, but openDialog is still
    // 'leave' in state. Opening Transfer must still close Leave's dialog, the
    // same mutual exclusion every danger-zone dialog has.
    mockIsOwner = true
    mockIsAdminOrOwner = true
    rerender(<WorkspaceGeneralTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'Transfer' }))
    expect(await screen.findByRole('dialog', { name: 'Transfer ownership?' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Leave Acme Corp?' })).toBeNull()
  })

  it('holding leave defers the request: nothing is sent and the dialog closes at once', async () => {
    mockIsOwner = false
    mockIsAdminOrOwner = false
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hold to leave' }))
    expect(screen.queryByRole('dialog', { name: 'Leave Acme Corp?' })).toBeNull()
    expect(orgApi.leaveOrganization).not.toHaveBeenCalled()
    expect(deferred[0]!.message).toBe('You left Acme Corp')
  })

  it('commitLast leaves with keepalive false, switches to the account default team, and lands on /', async () => {
    mockIsOwner = false
    mockIsAdminOrOwner = false
    const { hrefSpy, restore } = withHref()
    try {
      render(<WorkspaceGeneralTab />)
      await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

      fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Hold to leave' }))
      await commitLast()

      expect(orgApi.leaveOrganization).toHaveBeenCalledWith('org_1', { keepalive: false })
      expect(getMe).toHaveBeenCalled()
      expect(activateTeam).toHaveBeenCalledWith('org_2')
      expect(hrefSpy).toHaveBeenCalledWith('/')
      // Land only AFTER the team switch is attempted.
      expect(activateTeam.mock.invocationCallOrder[0]).toBeLessThan(hrefSpy.mock.invocationCallOrder[0])
    } finally {
      restore()
    }
  })

  it('commitLast({ keepalive: true }) passes keepalive through to the request', async () => {
    mockIsOwner = false
    mockIsAdminOrOwner = false
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hold to leave' }))
    await commitLast({ keepalive: true })
    expect(orgApi.leaveOrganization).toHaveBeenCalledWith('org_1', { keepalive: true })
  })

  it('still lands on / when the best-effort team switch fails', async () => {
    mockIsOwner = false
    mockIsAdminOrOwner = false
    getMe.mockRejectedValueOnce(new Error('network'))
    const { hrefSpy, restore } = withHref()
    try {
      render(<WorkspaceGeneralTab />)
      await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

      fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Hold to leave' }))
      await commitLast()

      expect(hrefSpy).toHaveBeenCalledWith('/')
    } finally {
      restore()
    }
  })

  it('undoLast sends nothing and the page never navigates', async () => {
    mockIsOwner = false
    mockIsAdminOrOwner = false
    const { hrefSpy, restore } = withHref()
    try {
      render(<WorkspaceGeneralTab />)
      await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

      fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Hold to leave' }))
      undoLast()

      expect(orgApi.leaveOrganization).not.toHaveBeenCalled()
      expect(hrefSpy).not.toHaveBeenCalled()
      expect(activateTeam).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('shows an error toast and stays put when leaving fails', async () => {
    mockIsOwner = false
    mockIsAdminOrOwner = false
    const { toast } = await import('@ciphera-net/facet')
    ;(orgApi.leaveOrganization as any).mockRejectedValueOnce(new Error('boom'))
    const { hrefSpy, restore } = withHref()

    try {
      render(<WorkspaceGeneralTab />)
      await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

      fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Hold to leave' }))
      await commitLast()

      // The mocked getAuthErrorMessage always answers 'error'; the house
      // fallback text only shows through when it answers empty (untested
      // here, same as the Transfer/Delete failure paths).
      expect(toast.error).toHaveBeenCalledWith('error')
      expect(activateTeam).not.toHaveBeenCalled()
      expect(hrefSpy).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })
})
