import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { InviteLink } from '@/lib/api/organization'

// --- Mocks ---------------------------------------------------------------

vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))

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
  it('renders one Invite Links panel with a row per link', () => {
    render(<InviteLinksSection orgId="o" links={links} roles={[]} onRevoked={noop} />)
    expect(screen.getByText('Invite Links')).toBeInTheDocument()
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
    expect(screen.getByText('Invite Links')).toBeInTheDocument()
    expect(screen.getByText('No invite links yet')).toBeInTheDocument()
  })
})
