// The sites layout no longer mounts the dashboard shell (settings tail, item
// 10, 17-09-2026): app/layout-content.tsx mounts ONE shell for every dashboard
// route, site pages included, so a site page → settings navigation keeps the
// same shell (and the same sidebar nav, whose highlight then glides instead of
// reappearing). This wrapper keeps only what was ever its own: remembering the
// site for the entry redirect and the active-site selection.
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

import SiteLayoutShell from '../SiteLayoutShell'

beforeEach(() => {
  shell.mockClear()
  rememberLastSite.mockClear()
  markSessionEntered.mockClear()
  sessionStorage.clear()
})

describe('SiteLayoutShell', () => {
  it('renders its children without mounting a second dashboard shell', () => {
    render(
      <SiteLayoutShell siteId="s1">
        <p>page</p>
      </SiteLayoutShell>,
    )
    expect(screen.getByText('page')).toBeInTheDocument()
    // Red before the change: the wrapper rendered <DashboardShell siteId={siteId}>.
    expect(shell).not.toHaveBeenCalled()
    expect(screen.queryByTestId('shell')).toBeNull()
  })

  it('still records the site for the entry redirect and the active-site selection', () => {
    render(
      <SiteLayoutShell siteId="s1">
        <p>page</p>
      </SiteLayoutShell>,
    )
    expect(sessionStorage.getItem('pulse_active_site')).toBe('s1')
    expect(rememberLastSite).toHaveBeenCalledWith('s1')
    expect(markSessionEntered).toHaveBeenCalledTimes(1)
  })
})
