import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { OrganizationMember } from '@/lib/api/organization'
import { MastheadSlotProvider } from '@/components/settings/shell-slots'

// --- Mocks ---------------------------------------------------------------

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCanManage,
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

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  toast: { success: vi.fn(), error: vi.fn() },
  // `@/lib/utils` re-exports `cn` from facet — the panel primitives call it.
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
}))

import WorkspaceMembersTab from '../WorkspaceMembersTab'

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
    await waitFor(() =>
      expect(screen.getByText(/couldn't load your organization members/i)).toBeInTheDocument(),
    )
    // Error is not silently rendered as an empty roster, and the CTA is absent.
    expect(screen.queryByText(/in your organization$/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Invite member/i })).toBeNull()
  })

  it('renders an in-frame empty state when there are no members', async () => {
    getOrganizationMembers.mockResolvedValueOnce([])
    renderTab()
    await waitFor(() => expect(screen.getByText('No members yet')).toBeInTheDocument())
    expect(screen.getByText('0 members in your organization')).toBeInTheDocument()
  })
})
