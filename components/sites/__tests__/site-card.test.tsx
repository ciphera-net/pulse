import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SiteCard, siteCardState, sevenDayFigures } from '@/components/sites/SiteCard'
import { deletionWords } from '@/components/sites/DeletedSitesList'
import { oneSiteTarget } from '@/components/sites/oneSite'
import type { Site, SiteOverview } from '@/lib/api/sites'
import { DOCS_ORIGIN } from '@/lib/docs'

// The new-sites beta's card (24-11-2026, R125 to R127). The capture layer is not under test: no picture, so the card
// draws its plate deterministically.
vi.mock('@/lib/swr/dashboard', () => ({ usePagePreview: () => ({ data: null }) }))
let canEdit = true
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => canEdit }))

const site: Site = {
  id: 'site-1',
  user_id: 'u',
  domain: 'ciphera.net',
  name: 'Ciphera',
  uptime_enabled: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function overview(o: Partial<SiteOverview> = {}): SiteOverview {
  return {
    site_id: 'site-1',
    today: '2026-11-24',
    visitors_today: 22,
    daily: [13, 11, 33, 27, 9, 26, 22].map((visitors, i) => ({ date: `2026-11-${18 + i}`, visitors })),
    visitors_7d: 141,
    visitors_prev_7d: 100,
    install_status: 'active',
    last_event_at: '2026-11-24T16:00:00Z',
    uptime_status: 'up',
    ...o,
  }
}

beforeEach(() => {
  canEdit = true
})

describe('SiteCard', () => {
  it('shows visitors over the last 7 days, the change against the 7 before on the same line, and no state', () => {
    const { container } = render(<SiteCard site={site} overview={overview()} overviewError={false} />)
    expect(screen.getByText('Ciphera')).toBeTruthy()
    expect(screen.getByText('ciphera.net')).toBeTruthy()
    expect(screen.getByText('141')).toBeTruthy()
    expect(screen.getByText('visitors, last 7 days')).toBeTruthy()
    // R127: the change sits on the number's line (one row holds both), not in a column of its own.
    const change = screen.getByText(/↑/)
    expect(change.textContent?.replace(/\s+/g, '')).toBe('↑41%')
    expect(change.closest('div')?.textContent).toContain('141')
    expect(screen.queryByText('visitors today')).toBeNull()
    expect(container.querySelector('svg[preserveAspectRatio="none"]')).toBeTruthy()
    for (const word of ['Down', 'Degraded', 'Waiting for the first event']) expect(screen.queryByText(word)).toBeNull()
  })

  it('draws its band in the app glass, hairline on top, and its gear on touch screens', () => {
    const { container } = render(<SiteCard site={site} overview={overview()} overviewError={false} />)
    const band = container.querySelector('[data-site-band]')!
    // The toolbar band's glass, on the dark ground's own colour (the class follows the page's theme; the card does not).
    for (const c of ['dark-ground', 'bg-neutral-950/60', 'backdrop-blur-[24px]', 'backdrop-saturate-150', 'border-t', 'border-white/[0.08]']) {
      expect(band.className).toContain(c)
    }
    expect(band.className).not.toContain('glass-band')
    expect(band.getAttribute('data-site-band')).toBe('dark')
    const gear = screen.getByTitle('Site settings')
    expect(gear.className).toContain('[@media(hover:none)]:opacity-100')
  })

  it('without the two server fields, counts the 7 days from daily and shows no change', () => {
    render(<SiteCard site={site} overview={overview({ visitors_7d: undefined, visitors_prev_7d: undefined })} overviewError={false} />)
    expect(screen.getByText('141')).toBeTruthy()
    expect(screen.queryByText(/↑|↓/)).toBeNull()
  })

  it('a site that never sent an event says so on its plate, with the way to set it up', () => {
    render(<SiteCard site={site} overview={overview({ install_status: 'never_installed', visitors_7d: 0 })} overviewError={false} />)
    expect(screen.getByText('Waiting for the first event')).toBeTruthy()
    expect(screen.getByText('Add the tracking script to the site and its visitors show here.')).toBeTruthy()
    expect(screen.getByText('Set it up').getAttribute('href')).toBe('/settings/site/general')
    expect(screen.getByText('Read the docs').getAttribute('href')).toBe(DOCS_ORIGIN)
    expect(screen.queryByText('visitors, last 7 days')).toBeNull()
  })

  it('without the right to edit the site there is no gear and no Set it up', () => {
    canEdit = false
    render(<SiteCard site={site} overview={overview({ install_status: 'never_installed' })} overviewError={false} />)
    expect(screen.queryByTitle('Site settings')).toBeNull()
    expect(screen.queryByText('Set it up')).toBeNull()
    expect(screen.getByText('Read the docs')).toBeTruthy()
  })

  it('a failed overview read says so in words, never as a number', () => {
    render(<SiteCard site={site} overview={null} overviewError={true} />)
    expect(screen.getByText("Couldn't load")).toBeTruthy()
  })
})

describe('siteCardState', () => {
  const now = Date.parse('2026-11-24T12:00:00Z')
  it('names Down before Degraded before a stall, and nothing when all is well', () => {
    expect(siteCardState(overview({ uptime_status: 'down', install_status: 'stalled' }), now)).toBe('Down')
    expect(siteCardState(overview({ uptime_status: 'degraded', install_status: 'stalled' }), now)).toBe('Degraded')
    expect(siteCardState(overview({ install_status: 'stalled', last_event_at: '2026-11-21T10:00:00Z' }), now)).toBe('No events for 3 days')
    expect(siteCardState(overview({ install_status: 'stalled', last_event_at: '2026-11-23T10:00:00Z' }), now)).toBe('No events for 1 day')
    expect(siteCardState(overview(), now)).toBeNull()
  })
  it('carries no word for inconclusive or unknown uptime, nor for a site the plate already speaks for', () => {
    expect(siteCardState(overview({ uptime_status: 'inconclusive' }), now)).toBeNull()
    expect(siteCardState(overview({ uptime_status: 'unknown' }), now)).toBeNull()
    expect(siteCardState(overview({ install_status: 'never_installed', uptime_status: 'down' }), now)).toBeNull()
    expect(siteCardState(null, now)).toBeNull()
  })
})

describe('sevenDayFigures', () => {
  it('takes both figures from the server', () => {
    expect(sevenDayFigures(overview({ visitors_7d: 582, visitors_prev_7d: 1984 }))).toEqual({ visitors: 582, previous: 1984 })
  })
})

describe('deletionWords', () => {
  const now = Date.parse('2026-11-24T12:00:00Z')
  it('says the days left before a deleted site goes for good', () => {
    expect(deletionWords('2026-11-24T12:00:00Z', now)).toBe('Deleted in 7 days')
    expect(deletionWords('2026-11-18T11:00:00Z', now)).toBe('Deleted in 1 day')
    expect(deletionWords('2026-11-10T00:00:00Z', now)).toBe('Deleted within a day')
    expect(deletionWords(null, now)).toBe('Waiting to be deleted')
  })
})

describe('oneSiteTarget (R124)', () => {
  it('sends a team with one site to it, unless a site waits to be deleted', () => {
    expect(oneSiteTarget(['a'], 0)).toBe('a')
    expect(oneSiteTarget(['a'], 1)).toBeNull()
    expect(oneSiteTarget(['a', 'b'], 0)).toBeNull()
    expect(oneSiteTarget([], 0)).toBeNull()
  })
})
