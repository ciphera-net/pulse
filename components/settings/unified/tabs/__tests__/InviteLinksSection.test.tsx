import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { InviteLink } from '@/lib/api/organization'
import type { Role } from '@/lib/api/roles'

// --- Mocks ---------------------------------------------------------------

vi.mock('@/lib/auth/permissions', () => ({ useIsAdminOrOwner: () => true }))

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  toast: { success: vi.fn(), error: vi.fn() },
  // `@/lib/utils` re-exports `cn` from facet — the panel primitives call it.
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <>{children}</>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({ ConfirmDialog: () => null }))

vi.mock('@/lib/api/organization', () => ({ revokeInviteLink: vi.fn() }))

import InviteLinksSection from '../InviteLinksSection'
import { toast } from '@ciphera-net/facet'

function sourceWithoutComments(path: string): string {
  const raw = readFileSync(path, 'utf8')
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const future = new Date(Date.now() + 86_400_000).toISOString()
const past = new Date(Date.now() - 86_400_000).toISOString()

const links: InviteLink[] = [
  { id: 'l-active', organization_id: 'o', name: 'Engineering invite', role: 'member', max_uses: null, use_count: 2, expires_at: future, created_by: 'u', created_at: past, url: 'https://x/join/abc' },
  { id: 'l-expired', organization_id: 'o', name: 'Old invite', role: 'member', max_uses: null, use_count: 0, expires_at: past, created_by: 'u', created_at: past, url: 'https://x/join/def' },
  { id: 'l-used', organization_id: 'o', name: 'Capped invite', role: 'member', max_uses: 5, use_count: 5, expires_at: future, created_by: 'u', created_at: past, url: 'https://x/join/ghi' },
]

const noop = () => {}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('InviteLinksSection', () => {
  it('renders one Invite links panel with a row per link', () => {
    render(<InviteLinksSection orgId="o" links={links} roles={[]} onRevoked={noop} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Invite links' })).toBeInTheDocument()
    expect(screen.getByText('Engineering invite')).toBeInTheDocument()
    expect(screen.getByText('Old invite')).toBeInTheDocument()
    expect(screen.getByText('Capped invite')).toBeInTheDocument()
    // Status chips distinguish live vs spent links.
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Expired')).toBeInTheDocument()
    expect(screen.getByText('Used')).toBeInTheDocument()
  })

  it('offers an always-visible Revoke only on live links (spent links get no actions)', () => {
    render(<InviteLinksSection orgId="o" links={links} roles={[]} onRevoked={noop} />)
    const revokes = screen.getAllByRole('button', { name: 'Revoke' })
    // Only the active link is actionable — expired/exhausted rows are inert.
    expect(revokes).toHaveLength(1)
    // B12: the action is not concealed behind a hover-only opacity reveal.
    expect(revokes[0].className).not.toMatch(/opacity-0/)
  })

  it('renders an in-frame empty state (not null) when there are no links', () => {
    render(<InviteLinksSection orgId="o" links={[]} roles={[]} onRevoked={noop} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Invite links' })).toBeInTheDocument()
    expect(screen.getByText('No invite links yet')).toBeInTheDocument()
  })

  it('resolves the role chip from link.role — metadata.role_id is never consulted', () => {
    const chipRoles = [
      { id: 'r-admin', slug: 'admin', name: 'Admin' } as Role,
      { id: 'r-member', slug: 'member', name: 'Member' } as Role,
      { id: 'r-analyst', slug: 'analyst', name: 'Analyst' } as Role,
    ]
    const chipLinks: InviteLink[] = [
      { id: 'l-adm', organization_id: 'o', name: 'Admin invite', role: 'admin', max_uses: null, use_count: 0, expires_at: future, created_by: 'u', created_at: past, url: 'https://x/join/adm' },
      // Legacy pre-trim link: role 'member' on the wire, a finer role in
      // metadata. The backend ignores metadata.role_id since the trim, so the
      // chip must say what the link GRANTS (Member) — a metadata-derived
      // label would assert a role the link does not grant.
      { id: 'l-leg', organization_id: 'o', name: 'Legacy analyst invite', role: 'member', metadata: { app: 'pulse', role_id: 'r-analyst' }, max_uses: null, use_count: 0, expires_at: future, created_by: 'u', created_at: past, url: 'https://x/join/leg' },
    ]
    render(<InviteLinksSection orgId="o" links={chipLinks} roles={chipRoles} onRevoked={noop} />)
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Member')).toBeInTheDocument()
    expect(screen.queryByText('Analyst')).not.toBeInTheDocument()
  })
})

describe('InviteLinksSection structure and copy (settings overhaul, 16-09-2026)', () => {
  it('gives Active, Expired and Used the same chip shape: every status dot carries a dot', () => {
    render(<InviteLinksSection orgId="o" links={links} roles={[]} onRevoked={noop} />)
    // Rule 5: "if Active has a dot, [its siblings] have a dot." StatusChip
    // renders its dot as the chip's one child element, so a dot-bearing chip
    // has exactly one element child and a dot-less chip has zero (mirrored by
    // the Owner-role-chip assertion in WorkspaceMembersTab's own suite).
    expect(screen.getByText('Active').children).toHaveLength(1)
    expect(screen.getByText('Expired').children).toHaveLength(1)
    expect(screen.getByText('Used').children).toHaveLength(1)
  })


  it('composes one shared PanelRow idiom: name, chips and actions share a row, not hand-rolled divs', () => {
    render(<InviteLinksSection orgId="o" links={links} roles={[]} onRevoked={noop} />)
    // PanelRow's root renders the house grid layout ("grid ..."). Finding it
    // from the link name and asserting the sibling chip is inside it proves
    // label/control share one PanelRow, not two independent flex divs.
    const row = screen.getByText('Engineering invite').closest('.grid')
    expect(row).not.toBeNull()
    expect(row).toHaveTextContent('Active')
    // roles=[] here, so the role chip falls back to the raw slug.
    expect(row).toHaveTextContent('member')
  })

  it('renders the use-count and expiry caption with tabular-nums, never mono, for column alignment', () => {
    render(<InviteLinksSection orgId="o" links={links} roles={[]} onRevoked={noop} />)
    const caption = screen.getByText(/expires/)
    expect(caption.className).toMatch(/tabular-nums/)
    expect(caption.className).not.toMatch(/font-mono/)
  })

  it('shows the copy-failure toast in the house error voice', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('denied'))
    Object.assign(navigator, { clipboard: { writeText } })
    render(<InviteLinksSection orgId="o" links={links} roles={[]} onRevoked={noop} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't copy the link. Try again."))
  })

  it('has no em or en dashes anywhere in its source', () => {
    const src = sourceWithoutComments(join(process.cwd(), 'components/settings/unified/tabs/InviteLinksSection.tsx'))
    expect(src).not.toMatch(/[—–]/)
  })
})

describe('InviteLinksSection row motion (round two, M5)', () => {
  it('wraps each invite-link row in a motion element so a link added to the list rises in instead of popping in unanimated', () => {
    const { rerender } = render(<InviteLinksSection orgId="o" links={links} roles={[]} onRevoked={noop} />)
    const newLink: InviteLink = {
      id: 'l-new',
      organization_id: 'o',
      name: 'Fresh invite',
      role: 'member',
      max_uses: null,
      use_count: 0,
      expires_at: future,
      created_by: 'u',
      created_at: past,
      url: 'https://x/join/new',
    }
    rerender(<InviteLinksSection orgId="o" links={[...links, newLink]} roles={[]} onRevoked={noop} />)

    const row = screen.getByTestId('invite-link-row-l-new')
    // A plain wrapper carries no inline style at all; a motion element commits
    // its animated opacity/transform as one, which is how a reviewer can tell
    // the row is really under AnimatePresence rather than merely decorated to
    // look like it.
    expect(row.getAttribute('style')).toMatch(/opacity/)
  })

  it('lets an invite-link row exit through AnimatePresence when it leaves the list, rather than vanishing on the spot', async () => {
    const { rerender } = render(<InviteLinksSection orgId="o" links={links} roles={[]} onRevoked={noop} />)
    expect(screen.getByTestId('invite-link-row-l-active')).toBeInTheDocument()

    rerender(<InviteLinksSection orgId="o" links={links.filter(l => l.id !== 'l-active')} roles={[]} onRevoked={noop} />)

    await waitFor(() => expect(screen.queryByTestId('invite-link-row-l-active')).toBeNull(), { timeout: 2000 })
    expect(screen.getByTestId('invite-link-row-l-expired')).toBeInTheDocument()
  })
})
