import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'

// ─── The Import tab exists only where imports exist (M11-b, PULSE-118) ─────
//
// GET …/data-imports/sources is mocked at the transport boundary (the one API
// module the hook calls), so these run the REAL useImportSources hook through
// SWR and the real rail and route: a 404 (imports off) makes a direct visit
// render the standard not-found state; a 200 with a source this build can drive
// renders the tab; a 200 whose sources this build cannot drive (a kind with no
// flow here) counts as none. Since the settings overhaul the rail has no Import
// row: Import is part of the Data page.

const h = vi.hoisted(() => ({
  pathname: '/settings/site/general',
  tab: 'import',
  sources: null as null | { status: number } | { sources: { source: string; kind: string; enabled: boolean }[] },
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  replace: vi.fn(),
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
  useRouter: () => ({ push: vi.fn(), replace: h.replace }),
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
  useActiveSiteIdIfAny: () => 's1',
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
import SiteSettingsTabPage from '@/app/settings/site/[tab]/page'

function fresh(ui: React.ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>)
}

const PLAUSIBLE = { sources: [{ source: 'plausible', kind: 'upload_aggregate', enabled: true }] }
const GA4_ONLY = { sources: [{ source: 'ga4', kind: 'oauth', enabled: true }] }
// A kind this build has no flow for (a tool on a sign-in this build cannot drive).
const UNDRIVABLE_ONLY = { sources: [{ source: 'matomo', kind: 'oauth', enabled: true }] }

beforeEach(() => {
  h.pathname = '/settings/site/general'
  h.tab = 'import'
  h.sources = null
  h.notFound.mockClear()
})

// Settings overhaul (R1–R4): Import is part of the Data page, so the rail lists Data whatever the server answers, and
// never a row of Import's own. Its route renders as before (below) until Data takes it in.
describe('Import in the one list of pages', () => {
  it('lists no Import row, with or without a source, and lists Data', async () => {
    for (const answer of [PLAUSIBLE, { status: 404 }]) {
      h.sources = answer
      const { unmount } = fresh(<SettingsShell><div>tab</div></SettingsShell>)
      expect(await screen.findByText('Data')).toBeInTheDocument()
      await new Promise((r) => setTimeout(r, 20))
      expect(screen.queryByText('Import')).toBeNull()
      unmount()
    }
  })

  it('marks Data as the current page on the import route', async () => {
    h.pathname = '/settings/site/import'
    h.sources = PLAUSIBLE
    fresh(<SettingsShell><div>tab</div></SettingsShell>)
    const data = await screen.findByRole('link', { name: 'Data' })
    expect(data).toHaveAttribute('aria-current', 'page')
    expect(data).toHaveAttribute('href', '/settings/site/integrations')
  })
})

describe('a direct visit to /settings/site/import', () => {
  // Import is part of Data since the settings overhaul: the old address lands on Data with its query (a Google
  // Analytics callback code rides on it), and Data decides whether imports exist (useImportSources).
  it('lands on Data, never rendering a page of its own', async () => {
    h.sources = PLAUSIBLE
    h.replace.mockClear()
    fresh(<SiteSettingsTabPage />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/settings/site/integrations'))
    expect(screen.queryByTestId('tab-content')).toBeNull()
    expect(h.notFound).not.toHaveBeenCalled()
  })
})
