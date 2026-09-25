import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { UserMenu } from '@ciphera-net/facet'

// PULSE-59, options A2 (alone) and AT (team): the user menu's container half
// comes from the ONE team-state signal. Rendered through Facet's real
// UserMenu, so what is pinned is what a person sees when they open it.

const h = vi.hoisted(() => ({
  teamState: 'team' as 'alone' | 'team' | null,
  push: vi.fn(),
  switchOrganization: vi.fn(),
  createOrganization: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => h.teamState }))
vi.mock('@/lib/hooks/useOrgSwitcher', () => ({
  useOrgSwitcher: () => ({
    orgs: [
      { organization_id: 'org_a', organization_name: 'Acme', user_id: 'u1', role: 'owner', joined_at: '' },
      { organization_id: 'org_b', organization_name: 'Example Co', user_id: 'u1', role: 'member', joined_at: '' },
    ],
    activeOrgId: 'org_a',
    switchOrganization: h.switchOrganization,
    createOrganization: h.createOrganization,
  }),
}))

import { useUserMenuTeamProps, INVITE_PEOPLE_HREF } from '@/components/dashboard/userMenuTeam'

const Link = ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>
const auth = { user: { id: 'u1', email: 'me@example.com' } as any, loading: false, logout: vi.fn() }

function Menu() {
  const props = useUserMenuTeamProps()
  return <UserMenu auth={auth} LinkComponent={Link} allowPersonalOrganization={false} {...props} />
}

function open() {
  render(<Menu />)
  fireEvent.click(screen.getAllByRole('button')[0])
}

beforeEach(() => {
  h.push.mockReset()
  h.teamState = 'team'
})

describe('user menu, alone (A2)', () => {
  beforeEach(() => { h.teamState = 'alone' })

  it('shows no switcher and no team settings, and one Invite people row to the invite page', () => {
    open()
    expect(screen.queryByText('Teams')).toBeNull()
    expect(screen.queryByText('Organizations')).toBeNull()
    expect(screen.queryByText('Acme')).toBeNull()
    expect(screen.queryByText(/Create (team|Organization)/)).toBeNull()
    expect(screen.queryByText(/(Team|Organization) [Ss]ettings/)).toBeNull()
    const invite = screen.getByRole('link', { name: 'Invite people' })
    expect(invite).toHaveAttribute('href', INVITE_PEOPLE_HREF)
    expect(INVITE_PEOPLE_HREF).toBe('/settings/organization/members')
  })

  it('draws the row like the switcher\'s create row: dashed box, muted text, orange hover', () => {
    open()
    const invite = screen.getByRole('link', { name: 'Invite people' })
    expect(invite.className).toMatch(/\btext-muted-foreground\b/)
    expect(invite.className).toMatch(/hover:text-brand-orange/)
    expect(invite.className).toMatch(/hover:bg-brand-orange\/10/)
    expect(invite.querySelector('.border-dashed')).not.toBeNull()
  })

  it('never says team, workspace or organization anywhere in the open menu', () => {
    open()
    const panel = screen.getByRole('link', { name: 'Invite people' }).closest('.fixed') as HTMLElement
    expect(panel).not.toBeNull()
    expect(within(panel).queryByText(/team|workspace|organi[sz]ation/i)).toBeNull()
  })
})

describe('user menu, team (AT)', () => {
  it('lists the teams under "Teams", offers "Create team" and "Team settings"', () => {
    open()
    expect(screen.getByText('Teams')).toBeInTheDocument()
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('Example Co')).toBeInTheDocument()
    expect(screen.getByText('Create team')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Invite people' })).toBeNull()
    fireEvent.click(screen.getByText('Team settings'))
    expect(h.push).toHaveBeenCalledWith('/settings/organization/general')
  })

  it('renders the team menu while the state is not known: a failure never hides the switcher', () => {
    h.teamState = null
    open()
    expect(screen.getByText('Teams')).toBeInTheDocument()
    expect(screen.getByText('Example Co')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Invite people' })).toBeNull()
  })
})
