import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OrganizationMember } from '@/lib/api/organization'
import { MastheadSlotProvider } from '@/components/settings/shell-slots'

// --- Mocks ---------------------------------------------------------------

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useIsAdminOrOwner: () => mockCanManage,
}))

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { id: 'u-you', org_id: 'org1', email: 'me@x.com' } }),
}))

const getOrganizationMembers = vi.fn()
const getInviteLinks = vi.fn().mockResolvedValue([])
const removeOrganizationMember = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/organization', () => ({
  getOrganizationMembers: (...a: unknown[]) => getOrganizationMembers(...a),
  getInviteLinks: (...a: unknown[]) => getInviteLinks(...a),
  removeOrganizationMember: (...a: unknown[]) => removeOrganizationMember(...a),
}))

vi.mock('@/lib/api/roles', () => ({
  listRoles: vi.fn().mockResolvedValue({ roles: [] }),
}))

// Sub-components are exercised by their own suites — stub them here so this
// tab test stays focused on roster composition + the masthead CTA.
vi.mock('../CreateInviteLinkModal', () => ({ default: () => null }))
vi.mock('../InviteLinksSection', () => ({ default: () => <div data-testid="invite-links" /> }))

// Renders only its confirm affordance — the dialog primitive itself belongs
// to ConfirmDialog's own suite, not this tab's.
vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, onConfirm }: any) =>
    open ? <button onClick={onConfirm}>Confirm remove</button> : null,
}))

vi.mock('@ciphera-net/facet', () => ({
  // `size` carries through as `data-size` (WorkspaceAuditTab precedent):
  // React drops an unrecognised `size` attribute on a plain <button> silently,
  // so a real DOM attribute is needed to pin which rung of the ladder a
  // control renders at.
  Button: ({ children, size, ...props }: any) => (
    <button data-size={size} {...props}>{children}</button>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
  // `@/lib/utils` re-exports `cn` from facet — the panel primitives call it.
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
}))

import WorkspaceMembersTab from '../WorkspaceMembersTab'
import { toast } from '@ciphera-net/facet'

function sourceWithoutComments(path: string): string {
  const raw = readFileSync(path, 'utf8')
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const members: OrganizationMember[] = [
  { organization_id: 'org1', user_id: 'u-you', role: 'owner', joined_at: '2026-01-02T00:00:00Z' },
  { organization_id: 'org1', user_id: 'u-mem-1234', role: 'member', joined_at: '2026-03-04T00:00:00Z' },
  { organization_id: 'org1', user_id: 'u-adm', role: 'admin', joined_at: '2026-04-05T00:00:00Z', user_email: 'pending@x.com' },
]

function renderTab() {
  const slot = document.createElement('div')
  slot.setAttribute('data-testid', 'masthead-slot')
  document.body.appendChild(slot)
  return render(
    <MastheadSlotProvider value={slot}>
      <WorkspaceMembersTab />
    </MastheadSlotProvider>,
  )
}

beforeEach(() => {
  mockCanManage = true
  getOrganizationMembers.mockReset().mockResolvedValue(members)
  getInviteLinks.mockReset().mockResolvedValue([])
  removeOrganizationMember.mockClear()
  vi.mocked(toast.success).mockClear()
  document.body.innerHTML = ''
})

describe('WorkspaceMembersTab roster', () => {
  it('renders a ruled roster with display names, role chips and the member count', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('You')).toBeInTheDocument())
    // Zero-PII: pending invite shows its email; owner shows "You".
    expect(screen.getByText('pending@x.com')).toBeInTheDocument()
    expect(screen.getByText('Member u-mem-12')).toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(screen.getByText('3 members in your organization')).toBeInTheDocument()
  })

  it('portals the Invite member CTA into the masthead when the user can manage', async () => {
    renderTab()
    const cta = await screen.findByRole('button', { name: /Invite member/i })
    // The CTA lives in the masthead slot, not inline in the panel.
    expect(screen.getByTestId('masthead-slot').contains(cta)).toBe(true)
    // Rule 1's masthead pattern is `<Button size="sm">`, matching every other
    // tab's primary action (WorkspaceApiKeysTab's "New key").
    expect(cta.getAttribute('data-size')).toBe('sm')
  })

  it('shows an always-visible remove action for removable members only', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('You')).toBeInTheDocument())
    // Removable: a plain member / admin who is neither you nor the owner.
    const remove = screen.getByLabelText('Remove pending@x.com')
    expect(remove).toBeInTheDocument()
    // B12: not a hover-only reveal.
    expect(remove.className).not.toMatch(/opacity-0/)
    // Not removable: you (owner).
    expect(screen.queryByLabelText('Remove You')).toBeNull()
  })

  it('hides the CTA and all remove actions when the user cannot manage', async () => {
    mockCanManage = false
    renderTab()
    await waitFor(() => expect(screen.getByText('You')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Invite member/i })).toBeNull()
    expect(screen.queryByLabelText(/^Remove /)).toBeNull()
  })
})

describe('WorkspaceMembersTab non-happy states', () => {
  it('surfaces a distinct error state (not an empty roster) when the members fetch fails', async () => {
    getOrganizationMembers.mockRejectedValueOnce(new Error('boom'))
    renderTab()
    // Names the failed thing, and lands in the alert landmark rather than a
    // silently-empty roster.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load your organization members/i)
    // Error is not silently rendered as an empty roster, and the CTA is absent.
    expect(screen.queryByText(/in your organization$/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Invite member/i })).toBeNull()
  })

  it('surfaces the shared error state when invite links fail to load, not a silently empty links panel', async () => {
    // A genuine getInviteLinks failure used to be swallowed into `[]`, which
    // renders identically to an org that has zero links. It must fail the
    // whole load, the same as a members fetch failure.
    getInviteLinks.mockRejectedValueOnce(new Error('boom'))
    renderTab()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load your organization members/i)
    expect(screen.queryByTestId('invite-links')).toBeNull()
  })

  it('renders an in-frame empty state when there are no members', async () => {
    getOrganizationMembers.mockResolvedValueOnce([])
    renderTab()
    await waitFor(() => expect(screen.getByText('No members yet')).toBeInTheDocument())
    expect(screen.getByText('0 members in your organization')).toBeInTheDocument()
  })

  it('shows the shared loading skeleton, not a spinner, while the roster is in flight', async () => {
    // getOrganizationMembers has not resolved yet at first paint.
    renderTab()
    expect(screen.getByRole('status')).toBeInTheDocument()
    // Let the pending fetch settle so this test does not leak an unflushed
    // state update into the next one.
    await waitFor(() => expect(screen.getByText('You')).toBeInTheDocument())
  })
})

describe('WorkspaceMembersTab structure and copy (settings overhaul, 16-09-2026)', () => {
  it('titles the roster like a dashboard section, sentence case, not an uppercase kicker', async () => {
    renderTab()
    const heading = await screen.findByRole('heading', { level: 2, name: 'Members' })
    expect(heading.className).not.toMatch(/uppercase/)
  })

  it('renders the joined date with tabular-nums, never mono, for column alignment', async () => {
    renderTab()
    // All three fixture members carry a joined_at, so match on all of them.
    const captions = await waitFor(() => {
      const found = screen.getAllByText(/Joined/)
      expect(found.length).toBeGreaterThan(0)
      return found
    })
    for (const caption of captions) {
      expect(caption.className).toMatch(/tabular-nums/)
      expect(caption.className).not.toMatch(/font-mono/)
    }
  })

  it('renders the Owner role as a plain word chip: no icon, no dot', async () => {
    renderTab()
    const ownerChip = await screen.findByText('Owner')
    // A role is a label, not a live state — the chip carries no dot and no
    // Crown icon any more. Zero element children proves both are gone.
    expect(ownerChip.children).toHaveLength(0)
  })

  it('has no em or en dashes anywhere in its source', () => {
    const src = sourceWithoutComments(join(process.cwd(), 'components/settings/unified/tabs/WorkspaceMembersTab.tsx'))
    expect(src).not.toMatch(/[—–]/)
  })

  it('confirms a remove with subject-first, active-voice toast copy, not a passive "has been"', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('You')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Remove pending@x.com'))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm remove' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('pending@x.com removed'))
  })
})

describe('WorkspaceMembersTab row motion (round two, M5)', () => {
  it('wraps each member row in a motion element so a member appearing on reload rises into the roster instead of popping in unanimated', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('You')).toBeInTheDocument())

    // The only reload path this tab exposes outside the error state is the
    // one doRemove triggers; reuse it so the very next fetch returns a roster
    // that has grown by one, the same way any real reload can.
    const newMember: OrganizationMember = {
      organization_id: 'org1',
      user_id: 'u-new',
      role: 'member',
      joined_at: '2026-05-06T00:00:00Z',
      user_email: 'newbie@x.com',
    }
    getOrganizationMembers.mockResolvedValueOnce([...members, newMember])
    fireEvent.click(screen.getByLabelText('Remove pending@x.com'))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm remove' }))

    const row = await screen.findByTestId('member-row-u-new')
    // A plain wrapper carries no inline style at all; a motion element commits
    // its animated opacity/transform as one, which is how a reviewer can tell
    // the row is really under AnimatePresence rather than merely decorated to
    // look like it.
    expect(row.getAttribute('style')).toMatch(/opacity/)
  })

  it('lets a member row exit through AnimatePresence when removed, rather than vanishing on the spot', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('You')).toBeInTheDocument())
    expect(screen.getByTestId('member-row-u-adm')).toBeInTheDocument()

    getOrganizationMembers.mockResolvedValueOnce(members.filter(m => m.user_id !== 'u-adm'))
    fireEvent.click(screen.getByLabelText('Remove pending@x.com'))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm remove' }))

    await waitFor(() => expect(screen.queryByTestId('member-row-u-adm')).toBeNull(), { timeout: 2000 })
    expect(screen.getByTestId('member-row-u-you')).toBeInTheDocument()
  })
})
