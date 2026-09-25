import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OrganizationMember } from '@/lib/api/organization'
import { MastheadSlotProvider } from '@/components/settings/shell-slots'

// --- Mocks ---------------------------------------------------------------

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useIsAdminOrOwner: () => mockCanManage,
}))

let mockUser: { id: string; org_id: string; email: string; display_name?: string } = {
  id: 'u-you', org_id: 'org1', email: 'me@x.com', display_name: 'Ada Lovelace',
}
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: mockUser }),
}))

const getOrganizationMembers = vi.fn()
const getInviteLinks = vi.fn().mockResolvedValue([])
const removeOrganizationMember = vi.fn().mockResolvedValue(undefined)
const getOrganization = vi.fn()
const updateOrganization = vi.fn()
vi.mock('@/lib/api/organization', () => ({
  getOrganizationMembers: (...a: unknown[]) => getOrganizationMembers(...a),
  getInviteLinks: (...a: unknown[]) => getInviteLinks(...a),
  removeOrganizationMember: (...a: unknown[]) => removeOrganizationMember(...a),
  getOrganization: (...a: unknown[]) => getOrganization(...a),
  updateOrganization: (...a: unknown[]) => updateOrganization(...a),
}))

// The organization list: where the name step reads the current name when the
// person has no display name, and what it re-reads after a rename.
const revalidateOrganizations = vi.fn()
let mockOrganizations: Array<{ organization_id: string; organization_name?: string }> | null = [
  { organization_id: 'org1', organization_name: 'Quiet Harbour' },
]
vi.mock('@/lib/swr/organizations', () => ({
  useUserOrganizations: () => ({ organizations: mockOrganizations, mutate: revalidateOrganizations }),
}))

// The page reads the ONE team-state signal (PULSE-59); each test sets it.
let mockTeamState: 'alone' | 'team' | null = 'team'
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => mockTeamState }))

vi.mock('@/lib/api/roles', () => ({
  listRoles: vi.fn().mockResolvedValue({ roles: [] }),
}))

// Sub-components are exercised by their own suites — stub them here so this
// tab test stays focused on roster composition + the masthead CTA.
vi.mock('../CreateInviteLinkModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="invite-modal" /> : null),
}))
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
  // The name step's modal renders its children only when open, like
  // CreateInviteLinkModal's own suite stands it in.
  Modal: ({ isOpen, children, title }: { isOpen: boolean; children: ReactNode; title?: string }) =>
    isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null,
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  getAuthErrorMessage: (e: Error) => e?.message ?? '',
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

// One live invite link: once one exists, the first invite has happened.
const existingLink = {
  id: 'l1', organization_id: 'org1', name: 'First link', role: 'member', max_uses: null,
  use_count: 0, expires_at: '2026-10-02T00:00:00Z', created_by: 'u-you', created_at: '2026-09-25T00:00:00Z',
}

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
  mockTeamState = 'team'
  mockUser = { id: 'u-you', org_id: 'org1', email: 'me@x.com', display_name: 'Ada Lovelace' }
  mockOrganizations = [{ organization_id: 'org1', organization_name: 'Quiet Harbour' }]
  revalidateOrganizations.mockReset()
  getOrganization.mockReset().mockResolvedValue({ id: 'org1', name: 'Quiet Harbour', slug: 'quiet-harbour' })
  updateOrganization.mockReset().mockResolvedValue({ id: 'org1', name: 'Renamed', slug: 'quiet-harbour' })
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
    expect(screen.getByText('3 members in your team')).toBeInTheDocument()
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
    expect(alert).toHaveTextContent(/couldn't load your team's members/i)
    // Error is not silently rendered as an empty roster, and the CTA is absent.
    expect(screen.queryByText(/in your team$/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Invite member/i })).toBeNull()
  })

  it('surfaces the shared error state when invite links fail to load, not a silently empty links panel', async () => {
    // A genuine getInviteLinks failure used to be swallowed into `[]`, which
    // renders identically to an org that has zero links. It must fail the
    // whole load, the same as a members fetch failure.
    getInviteLinks.mockRejectedValueOnce(new Error('boom'))
    renderTab()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load your team's members/i)
    expect(screen.queryByTestId('invite-links')).toBeNull()
  })

  it('renders an in-frame empty state when there are no members', async () => {
    getOrganizationMembers.mockResolvedValueOnce([])
    renderTab()
    await waitFor(() => expect(screen.getByText('No members yet')).toBeInTheDocument())
    expect(screen.getByText('0 members in your team')).toBeInTheDocument()
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

// ─── PULSE-59: the page somebody alone sees (option B1-invite) ───
describe('WorkspaceMembersTab, alone', () => {
  beforeEach(() => {
    mockTeamState = 'alone'
    getOrganizationMembers.mockReset().mockResolvedValue([members[0]])
  })

  it('shows a People panel with "Just you for now" and an Invite people button, then the invite links', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Just you for now')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByText('Invite people to share your sites, billing and assistant connections.')).toBeInTheDocument()
    expect(screen.getByTestId('invite-links')).toBeInTheDocument()
    // No roster of one, no member count, no masthead CTA.
    expect(screen.queryByText('You')).toBeNull()
    expect(screen.queryByText(/members? in your/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Invite member/i })).toBeNull()
    expect(screen.getByTestId('masthead-slot').childElementCount).toBe(0)
  })

  it('opens the existing create-invite action from the Invite people button once a link exists', async () => {
    getInviteLinks.mockResolvedValue([existingLink])
    renderTab()
    const invite = await screen.findByRole('button', { name: /Invite people/ })
    expect(screen.queryByTestId('invite-modal')).toBeNull()
    fireEvent.click(invite)
    expect(screen.getByTestId('invite-modal')).toBeInTheDocument()
  })

  it('never says team, workspace or organization', async () => {
    const { container } = renderTab()
    await waitFor(() => expect(screen.getByText('Just you for now')).toBeInTheDocument())
    expect(container.textContent).not.toMatch(/team|workspace|organi[sz]ation/i)
  })
})

describe('WorkspaceMembersTab, team', () => {
  it('keeps the roster and counts the team', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('3 members in your team')).toBeInTheDocument())
    expect(screen.queryByText('Just you for now')).toBeNull()
  })

  it('keeps the roster while the state is not known', async () => {
    mockTeamState = null
    renderTab()
    await waitFor(() => expect(screen.getByText('3 members in your team')).toBeInTheDocument())
  })
})

// ─── PULSE-59: "Name your team" at the first invite (option N1) ───

const nameDialog = () => screen.queryByRole('dialog', { name: 'Name your team' })

async function clickInvitePeople() {
  fireEvent.click(await screen.findByRole('button', { name: /Invite people/ }))
}

describe('WorkspaceMembersTab, "Name your team" at the first invite', () => {
  beforeEach(() => {
    mockTeamState = 'alone'
    getOrganizationMembers.mockReset().mockResolvedValue([members[0]])
  })

  it('alone with no invite link: Invite people asks for the team name first, pre-filled from the first name', async () => {
    renderTab()
    await clickInvitePeople()
    const dialog = nameDialog()
    expect(dialog).toBeInTheDocument()
    expect(screen.getByLabelText('Team name')).toHaveValue("Ada's team")
    expect(screen.getByText('Everyone you invite joins this team. You can rename it later.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    // The invite form waits for the name.
    expect(screen.queryByTestId('invite-modal')).toBeNull()
  })

  it('alone with an invite link already: no name step, the invite form opens directly', async () => {
    getInviteLinks.mockResolvedValue([existingLink])
    renderTab()
    await clickInvitePeople()
    expect(nameDialog()).toBeNull()
    expect(screen.getByTestId('invite-modal')).toBeInTheDocument()
  })

  it('in a team: no name step, even with no invite link', async () => {
    mockTeamState = 'team'
    getOrganizationMembers.mockReset().mockResolvedValue(members)
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: /Invite member/ }))
    expect(nameDialog()).toBeNull()
    expect(screen.getByTestId('invite-modal')).toBeInTheDocument()
  })

  it('while the state is not known: no name step (null renders the team layout)', async () => {
    mockTeamState = null
    getOrganizationMembers.mockReset().mockResolvedValue(members)
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: /Invite member/ }))
    expect(nameDialog()).toBeNull()
    expect(screen.getByTestId('invite-modal')).toBeInTheDocument()
  })

  it('Continue renames the team, keeping its slug, and only then opens the invite form', async () => {
    let finishRename!: () => void
    updateOrganization.mockReset().mockImplementationOnce(
      () => new Promise(resolve => { finishRename = () => resolve({ id: 'org1', name: 'Acme', slug: 'quiet-harbour' }) }),
    )
    renderTab()
    await clickInvitePeople()
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: '  Acme  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(updateOrganization).toHaveBeenCalledWith('org1', 'Acme', 'quiet-harbour'))
    expect(getOrganization).toHaveBeenCalledWith('org1')
    // Not before the rename has answered.
    expect(screen.queryByTestId('invite-modal')).toBeNull()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()

    finishRename()
    await waitFor(() => expect(screen.getByTestId('invite-modal')).toBeInTheDocument())
    expect(nameDialog()).toBeNull()
    expect(revalidateOrganizations).toHaveBeenCalled()
  })

  it('a failed rename shows the reason in the modal, stays open, and does not open the invite form', async () => {
    updateOrganization.mockReset().mockRejectedValueOnce(new Error('Name must be at least 2 characters'))
    renderTab()
    await clickInvitePeople()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Name must be at least 2 characters')
    expect(nameDialog()).toContainElement(alert)
    expect(screen.queryByTestId('invite-modal')).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  it('a rename failure with no server detail still says so in the house voice', async () => {
    getOrganization.mockReset().mockRejectedValueOnce(new Error(''))
    renderTab()
    await clickInvitePeople()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save the team name. Try again.")
    expect(updateOrganization).not.toHaveBeenCalled()
    expect(screen.queryByTestId('invite-modal')).toBeNull()
  })

  it('an empty name disables Continue', async () => {
    renderTab()
    await clickInvitePeople()
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    fireEvent.submit(screen.getByLabelText('Team name').closest('form')!)
    expect(getOrganization).not.toHaveBeenCalled()
    expect(updateOrganization).not.toHaveBeenCalled()
  })

  it('Cancel closes without renaming or inviting', async () => {
    renderTab()
    await clickInvitePeople()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(nameDialog()).toBeNull()
    expect(screen.queryByTestId('invite-modal')).toBeNull()
    expect(getOrganization).not.toHaveBeenCalled()
    expect(updateOrganization).not.toHaveBeenCalled()
  })

  it('pre-fills the current team name when no display name is known, never the email', async () => {
    mockUser = { id: 'u-you', org_id: 'org1', email: 'me@x.com' }
    renderTab()
    await clickInvitePeople()
    expect(screen.getByLabelText('Team name')).toHaveValue('Quiet Harbour')
    expect(screen.getByLabelText('Team name')).not.toHaveValue('me@x.com')
  })

  it('opens fresh each time: a Cancel then a second click starts from the suggestion again', async () => {
    renderTab()
    await clickInvitePeople()
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'Half typed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await clickInvitePeople()
    expect(screen.getByLabelText('Team name')).toHaveValue("Ada's team")
  })
})
