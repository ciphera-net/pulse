import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

// Every render gets its OWN SWR cache (a fresh Map provider): the module-level
// default cache would otherwise carry a site list or a deleted list from one
// test's final state into the next test's initial render, serving stale data
// instead of calling the (per-test) mocked fetcher.
function withFreshCache(children: ReactNode) {
  return <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
}

// --- Mocks ---------------------------------------------------------------

const push = vi.fn()
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
}))

vi.mock('@/lib/last-site', () => ({
  getLastSiteId: () => null,
  markSessionEntered: () => true,
  entryRedirectTarget: () => null,
}))

const listSites = vi.fn()
const listDeletedSites = vi.fn()
const restoreSite = vi.fn().mockResolvedValue(undefined)
const deleteSite = vi.fn().mockResolvedValue(undefined)
const permanentDeleteSite = vi.fn().mockResolvedValue(undefined)
// Real lib/swr/sites.tsx and lib/hold/pending.ts run underneath (PUL-28): only
// the API layer is stubbed, so pending-key hiding and the SWR revalidation
// this page's own change relies on are genuinely exercised.
vi.mock('@/lib/api/sites', () => ({
  listSites: (...a: unknown[]) => listSites(...a),
  getSitesOverview: vi.fn().mockResolvedValue([]),
  listDeletedSites: (...a: unknown[]) => listDeletedSites(...a),
  restoreSite: (...a: unknown[]) => restoreSite(...a),
  deleteSite: (...a: unknown[]) => deleteSite(...a),
  permanentDeleteSite: (...a: unknown[]) => permanentDeleteSite(...a),
}))

vi.mock('@/lib/api/billing', () => ({
  getSubscription: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/components/sites/FleetDeck', () => ({
  default: ({ sites }: { sites: Array<{ id: string }> }) => (
    <div data-testid="fleet-deck">{sites.map((s) => s.id).join(',')}</div>
  ),
}))
vi.mock('@/components/sites/FleetHeader', () => ({
  default: () => <div data-testid="fleet-header" />,
}))

vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))
vi.mock('@/lib/plans', () => ({ getSitesLimitForPlan: () => null }))
vi.mock('@/components/skeletons', () => ({
  SitesListSkeleton: () => <div data-testid="skeleton" />,
  useMinimumLoading: (loading: boolean) => loading,
  useSkeletonFade: () => '',
}))

// The hold dialog and the Undo window are facet-hold's own suite (PUL-28).
vi.mock('@ciphera-net/facet-hold', async () =>
  (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat().filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  AlertTriangleIcon: () => <svg aria-hidden="true" />,
  Badge: ({ children }: any) => <span>{children}</span>,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: (e: Error) => e?.message ?? '',
}))

import HomeDashboard from '../HomeDashboard'
import { toast } from '@ciphera-net/facet'
import { resetDeferred, commitLast, undoLast } from '@/lib/hold/__tests__/facetHoldStandIn'

const activeSite = { id: 's1', name: 'Acme', domain: 'acme.com' }
const scheduled = { id: 's2', name: 'Old Co', domain: 'old.co', deleted_at: '2026-10-07T00:00:00Z' }

beforeEach(() => {
  push.mockClear()
  replace.mockClear()
  listSites.mockReset().mockResolvedValue([activeSite])
  listDeletedSites.mockReset().mockResolvedValue([scheduled])
  restoreSite.mockClear().mockResolvedValue(undefined)
  deleteSite.mockClear().mockResolvedValue(undefined)
  permanentDeleteSite.mockClear().mockResolvedValue(undefined)
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  resetDeferred()
})

describe('HomeDashboard, Scheduled for deletion (PUL-28)', () => {
  it('lists a site pending deletion and opens the permanent-only hold dialog from Delete Now', async () => {
    render(withFreshCache(<HomeDashboard />))
    await screen.findByText('Old Co')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Now' }))
    expect(screen.getByRole('dialog', { name: 'Delete Old Co forever?' })).toBeInTheDocument()
    // permanentOnly: no secondary toggle to the soft variant.
    expect(screen.queryByRole('button', { name: 'Delete permanently now instead' })).toBeNull()
  })

  it('confirming Delete Now hides the row at once and sends nothing until the window runs out', async () => {
    render(withFreshCache(<HomeDashboard />))
    await screen.findByText('Old Co')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete forever' }))

    await waitFor(() => expect(screen.queryByText('Old Co')).toBeNull())
    expect(permanentDeleteSite).not.toHaveBeenCalled()

    await commitLast()
    expect(permanentDeleteSite).toHaveBeenCalledWith('s2', { keepalive: false })
  })

  it('commitLast({ keepalive: true }) passes keepalive through', async () => {
    render(withFreshCache(<HomeDashboard />))
    await screen.findByText('Old Co')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete forever' }))
    await commitLast({ keepalive: true })
    expect(permanentDeleteSite).toHaveBeenCalledWith('s2', { keepalive: true })
  })

  it('Undo restores the row and sends nothing', async () => {
    render(withFreshCache(<HomeDashboard />))
    await screen.findByText('Old Co')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete forever' }))
    await waitFor(() => expect(screen.queryByText('Old Co')).toBeNull())

    undoLast()
    expect(await screen.findByText('Old Co')).toBeInTheDocument()
    expect(permanentDeleteSite).not.toHaveBeenCalled()
  })

  it('a rejected permanent delete restores the row and reports the failure', async () => {
    permanentDeleteSite.mockRejectedValueOnce(new Error('Server error'))
    render(withFreshCache(<HomeDashboard />))
    await screen.findByText('Old Co')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete forever' }))
    await waitFor(() => expect(screen.queryByText('Old Co')).toBeNull())

    await commitLast()
    expect(toast.error).toHaveBeenCalledWith('Server error')
    expect(await screen.findByText('Old Co')).toBeInTheDocument()
  })

  it('Restore stays one click: no dialog, an immediate request, and a refresh of both lists', async () => {
    listDeletedSites.mockResolvedValueOnce([scheduled]).mockResolvedValueOnce([])
    render(withFreshCache(<HomeDashboard />))
    await screen.findByText('Old Co')
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))

    await waitFor(() => expect(restoreSite).toHaveBeenCalledWith('s2'))
    expect(toast.success).toHaveBeenCalledWith('Site restored successfully')
    // The refresh re-reads the deleted list; it no longer carries this site.
    await waitFor(() => expect(screen.queryByText('Old Co')).toBeNull())
  })

  it('a soft delete confirmed elsewhere is reachable here: refreshing the SWR keys shows the newly scheduled site', async () => {
    // Nothing scheduled yet when the page first loads.
    listDeletedSites.mockResolvedValueOnce([]).mockResolvedValueOnce([scheduled])
    const { useRefreshSiteLists } = await import('@/lib/swr/sites')

    // Stands in for another page's DeleteSiteModal calling useRefreshSiteLists
    // after its own commit (lib/swr/sites.tsx): mounted alongside HomeDashboard,
    // sharing SWR's default cache, exactly as production does inside one
    // SWRProvider with no mounted useDeletedSites() required on its side.
    function Elsewhere() {
      const refresh = useRefreshSiteLists()
      return <button onClick={refresh}>refresh elsewhere</button>
    }

    render(withFreshCache(
      <>
        <Elsewhere />
        <HomeDashboard />
      </>,
    ))
    await waitFor(() => expect(listDeletedSites).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Old Co')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'refresh elsewhere' }))
    await waitFor(() => expect(screen.getByText('Old Co')).toBeInTheDocument())
  })
})
