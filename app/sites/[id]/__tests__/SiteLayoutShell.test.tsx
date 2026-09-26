// The sites layout no longer mounts the dashboard shell (settings tail, item
// 10, 17-09-2026): app/layout-content.tsx mounts ONE shell for every dashboard
// route, site pages included, so a site page → settings navigation keeps the
// same shell (and the same sidebar nav, whose highlight then glides instead of
// reappearing). This wrapper keeps what was ever its own: remembering the site
// for the entry redirect and the active-site selection — and, since PULSE-87,
// recognising a site from another of the reader's teams for EVERY site page.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const shell = vi.fn(({ children }: any) => <div data-testid="shell">{children}</div>)
vi.mock('@/components/dashboard/DashboardShell', () => ({ default: (p: any) => shell(p) }))

const rememberLastSite = vi.fn()
const markSessionEntered = vi.fn()
vi.mock('@/lib/last-site', () => ({
  rememberLastSite: (id: string) => rememberLastSite(id),
  markSessionEntered: () => markSessionEntered(),
}))

let site: { data?: unknown; error?: unknown } = {}
const siteAsked = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({ useSite: (id: string) => { siteAsked(id); return site } }))
vi.mock('@/components/sites/SiteInAnotherTeam', () => ({
  SiteInAnotherTeam: ({ siteId }: { siteId: string }) => <p data-testid="other-team">{siteId}</p>,
}))

import SiteLayoutShell from '../SiteLayoutShell'

const withStatus = (status: number) => ({ error: Object.assign(new Error(`HTTP ${status}`), { status }) })

beforeEach(() => {
  shell.mockClear()
  rememberLastSite.mockClear()
  markSessionEntered.mockClear()
  siteAsked.mockClear()
  sessionStorage.clear()
  site = {}
})

function renderShell() {
  return render(
    <SiteLayoutShell siteId="s1">
      <p>page</p>
    </SiteLayoutShell>,
  )
}

describe('SiteLayoutShell', () => {
  it('renders its children without mounting a second dashboard shell', () => {
    renderShell()
    expect(screen.getByText('page')).toBeInTheDocument()
    // Red before the change: the wrapper rendered <DashboardShell siteId={siteId}>.
    expect(shell).not.toHaveBeenCalled()
    expect(screen.queryByTestId('shell')).toBeNull()
  })

  it('still records the site for the entry redirect and the active-site selection', () => {
    renderShell()
    expect(sessionStorage.getItem('pulse_active_site')).toBe('s1')
    expect(rememberLastSite).toHaveBeenCalledWith('s1')
    expect(markSessionEntered).toHaveBeenCalledTimes(1)
  })
})

// PULSE-87. MUTATION CHECK: drop the 403 branch and the first case renders the page
// (which then fails in its own way); widen it to any error and the 404/500 cases
// lose the page's own statement of the failure.
describe('a site from another of your teams', () => {
  it('shows the other-team state INSTEAD of the page on a 403', () => {
    site = withStatus(403)
    renderShell()
    expect(siteAsked).toHaveBeenCalledWith('s1')
    expect(screen.getByTestId('other-team')).toHaveTextContent('s1')
    expect(screen.queryByText('page')).toBeNull()
  })

  it.each([
    ['a missing site (404)', withStatus(404)],
    ['a server error (500)', withStatus(500)],
    ['a request still loading', {}],
    ['a site that loaded', { data: { id: 's1', name: 'Example' } }],
  ])('leaves %s to the page, which states it', (_label, state) => {
    site = state
    renderShell()
    expect(screen.getByText('page')).toBeInTheDocument()
    expect(screen.queryByTestId('other-team')).toBeNull()
  })

  it('does not intercept a 403 once the site has data (a stale error beside fresh data)', () => {
    site = { data: { id: 's1', name: 'Example' }, ...withStatus(403) }
    renderShell()
    expect(screen.getByText('page')).toBeInTheDocument()
  })
})
