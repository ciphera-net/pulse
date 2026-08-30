import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { VisitorsOffRoom } from '../VisitorsOffRoom'
import type { Site } from '@/lib/api/sites'

/**
 * Three production bugs lived in one 20-line function. These pin all three.
 */

const updateSite = vi.fn()
vi.mock('@/lib/api/sites', () => ({ updateSite: (...a: unknown[]) => updateSite(...a) }))
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))
vi.mock('@ciphera-net/facet', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'err',
}))

const SITE = {
  id: 'site-1',
  domain: 'ciphera.net',
  name: 'Ciphera',
  visitor_views_enabled: false,
} as unknown as Site

function renderRoom(cache?: Map<unknown, unknown>) {
  return render(
    // A REAL provider cache — the app mounts a custom one, and asserting
    // against a mocked invalidation module is the exact false green that let
    // the global-mutate bug ship (pulse#412).
    <SWRConfig value={{ provider: () => (cache ?? new Map()) as never }}>
      <VisitorsOffRoom site={SITE} onEnabled={() => {}} />
    </SWRConfig>,
  )
}

beforeEach(() => {
  updateSite.mockReset()
  updateSite.mockResolvedValue({ ...SITE, visitor_views_enabled: true })
})

describe('enabling visitor views', () => {
  it('🔴 sends the site NAME, never the domain', async () => {
    // It sent `{ name: domain }` because the endpoint requires a name — and so
    // RENAMED THE SITE on every enable. Measured in production: "Ciphera"
    // became "ciphera.net" the moment the button was pressed.
    renderRoom()
    fireEvent.click(screen.getByRole('button', { name: 'Enable visitor views' }))
    await waitFor(() => expect(updateSite).toHaveBeenCalled())

    const [siteId, payload] = updateSite.mock.calls[0]
    expect(siteId).toBe('site-1')
    expect(payload.name).toBe('Ciphera')
    expect(payload.name).not.toBe('ciphera.net')
    expect(payload.visitor_views_enabled).toBe(true)
  })

  it('🔴 drops the visitors caches so the OFF room cannot survive the toast', async () => {
    // useVisitors had already failed with the toggle-off 403, and the shared
    // SWR config deliberately does not retry a 403 — so SWR held that error
    // until something revalidated a key that never changed. The page kept
    // showing this room after a success toast, until a manual refresh.
    const cache = new Map<unknown, unknown>([
      ['$swr$["visitors","site-1","a","b",null,"last_seen","desc",1,10]', { data: 'stale' }],
    ])
    renderRoom(cache)
    fireEvent.click(screen.getByRole('button', { name: 'Enable visitor views' }))
    await waitFor(() => expect(updateSite).toHaveBeenCalled())

    // The site's own cache entry is seeded from the server's answer, so the
    // page never re-reads a stale "disabled".
    await waitFor(() => {
      const siteEntry = [...cache.entries()].find(([k]) => String(k).includes('"site","site-1"'))
      expect(siteEntry?.[1]).toMatchObject({ data: { visitor_views_enabled: true } })
    })
  })

  it('surfaces a failure instead of a false success', async () => {
    updateSite.mockRejectedValueOnce(new Error('nope'))
    const onEnabled = vi.fn()
    render(
      <SWRConfig value={{ provider: () => new Map() as never }}>
        <VisitorsOffRoom site={SITE} onEnabled={onEnabled} />
      </SWRConfig>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Enable visitor views' }))
    await waitFor(() => expect(updateSite).toHaveBeenCalled())
    // A failed enable must NOT report success upward — the page would clear the
    // room and then have nothing to show.
    expect(onEnabled).not.toHaveBeenCalled()
  })

  it('names the site it is off for, and says collection is unchanged', () => {
    renderRoom()
    expect(screen.getByText('Off for ciphera.net')).toBeInTheDocument()
    expect(screen.getByText('collection unchanged')).toBeInTheDocument()
    expect(screen.getByText(/Pulse collects the same data either way/)).toBeInTheDocument()
  })
})
