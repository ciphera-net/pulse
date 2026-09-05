import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FleetCard } from '@/components/sites/FleetCard'
import FleetDeck from '@/components/sites/FleetDeck'
import type { Site, SiteOverview } from '@/lib/api/sites'

// The capture request layer is not under test; individual tests set
// previewData to exercise the capture branch (default: no capture, so cards
// render their fallback plate deterministically).
let previewData: { screenshot: string; width: number; height: number; strategy: string; checked_at: string } | null =
  null
vi.mock('@/lib/swr/dashboard', () => ({
  usePagePreview: () => ({ data: previewData }),
}))

let canEdit = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => canEdit,
}))

function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 'site-1',
    user_id: 'u',
    domain: 'ciphera.net',
    name: 'Ciphera',
    uptime_enabled: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeOverview(overrides: Partial<SiteOverview> = {}): SiteOverview {
  return {
    site_id: 'site-1',
    today: '2026-08-22',
    visitors_today: 942,
    daily: [
      { date: '2026-08-16', visitors: 4 },
      { date: '2026-08-17', visitors: 3 },
      { date: '2026-08-18', visitors: 6 },
      { date: '2026-08-19', visitors: 5 },
      { date: '2026-08-20', visitors: 9 },
      { date: '2026-08-21', visitors: 7 },
      { date: '2026-08-22', visitors: 942 },
    ],
    install_status: 'active',
    last_event_at: '2026-08-22T09:00:00Z',
    uptime_status: 'up',
    ...overrides,
  }
}

beforeEach(() => {
  canEdit = true
  previewData = null
})

describe('FleetCard', () => {
  it('renders identity, the server visitors_today number and no chip when healthy', () => {
    const { container } = render(
      <FleetCard site={makeSite()} overview={makeOverview()} overviewError={false} />
    )
    expect(screen.getByText('Ciphera')).toBeTruthy()
    expect(screen.getByText('ciphera.net')).toBeTruthy()
    // the number is the server's value, printed verbatim — no client date math
    expect(screen.getByText('942')).toBeTruthy()
    expect(screen.getByText('visitors today')).toBeTruthy()
    expect(screen.queryByText('down')).toBeNull()
    expect(screen.queryByText('degraded')).toBeNull()
    expect(screen.queryByText('stalled')).toBeNull()
    // the ghost sparkline rides the scrim for a healthy card — matched by its
    // full-bleed preserveAspectRatio, not a bare svg query (the gear icon is
    // also an svg, which once let a sparkline-less card pass this test)
    expect(container.querySelector('svg[preserveAspectRatio="none"]')).toBeTruthy()
  })

  it('whole card links to the site dashboard', () => {
    render(<FleetCard site={makeSite()} overview={makeOverview()} overviewError={false} />)
    const link = screen.getByRole('link', { name: 'Ciphera dashboard' })
    expect(link.getAttribute('href')).toBe('/sites/site-1')
  })

  it('shows an amber uptime chip, with down taking precedence over stalled', () => {
    render(
      <FleetCard
        site={makeSite()}
        overview={makeOverview({ install_status: 'stalled', uptime_status: 'down' })}
        overviewError={false}
      />
    )
    expect(screen.getByText('down')).toBeTruthy()
    expect(screen.queryByText('stalled')).toBeNull()
  })

  it('shows a degraded chip when the monitor reports degraded', () => {
    render(
      <FleetCard site={makeSite()} overview={makeOverview({ uptime_status: 'degraded' })} overviewError={false} />
    )
    expect(screen.getByText('degraded')).toBeTruthy()
  })

  it('renders the stalled treatment with days derived from last_event_at', () => {
    const lastEvent = new Date(Date.now() - 20.5 * 86_400_000).toISOString()
    render(
      <FleetCard
        site={makeSite()}
        overview={makeOverview({ install_status: 'stalled', last_event_at: lastEvent, uptime_status: null })}
        overviewError={false}
      />
    )
    expect(screen.getByText(/No events for 20 days/)).toBeTruthy()
    const fix = screen.getByRole('link', { name: /check the install/ })
    expect(fix.getAttribute('href')).toBe('/settings/site/general')
    expect(screen.getByText('stalled')).toBeTruthy()
  })

  it('renders a never-installed site as its own setup card, without stats', () => {
    const { container } = render(
      <FleetCard
        site={makeSite()}
        overview={makeOverview({ install_status: 'never_installed', last_event_at: null, visitors_today: 0 })}
        overviewError={false}
      />
    )
    expect(screen.getByText('Waiting for the first event')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Read the docs' }).getAttribute('href')).toContain('help.ciphera.net')
    expect(screen.queryByText('visitors today')).toBeNull()
    expect(screen.queryByText('stalled')).toBeNull()
    expect(container.querySelector('svg[preserveAspectRatio="none"]')).toBeNull()
  })

  it('renders a visible error — never 0 or an em dash — when the overview fetch failed', () => {
    render(<FleetCard site={makeSite()} overview={null} overviewError={true} />)
    expect(screen.getByText(/couldn.t load/i)).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.queryByText('—')).toBeNull()
  })

  it('never consults is_verified — the known false green', () => {
    const overview = makeOverview()
    const a = render(
      <FleetCard site={makeSite({ is_verified: true })} overview={overview} overviewError={false} />
    )
    // useId tokens are render-instance identity, not content: the sparkline's
    // gradient id differs between two roots by construction. Normalise them so
    // the comparison stays about what is_verified does (nothing).
    const stripIds = (html: string) => html.replace(/id="[^"]+"/g, 'id="ID"').replace(/url\(#[^)]+\)/g, 'url(#ID)')
    const verifiedHtml = stripIds(a.container.innerHTML)
    a.unmount()
    const b = render(
      <FleetCard site={makeSite({ is_verified: false })} overview={overview} overviewError={false} />
    )
    expect(stripIds(b.container.innerHTML)).toBe(verifiedHtml)
  })

  it('shows the capture from the VERY TOP of the page, full-bleed', () => {
    // Owner decision 22-08 (supersedes the crop-below-navbar idea): the site's
    // own header is part of the card. Full-bleed cover anchored to the top —
    // no margin, no offset, exactly the mock's geometry.
    previewData = {
      screenshot: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      width: 1350,
      height: 6638,
      strategy: 'desktop',
      checked_at: '2026-08-22T06:00:00Z',
    }
    const { container } = render(<FleetCard site={makeSite()} overview={makeOverview()} overviewError={false} />)
    const img = container.querySelector('img[src^="data:image/gif"]') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.style.marginTop).toBe('')
    expect(img.style.top).toBe('')
    expect(img.className).toContain('object-cover')
    expect(img.className).toContain('object-top')
    expect(img.className).toContain('w-full')
    expect(img.className).toContain('h-full')
  })

  it('gates the settings gear on sites.edit', () => {
    const a = render(<FleetCard site={makeSite()} overview={makeOverview()} overviewError={false} />)
    expect(a.getByTitle('Site Settings')).toBeTruthy()
    a.unmount()
    canEdit = false
    render(<FleetCard site={makeSite()} overview={makeOverview()} overviewError={false} />)
    expect(screen.queryByTitle('Site Settings')).toBeNull()
  })
})

describe('FleetDeck', () => {
  it('renders one card per site in a two-up grid, with no docs tile appended', () => {
    const sites = [makeSite(), makeSite({ id: 'site-2', domain: 'pulse.ciphera.net', name: 'Pulse' })]
    const { container } = render(
      <FleetDeck
        sites={sites}
        overviewBySite={{ 'site-1': makeOverview() }}
        overviewError={false}
        onRetryOverview={() => {}}
      />
    )
    expect(screen.getByText('Ciphera')).toBeTruthy()
    expect(screen.getByText('Pulse')).toBeTruthy()
    expect(screen.queryByText(/Need help/)).toBeNull()
    expect(container.querySelector('.md\\:grid-cols-2')).toBeTruthy()
  })

  it('surfaces a deck-level retry affordance when the overview fetch failed', () => {
    render(
      <FleetDeck sites={[makeSite()]} overviewBySite={{}} overviewError={true} onRetryOverview={() => {}} />
    )
    expect(screen.getByText(/Couldn.t load site stats/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})
