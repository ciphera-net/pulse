import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

// ─── The markup the M11 extraction must not change (PULSE-118) ─────────────
//
// The Import tab is built from the SAME devices as the Integrations tab and the
// setup wizard: LogoTile, the service header row, DetailRows and SetupReveal
// moved out of SiteIntegrationsTab into components/settings/integrationRows.tsx,
// the rail's bar moved out of SetupRail into components/setup/RailBar.tsx, and
// SettingsErrorState's banner gained an optional `children` slot.
//
// A move like that is only safe if the screens it came from render EXACTLY what
// they rendered before. These snapshots were written by running this file
// against origin/staging's versions of the three edited files (SiteIntegrationsTab,
// SetupRail, SettingsErrorState) and then left untouched while the extracted
// versions ran against them: a class dropped, reordered or added anywhere in the
// move fails here, byte for byte.

vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCanManage,
}))

const useGSCStatus = vi.fn()
const useBunnyStatus = vi.fn()
const useBingStatus = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useGSCStatus: (...a: unknown[]) => useGSCStatus(...a),
  useBunnyStatus: (...a: unknown[]) => useBunnyStatus(...a),
  useBingStatus: (...a: unknown[]) => useBingStatus(...a),
}))

vi.mock('@/lib/api/gsc', () => ({ getGSCAuthURL: vi.fn(), disconnectGSC: vi.fn() }))
vi.mock('@/lib/api/bunny', () => ({ getBunnyPullZones: vi.fn(), connectBunny: vi.fn(), disconnectBunny: vi.fn() }))
vi.mock('@/lib/api/bing', () => ({ listBingSites: vi.fn(), connectBing: vi.fn(), disconnectBing: vi.fn() }))

let pathname = '/setup/site'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

let pendingPlan: { planId: string; interval: string; limit: number } | null = null
vi.mock('@/lib/setup/context', () => ({
  useSetup: () => ({ pendingPlan }),
}))

import SiteIntegrationsTab from '@/components/settings/unified/tabs/SiteIntegrationsTab'
import SetupRail from '@/components/setup/SetupRail'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'

const SNAP = './__snapshots__/extraction-markup'
/** React's useId values count every mount in the worker, so they depend on test order, not on the markup. */
const html = (el: Element) => el.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_ID_')
const noop = () => Promise.resolve(undefined)

function status(data: unknown, over: Record<string, unknown> = {}) {
  return { data, error: undefined, isLoading: false, mutate: noop, ...over }
}

beforeEach(() => {
  mockCanManage = true
  pathname = '/setup/site'
  pendingPlan = null
  useGSCStatus.mockReset().mockReturnValue(status({ connected: false }))
  useBunnyStatus.mockReset().mockReturnValue(status({ connected: false }))
  useBingStatus.mockReset().mockReturnValue(status({ connected: false }))
})

describe('SiteIntegrationsTab renders the same markup after the extraction', () => {
  it('every integration disconnected, for a manager', async () => {
    const { container } = render(<SiteIntegrationsTab siteId="site-1" />)
    await expect(html(container)).toMatchFileSnapshot(`${SNAP}/integrations-disconnected.html`)
  })

  it('every integration disconnected, for a member who cannot manage them', async () => {
    mockCanManage = false
    const { container } = render(<SiteIntegrationsTab siteId="site-1" />)
    await expect(html(container)).toMatchFileSnapshot(`${SNAP}/integrations-read-only.html`)
  })

  it('connected with details, an integration reporting a problem, and a failed status fetch', async () => {
    useGSCStatus.mockReturnValue(
      status({
        connected: true,
        google_email: 'owner@example.com',
        gsc_property: 'sc-domain:example.com',
        status: 'active',
        last_synced_at: '2026-09-20T10:00:00Z',
        created_at: '2026-08-01T09:00:00Z',
      }),
    )
    useBingStatus.mockReturnValue(
      status({
        connected: true,
        site_url: 'https://example.com/',
        status: 'error',
        error_message: 'The API key was revoked.',
        last_synced_at: '2026-09-19T10:00:00Z',
        created_at: '2026-08-02T09:00:00Z',
      }),
    )
    useBunnyStatus.mockReturnValue(status(undefined, { error: new Error('boom') }))
    const { container } = render(<SiteIntegrationsTab siteId="site-1" />)
    await expect(html(container)).toMatchFileSnapshot(`${SNAP}/integrations-connected.html`)
  })

  it('with the Bing setup form revealed', async () => {
    const { container } = render(<SiteIntegrationsTab siteId="site-1" />)
    const bing = screen.getByText('Bing Webmaster Tools').closest('div.px-5')!.parentElement!
    fireEvent.click(within(bing).getByRole('button', { name: 'Connect' }))
    await expect(html(container)).toMatchFileSnapshot(`${SNAP}/integrations-bing-setup.html`)
  })
})

describe('SetupRail renders the same markup after the extraction', () => {
  for (const [path, plan] of [
    ['/setup/site', null],
    ['/setup/install', null],
    ['/setup/done', null],
    ['/setup/plan', { planId: 'business', interval: 'month', limit: 100000 }],
  ] as const) {
    it(`on ${path}${plan ? ' with a plan' : ''}`, async () => {
      pathname = path
      pendingPlan = plan
      const { container } = render(<SetupRail />)
      const name = `setup-rail${path.replace(/\//g, '-')}${plan ? '-plan' : ''}.html`
      await expect(html(container)).toMatchFileSnapshot(`${SNAP}/${name}`)
    })
  }
})

describe('SettingsErrorState renders the same markup when no children are passed', () => {
  it('as a banner', async () => {
    const { container } = render(
      <SettingsErrorState variant="banner" message="Couldn't load this. Try again." onRetry={() => {}} />,
    )
    await expect(html(container)).toMatchFileSnapshot(`${SNAP}/error-banner.html`)
  })

  it('as a card', async () => {
    const { container } = render(
      <SettingsErrorState title="Couldn't load your sites" message="This is usually temporary." onRetry={() => {}} />,
    )
    await expect(html(container)).toMatchFileSnapshot(`${SNAP}/error-card.html`)
  })
})
