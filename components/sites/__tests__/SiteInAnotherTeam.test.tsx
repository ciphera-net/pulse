import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// PULSE-87: what every /sites/<id>/* page shows for a site in another of the
// reader's teams. Owner pick C (26-09-2026): name the team and switch in one click
// when the server says the reader is a member of it; otherwise the fallback (B).
// The copy is the owner-approved wording from the options round, verbatim.

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock('@phosphor-icons/react', () => ({ Globe: () => <svg data-testid="globe" /> }))
const toastError = vi.fn()
vi.mock('@ciphera-net/facet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ciphera-net/facet')>()),
  toast: { error: (m: string) => toastError(m) },
}))
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }))

const refresh = vi.fn(async () => {})
let orgId: string | null = 'A'
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: orgId ? { id: 'u1', org_id: orgId } : null, refresh }) }))

let orgs: { organization_id: string; organization_name?: string }[] | null = null
let orgsError: unknown = undefined
// `afterRefresh` is what the list holds once re-read (null: unchanged).
let afterRefresh: typeof orgs = null
const refreshOrgs = vi.fn(async () => { if (afterRefresh) orgs = afterRefresh; return orgs })
vi.mock('@/lib/swr/organizations', () => ({
  useUserOrganizations: () => ({ organizations: orgs, error: orgsError, mutate: refreshOrgs }),
}))

let team: { data?: { organization_id: string }; error?: unknown } = {}
const teamAsked = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useSiteTeam: (id: string, enabled: boolean) => { teamAsked(id, enabled); return team },
}))

const switchSession = vi.fn<(id: string, refresh: unknown) => Promise<void>>(async () => {})
vi.mock('@/lib/auth/switchOrganization', () => ({
  switchOrganizationSession: (id: string, r: unknown) => switchSession(id, r),
}))

import { SiteInAnotherTeam } from '../SiteInAnotherTeam'

const TEAMS = [
  { organization_id: 'A', organization_name: 'Ciphera' },
  { organization_id: 'B', organization_name: 'Marketing' },
]

beforeEach(() => {
  orgId = 'A'
  orgs = TEAMS
  orgsError = undefined
  team = {}
  afterRefresh = null
  refreshOrgs.mockClear()
  teamAsked.mockClear()
  switchSession.mockReset()
  switchSession.mockImplementation(async () => {})
  toastError.mockClear()
  refresh.mockClear()
})

const forbidden = { error: Object.assign(new Error('Access denied'), { status: 403 }) }

describe('a site in another of your teams', () => {
  it('asks the server which team, for this site', () => {
    render(<SiteInAnotherTeam siteId="s1" />)
    expect(teamAsked).toHaveBeenCalledWith('s1', true)
  })

  it('states nothing until the lookup has answered, so the fallback never flashes first', () => {
    const { container } = render(<SiteInAnotherTeam siteId="s1" />)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(container.textContent).toBe('')
  })

  it('names the team and switches in one click for a member (C)', async () => {
    team = { data: { organization_id: 'B' } }
    render(<SiteInAnotherTeam siteId="s1" />)
    expect(screen.getByRole('heading', { name: 'This site is in Marketing' })).toBeInTheDocument()
    expect(screen.getByText("You're signed in to Ciphera. Switch teams to open it — you'll come straight back to this page.")).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Switch to Marketing' })
    fireEvent.click(button)
    await waitFor(() => expect(switchSession).toHaveBeenCalledTimes(1))
    // The switch stays on this page: the SAME session switch the MCP consent page
    // uses, with the app's refresh — no navigation of its own.
    expect(switchSession).toHaveBeenCalledWith('B', refresh)
  })

  it('does not start a second switch while one is running', async () => {
    team = { data: { organization_id: 'B' } }
    let finish!: () => void
    switchSession.mockImplementation(() => new Promise<void>((r) => { finish = r }))
    render(<SiteInAnotherTeam siteId="s1" />)
    const button = screen.getByRole('button', { name: 'Switch to Marketing' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(switchSession).toHaveBeenCalledTimes(1))
    finish()
  })

  it('says so when the switch fails, and lets the reader try again', async () => {
    team = { data: { organization_id: 'B' } }
    switchSession.mockImplementationOnce(async () => { throw new Error('boom') })
    render(<SiteInAnotherTeam siteId="s1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Marketing' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't switch teams. Try again, or switch under Teams in the account menu."))
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Marketing' }))
    await waitFor(() => expect(switchSession).toHaveBeenCalledTimes(2))
  })

  it('falls back to B when the server does not name the team (not a member)', () => {
    team = forbidden
    render(<SiteInAnotherTeam siteId="s1" />)
    expect(screen.getByRole('heading', { name: 'This site is in another team' })).toBeInTheDocument()
    expect(screen.getByText("You're signed in to Ciphera. If you're a member of the site's team, switch to it under Teams in the account menu.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to your sites' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('falls back to B when the team is not one the reader knows by name, even after re-reading the list', async () => {
    team = { data: { organization_id: 'Z' } }
    render(<SiteInAnotherTeam siteId="s1" />)
    expect(await screen.findByRole('heading', { name: 'This site is in another team' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(refreshOrgs).toHaveBeenCalledTimes(1)
  })

  it('falls back to B when the named team is the one already signed in to', () => {
    team = { data: { organization_id: 'A' } }
    render(<SiteInAnotherTeam siteId="s1" />)
    expect(screen.getByRole('heading', { name: 'This site is in another team' })).toBeInTheDocument()
  })

  it('drops "You\'re signed in to …" when the current team has no known name', () => {
    team = forbidden
    orgs = null
    orgsError = new Error('organizations failed')
    render(<SiteInAnotherTeam siteId="s1" />)
    expect(screen.getByText("If you're a member of the site's team, switch to it under Teams in the account menu.")).toBeInTheDocument()
    expect(screen.queryByText(/signed in to/)).toBeNull()
  })
})

// Review 26-09-2026: the server can confirm membership of a team this browser's cached
// list does not hold yet (an invite accepted elsewhere). The list is re-read ONCE before
// the fallback is allowed to send a member to the account menu.
//
// MUTATION CHECK: drop the recheck effect and the first case shows B.
describe('a confirmed team the cached list does not hold yet', () => {
  it('re-reads the list once, then offers the switch', async () => {
    team = { data: { organization_id: 'C' } }
    afterRefresh = [...TEAMS, { organization_id: 'C', organization_name: 'Studio' }]
    const { container } = render(<SiteInAnotherTeam siteId="s1" />)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(await screen.findByRole('heading', { name: 'This site is in Studio' })).toBeInTheDocument()
    expect(refreshOrgs).toHaveBeenCalledTimes(1)
  })

  it('settles for B when the re-read list still does not hold it', async () => {
    team = { data: { organization_id: 'C' } }
    render(<SiteInAnotherTeam siteId="s1" />)
    expect(await screen.findByRole('heading', { name: 'This site is in another team' })).toBeInTheDocument()
    expect(refreshOrgs).toHaveBeenCalledTimes(1)
  })

  it('does not re-read for a team the list already holds', () => {
    team = { data: { organization_id: 'B' } }
    render(<SiteInAnotherTeam siteId="s1" />)
    expect(screen.getByRole('heading', { name: 'This site is in Marketing' })).toBeInTheDocument()
    expect(refreshOrgs).not.toHaveBeenCalled()
  })
})
