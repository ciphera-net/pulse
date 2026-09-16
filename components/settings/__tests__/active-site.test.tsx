import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ActiveSiteProvider, useActiveSite } from '../active-site'

// --- Mocks ---------------------------------------------------------------

const sites = [
  { id: 'site-first', name: 'CipheraID', domain: 'id.ciphera.net' },
  { id: 'site-ciphera', name: 'Ciphera', domain: 'ciphera.net' },
]

vi.mock('@/lib/swr/sites', () => ({
  useSites: () => ({ sites, isLoading: false, error: null, mutate: vi.fn() }),
}))

// The provider re-reads the selection on every route change (it now spans the
// whole dashboard, not one settings visit), so the pathname is an input.
let pathname = '/settings/site/general'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

/** Move the app to a new route: the URL the provider reads AND the pathname. */
function navigate(url: string) {
  pathname = url.split('?')[0]
  window.history.replaceState({}, '', url)
}

/** A forward navigation that leaves an entry behind, as a <Link> click does. */
function push(url: string) {
  pathname = url.split('?')[0]
  window.history.pushState({}, '', url)
}

/** The Back button, for real: jsdom keeps the session history, so the URL that
 *  comes back is whatever the app left on that entry — not one the test made up.
 *  ⚠️ The traversal is QUEUED, not synchronous, and one macrotask is not enough —
 *  wait for the URL to actually move, or the caller measures the page it was
 *  already on and passes for the wrong reason. */
async function back() {
  const from = window.location.href
  window.history.back()
  await waitFor(() => expect(window.location.href).not.toBe(from))
  pathname = window.location.pathname
}

function Probe() {
  const { activeSite, sites, setActiveSiteId } = useActiveSite()
  return (
    <div>
      <div data-testid="active">{activeSite?.id ?? 'none'}</div>
      {/* Stands in for SiteContextBand's switcher — the only caller there is. */}
      {sites.map((s) => (
        <button key={s.id} type="button" onClick={() => setActiveSiteId(s.id)}>
          switch to {s.name}
        </button>
      ))}
    </div>
  )
}

function renderProvider() {
  return render(
    <ActiveSiteProvider>
      <Probe />
    </ActiveSiteProvider>,
  )
}

beforeEach(() => {
  sessionStorage.clear()
  navigate('/settings/site/general')
})

describe('ActiveSiteProvider resolution', () => {
  it('falls back to the first site with no deep link and no stored selection', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-first'))
  })

  it('adopts a valid ?siteId= deep link over the stored selection', async () => {
    // Regression: opening Site Settings from the ciphera.net dashboard used to
    // land on whatever was stored (or the org's first site) because the
    // provider never read the deep link.
    sessionStorage.setItem('pulse_active_site', 'site-first')
    window.history.replaceState({}, '', '/settings/site/general?siteId=site-ciphera')
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-ciphera'))
    // …and persists it as the new selection.
    expect(sessionStorage.getItem('pulse_active_site')).toBe('site-ciphera')
  })

  it('restores the stored selection with no deep link', async () => {
    // Regression: the resolve effect used to run against the pre-hydration
    // null selection in the same batch as hydration, stomping the stored id
    // with the first site — settings always opened on the org's first site.
    sessionStorage.setItem('pulse_active_site', 'site-ciphera')
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-ciphera'))
  })

  it('falls back to the first site when the deep link id is unknown', async () => {
    navigate('/settings/site/general?siteId=deleted-site')
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-first'))
  })
})

describe('ActiveSiteProvider across a route change', () => {
  // 🔴 The provider outlives a single settings visit now — it is mounted for the
  // whole authenticated dashboard branch. A read that only ran at mount would
  // therefore never see a handover, and the two ways INTO site settings are both
  // handovers: a ?siteId= deep link from the site rail, and InstallBanner, which
  // writes sessionStorage and then navigates to a URL with no query at all.
  it('adopts a handover written to storage before the navigation', async () => {
    sessionStorage.setItem('pulse_active_site', 'site-first')
    const { rerender } = renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-first'))

    // The InstallBanner shape: storage first, then a query-less navigation.
    sessionStorage.setItem('pulse_active_site', 'site-ciphera')
    navigate('/settings/site/goals')
    rerender(
      <ActiveSiteProvider>
        <Probe />
      </ActiveSiteProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-ciphera'))
  })

  it('lets a ?siteId= on the new route outrank what storage holds', async () => {
    // The site rail's own entry: you are on a site page, storage still holds
    // whatever you configured last, and the link names the site you are viewing.
    sessionStorage.setItem('pulse_active_site', 'site-first')
    navigate('/sites/site-first')
    const { rerender } = renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-first'))

    navigate('/settings/site/general?siteId=site-ciphera')
    rerender(
      <ActiveSiteProvider>
        <Probe />
      </ActiveSiteProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-ciphera'))
    expect(sessionStorage.getItem('pulse_active_site')).toBe('site-ciphera')
  })
})

describe('ActiveSiteProvider and the address bar', () => {
  // 🔴 The pathname-keyed re-read makes a stale deep link dangerous: a ?siteId=
  // that the user has since switched away from is still sitting on that history
  // entry, and Back walks straight back onto it. So a switch erases the param it
  // supersedes, in place.
  it('erases the ?siteId= a switch supersedes', async () => {
    navigate('/settings/site/general?siteId=site-first')
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-first'))

    fireEvent.click(screen.getByRole('button', { name: /switch to Ciphera$/ }))
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-ciphera'))
    expect(window.location.search).toBe('')
  })

  // Asserted on its own, with no reference to the address bar: this is the
  // CONSEQUENCE, and it has to be able to fail by itself.
  it('survives a Back onto the entry the deep link arrived on', async () => {
    navigate('/settings/site/general?siteId=site-first')
    const { rerender } = renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-first'))

    fireEvent.click(screen.getByRole('button', { name: /switch to Ciphera$/ }))
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-ciphera'))

    // A tab click — a real second entry, so there is somewhere to go back TO.
    push('/settings/site/goals')
    rerender(
      <ActiveSiteProvider>
        <Probe />
      </ActiveSiteProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-ciphera'))

    await back()
    // The control: a Back that did not actually traverse would make everything
    // below it pass for the wrong reason.
    expect(window.location.pathname).toBe('/settings/site/general')
    rerender(
      <ActiveSiteProvider>
        <Probe />
      </ActiveSiteProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-ciphera'))
    expect(sessionStorage.getItem('pulse_active_site')).toBe('site-ciphera')
  })

  it('consumes the deep link at adoption, so an EARLIER entry cannot hand it back', async () => {
    // The more natural order: arrive with the deep link, move to another tab,
    // switch site THERE, then press Back onto the arrival entry. The arrival
    // entry must already have lost its param — a switch-time erase on the
    // current entry could never reach it.
    navigate('/settings/site/general?siteId=site-first')
    const { rerender } = renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-first'))
    expect(window.location.search).toBe('')

    push('/settings/site/goals')
    rerender(
      <ActiveSiteProvider>
        <Probe />
      </ActiveSiteProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-first'))
    fireEvent.click(screen.getByRole('button', { name: /switch to Ciphera$/ }))
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-ciphera'))

    await back()
    expect(window.location.pathname).toBe('/settings/site/general')
    expect(window.location.search).toBe('')
    rerender(
      <ActiveSiteProvider>
        <Probe />
      </ActiveSiteProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-ciphera'))
    expect(sessionStorage.getItem('pulse_active_site')).toBe('site-ciphera')
  })

  it('leaves the rest of the query alone', async () => {
    navigate('/settings/site/general?siteId=site-first&from=install')
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-first'))

    fireEvent.click(screen.getByRole('button', { name: /switch to Ciphera$/ }))
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-ciphera'))
    expect(window.location.search).toBe('?from=install')
  })
})
