import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { SWRConfig } from 'swr'

// ─── The Import tab exists only where imports exist (M11-b, PULSE-118) ─────
//
// GET …/data-imports/sources is mocked at the transport boundary (the one API
// module the hook calls), so these run the REAL useImportSources hook through
// SWR and the real rail, landing page and route: a 404 (imports off) hides every
// entry and a direct visit renders the standard not-found state; a 200 with a
// source this build can drive shows them; a 200 whose sources this build cannot
// drive (GA4 before M5) counts as none.

const h = vi.hoisted(() => ({
  pathname: '/settings/site/general',
  tab: 'import',
  sources: null as null | { status: number } | { sources: { source: string; kind: string; enabled: boolean }[] },
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/lib/api/dataImports', () => ({
  getImportSources: vi.fn(async () => {
    if (h.sources && 'status' in h.sources) throw Object.assign(new Error('Not found'), { status: h.sources.status })
    return h.sources
  }),
}))

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('next/navigation', () => ({
  usePathname: () => h.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ tab: h.tab }),
  useSearchParams: () => new URLSearchParams(),
  notFound: () => h.notFound(),
}))
vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="tab-content">tab</div>,
}))
vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))
vi.mock('@phosphor-icons/react', () => new Proxy({}, {
  get: (_target, prop) => (prop === 'then' ? undefined : () => null),
  has: () => true,
}))
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => 'team' }))
const site = { id: 's1', name: 'Acme', domain: 'acme.example', is_verified: true }
vi.mock('@/components/settings/active-site', () => ({
  useActiveSite: () => ({
    sites: [site],
    activeSite: site,
    activeSiteId: 's1',
    setActiveSiteId: vi.fn(),
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
  }),
}))
vi.mock('@/components/sites/SiteFavicon', () => ({ SiteFavicon: () => <span /> }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, asChild, ...props }: any) => (asChild ? children : <button {...props}>{children}</button>),
  Badge: ({ children }: any) => <span>{children}</span>,
  Switcher: ({ options, value, onChange }: any) => (
    <div role="radiogroup">
      {options.map((o: any) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
}))

import SettingsShell from '@/components/settings/SettingsShell'
import SettingsLandingPage from '@/app/settings/page'
import SiteSettingsTabPage from '@/app/settings/site/[tab]/page'

/** What Next's not-found boundary does with notFound()'s throw: render the not-found state. */
class NotFoundBoundary extends Component<{ children: ReactNode }, { notFound: boolean }> {
  state = { notFound: false }
  static getDerivedStateFromError(e: Error) {
    if (e.message === 'NEXT_NOT_FOUND') return { notFound: true }
    throw e
  }
  render() {
    return this.state.notFound ? <div data-testid="not-found">Page not found</div> : this.props.children
  }
}

function fresh(ui: React.ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>)
}

const PLAUSIBLE = { sources: [{ source: 'plausible', kind: 'upload_aggregate', enabled: true }] }
const GA4_ONLY = { sources: [{ source: 'ga4', kind: 'oauth', enabled: true }] }

beforeEach(() => {
  h.pathname = '/settings/site/general'
  h.tab = 'import'
  h.sources = null
  h.notFound.mockClear()
})

describe('the Import entry in the settings rail', () => {
  it('is absent while imports are off (404)', async () => {
    h.sources = { status: 404 }
    fresh(<SettingsShell><div>tab</div></SettingsShell>)
    await waitFor(() => expect(screen.getByText('Integrations')).toBeInTheDocument())
    // Give the 404 time to land, then check it never appeared.
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText('Import')).toBeNull()
  })

  it('appears once the server lists a source this build can drive', async () => {
    h.sources = PLAUSIBLE
    fresh(<SettingsShell><div>tab</div></SettingsShell>)
    expect(await screen.findByText('Import')).toBeInTheDocument()
    expect(screen.getByText('Bring history from another tool.')).toBeInTheDocument()
    expect(screen.getByText('Import').closest('a')).toHaveAttribute('href', '/settings/site/import')
  })

  it('stays absent when the only listed source is one this build cannot drive yet', async () => {
    h.sources = GA4_ONLY
    fresh(<SettingsShell><div>tab</div></SettingsShell>)
    await waitFor(() => expect(screen.getByText('Integrations')).toBeInTheDocument())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText('Import')).toBeNull()
  })

  it('stays absent while the answer is still loading, and when the request fails', async () => {
    h.sources = { status: 500 }
    fresh(<SettingsShell><div>tab</div></SettingsShell>)
    expect(screen.queryByText('Import')).toBeNull()
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText('Import')).toBeNull()
  })
})

describe('the Import link on the settings landing page', () => {
  it('is absent while imports are off (404)', async () => {
    h.sources = { status: 404 }
    fresh(<SettingsLandingPage />)
    await waitFor(() => expect(screen.getByText('Integrations')).toBeInTheDocument())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText('Import')).toBeNull()
  })

  it('appears with the site links when a source is listed', async () => {
    h.sources = PLAUSIBLE
    fresh(<SettingsLandingPage />)
    const link = await screen.findByText('Import')
    expect(link.closest('a')).toHaveAttribute('href', '/settings/site/import')
  })
})

describe('a direct visit to /settings/site/import', () => {
  it('renders the standard not-found state while imports are off (404)', async () => {
    h.sources = { status: 404 }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fresh(
      <NotFoundBoundary>
        <SiteSettingsTabPage />
      </NotFoundBoundary>,
    )
    expect(await screen.findByTestId('not-found')).toBeInTheDocument()
    expect(h.notFound).toHaveBeenCalled()
    expect(screen.queryByTestId('tab-content')).toBeNull()
    spy.mockRestore()
  })

  it('renders the tab for every member, with no Access restricted gate, when a source is listed', async () => {
    h.sources = PLAUSIBLE
    fresh(<SiteSettingsTabPage />)
    expect(await screen.findByTestId('tab-content')).toBeInTheDocument()
    expect(screen.queryByText('Access restricted')).toBeNull()
    expect(h.notFound).not.toHaveBeenCalled()
  })

  it('says a failed check as a failure with a retry, never as not found', async () => {
    h.sources = { status: 500 }
    fresh(<SiteSettingsTabPage />)
    expect(await screen.findByText(/couldn't check whether this site can import history/i, {}, { timeout: 15_000 })).toBeInTheDocument()
    expect(h.notFound).not.toHaveBeenCalled()
  })
})
