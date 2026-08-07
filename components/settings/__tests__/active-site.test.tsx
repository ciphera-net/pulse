import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ActiveSiteProvider, useActiveSite } from '../active-site'

// --- Mocks ---------------------------------------------------------------

const sites = [
  { id: 'site-first', name: 'CipheraID', domain: 'id.ciphera.net' },
  { id: 'site-ciphera', name: 'Ciphera', domain: 'ciphera.net' },
]

vi.mock('@/lib/swr/sites', () => ({
  useSites: () => ({ sites, isLoading: false, error: null, mutate: vi.fn() }),
}))

function Probe() {
  const { activeSite } = useActiveSite()
  return <div data-testid="active">{activeSite?.id ?? 'none'}</div>
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
  window.history.replaceState({}, '', '/settings/site/general')
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
    window.history.replaceState({}, '', '/settings/site/general?siteId=deleted-site')
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('site-first'))
  })
})
