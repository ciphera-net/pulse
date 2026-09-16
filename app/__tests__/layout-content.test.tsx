// Which site the dashboard chrome is rendering for.
//
// The shell was mounted as `<DashboardShell siteId={null}>` for EVERY path under
// /settings, so the outer sidebar dropped into home mode the moment you opened
// Site Settings — the whole site rail replaced by Your Sites / Add New Site,
// which reads as being thrown out of the site you were configuring. The URLs did
// not change; the chrome learned to read the active site.
//
// The provider has to sit ABOVE the shell for that to be possible, which is the
// other half of what this file pins: it is mounted once for the whole dashboard
// branch, so a site chosen in one place survives the navigation to another.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

let pathname = '/sites'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock('framer-motion', () => ({
  MotionConfig: ({ children }: any) => <>{children}</>,
}))

// The chrome's neighbours are not under test; the shell is.
vi.mock('@/components/VersionToast', () => ({ default: () => null }))
vi.mock('@/components/OfflineBanner', () => ({ OfflineBanner: () => null }))
vi.mock('@/components/Footer', () => ({ Footer: () => null }))
vi.mock('@/components/marketing/Header', () => ({ Header: () => null }))
vi.mock('@/components/auth/SessionTakeover', () => ({ default: () => <div>takeover</div> }))
vi.mock('@/lib/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }))
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'someone@example.com' }, loading: false, recovering: false }),
}))

const sites = [
  { id: 's1', name: 'First', domain: 'first.example' },
  { id: 's2', name: 'Second', domain: 'second.example' },
]
vi.mock('@/lib/swr/sites', () => ({
  useSites: () => ({ sites, isLoading: false, error: undefined, mutate: vi.fn() }),
}))

// The spy: every siteId the shell is handed, in order.
const seen: Array<string | null> = []
vi.mock('@/components/dashboard/DashboardShell', () => ({
  default: ({ siteId, children }: any) => {
    seen.push(siteId ?? null)
    return <div data-testid="shell">{children}</div>
  },
}))

import LayoutContent from '../layout-content'
import { useActiveSite } from '@/components/settings/active-site'

/** Renders the provider's own resolved id, so a test can wait for hydration
 *  instead of asserting `null` against a frame that simply has not run yet. */
function Probe() {
  const { activeSiteId } = useActiveSite()
  return <span data-testid="probe">{activeSiteId ?? 'none'}</span>
}

async function renderAt(path: string, search = '') {
  pathname = path
  window.history.replaceState({}, '', path + search)
  render(
    <LayoutContent>
      <Probe />
    </LayoutContent>,
  )
  // The provider hydrates in an effect; wait for it to have settled on a real
  // site before reading what the shell was given.
  await waitFor(() => expect(screen.getByTestId('probe')).not.toHaveTextContent('none'))
  return seen[seen.length - 1]
}

beforeEach(() => {
  seen.length = 0
  sessionStorage.clear()
})

describe('the dashboard chrome siteId', () => {
  it('is the active site on a site-settings tab', async () => {
    sessionStorage.setItem('pulse_active_site', 's1')
    expect(await renderAt('/settings/site/general')).toBe('s1')
  })

  it('follows a ?siteId= deep link over the stored selection', async () => {
    // The site rail's Settings entry carries the site you were looking at.
    sessionStorage.setItem('pulse_active_site', 's1')
    expect(await renderAt('/settings/site/general', '?siteId=s2')).toBe('s2')
  })

  it('is null on organization settings — those are not site-scoped', async () => {
    sessionStorage.setItem('pulse_active_site', 's1')
    expect(await renderAt('/settings/organization/general')).toBe(null)
  })

  it('is null on account settings', async () => {
    sessionStorage.setItem('pulse_active_site', 's1')
    expect(await renderAt('/settings/account/profile')).toBe(null)
  })

  it('is null on the sites home', async () => {
    sessionStorage.setItem('pulse_active_site', 's1')
    expect(await renderAt('/sites')).toBe(null)
  })
})
