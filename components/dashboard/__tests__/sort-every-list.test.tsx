import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import Sources from '@/components/dashboard/Sources'
import Locations from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import ContentStats from '@/components/dashboard/ContentStats'
import { DashboardFrameProvider } from '@/lib/dashboard/frame'

// ---------------------------------------------------------------------------
// Every list of the dashboard sorts by its column's name, high to low and low to high (16-11-2026, the owner: "can
// we add high to low & low to high filters to all headers on the dashboard? like we did for the pages block,
// events block."). The Pages tab's device (R41) with one column: visitors, or the Outbound tab's clicks. Outside the
// frame, today's arrangement keeps its plain label and the server's order.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  useFullDimensionList: vi.fn(),
  useCampaignsList: vi.fn(),
  useOutboundUrls: vi.fn(),
}))
vi.mock('@/lib/swr/dashboard', () => ({
  useFullDimensionList: (...a: unknown[]) => h.useFullDimensionList(...a),
  useCampaignsList: (...a: unknown[]) => h.useCampaignsList(...a),
  useOutboundUrls: (...a: unknown[]) => h.useOutboundUrls(...a),
}))
vi.mock('@/components/dashboard/Cascade', () => ({
  CascadeGroup: ({ className, children }: { className?: string; children: React.ReactNode }) => <div className={className}>{children}</div>,
  CascadeRow: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RowBar: ({ width }: { width: number }) => <div data-testid="row-bar" data-width={width} />,
}))
vi.mock('@/components/dashboard/MapView', () => ({ default: () => null }))
vi.stubGlobal('IntersectionObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

const idle = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
const dateRange = { start: '2026-11-09', end: '2026-11-15' }
const totals = { pageviews: 1000, visitors: 500 }

beforeEach(() => {
  h.useFullDimensionList.mockReset().mockReturnValue(idle)
  h.useCampaignsList.mockReset().mockReturnValue(idle)
  h.useOutboundUrls.mockReset().mockReturnValue(idle)
})

const inFrame = (ui: React.ReactElement) => render(<DashboardFrameProvider>{ui}</DashboardFrameProvider>)
const cardOf = (name: string) => document.querySelector(`[data-tour-card="${name}"]`) as HTMLElement
const labels = (card: HTMLElement) => [...card.querySelectorAll('[data-sort]')].map((b) => b.getAttribute('aria-label'))
const press = (card: HTMLElement, column = 'visitors') => fireEvent.click(within(card).getByRole('button', { name: new RegExp(`^Sort by ${column},`) }))
/** A row's name: the first truncating text in it. */
const names = (card: HTMLElement) => [...card.querySelectorAll('.interactive-row')].map((r) => r.querySelector('.truncate')?.textContent?.trim())

// Three rows whose visitors order differs from the order they arrive in only at the tie, which keeps the server's order.
const browsers = [
  { browser: 'Safari', pageviews: 300, visitors: 200 },
  { browser: 'Chrome', pageviews: 200, visitors: 100 },
  { browser: 'Firefox', pageviews: 150, visitors: 100 },
  { browser: 'Edge', pageviews: 50, visitors: 20 },
]
const techBlock = () => (
  <TechSpecs browsers={browsers} os={[]} devices={[]} screenResolutions={[]} siteId="site-1" dateRange={dateRange} totals={totals} />
)

describe('Technology', () => {
  it('sorts by visitors: high to low first, low to high on a second press, ties in the server\'s order', () => {
    inFrame(techBlock())
    const card = cardOf('tech')
    expect(labels(card)).toEqual(['Sort by visitors, low to high'])
    expect(names(card)).toEqual(['Safari', 'Chrome', 'Firefox', 'Edge'])
    press(card)
    expect(names(card)).toEqual(['Edge', 'Chrome', 'Firefox', 'Safari'])
    expect(labels(card)).toEqual(['Sort by visitors, high to low'])
    press(card)
    expect(names(card)).toEqual(['Safari', 'Chrome', 'Firefox', 'Edge'])
  })

  it('outside the frame keeps the plain label and the server\'s order', () => {
    render(techBlock())
    expect(cardOf('tech').querySelector('[data-sort-head]')).toBeNull()
    expect(screen.getByTestId('metric-unit').textContent).toBe('Visitors')
  })
})

describe('Locations', () => {
  const countries = [
    { country: 'NO', pageviews: 400, visitors: 300 },
    { country: 'DK', pageviews: 200, visitors: 120 },
    { country: 'SE', pageviews: 100, visitors: 50 },
  ]
  const block = () => (
    <Locations countries={countries} cities={[]} regions={[]} languages={[]} timezones={[]} siteId="site-1" dateRange={dateRange} totals={totals} />
  )

  it('sorts a list tab by visitors, both ways', () => {
    inFrame(block())
    const card = cardOf('locations')
    expect(labels(card)).toEqual(['Sort by visitors, low to high'])
    const order = () => [...card.querySelectorAll('.interactive-row img')].map((img) => img.getAttribute('src')?.match(/\/flags\/([a-z]+)\.svg$/)?.[1])
    expect(order()).toEqual(['no', 'dk', 'se'])
    press(card)
    expect(order()).toEqual(['se', 'dk', 'no'])
  })

  it('on the Map tab there is no list, so the label is a plain one', () => {
    inFrame(block())
    const card = cardOf('locations')
    fireEvent.click(within(card).getByRole('radio', { name: 'Map' }))
    expect(card.querySelector('[data-sort-head]')).toBeNull()
    expect(within(card).getByTestId('metric-unit').textContent).toBe('Visitors')
  })
})

describe('Sources', () => {
  const referrers = [
    { referrer: 'google.com', pageviews: 100, visitors: 90 },
    { referrer: 'bing.com', pageviews: 50, visitors: 10 },
    { referrer: 'duckduckgo.com', pageviews: 60, visitors: 40 },
  ]
  const channels = [
    { channel: 'Organic Search', pageviews: 200, visitors: 150 },
    { channel: 'Direct', pageviews: 300, visitors: 160 },
    { channel: 'Email', pageviews: 20, visitors: 5 },
  ]
  const block = () => <Sources referrers={referrers} channels={channels} siteId="site-1" dateRange={dateRange} totals={totals} />

  it('sorts the referrers, the channels and the campaigns by visitors, the open view with the one head', () => {
    h.useCampaignsList.mockReturnValue({
      ...idle,
      data: [
        { source: 'newsletter', medium: 'email', campaign: 'a', term: '', content: '', visitors: 30, pageviews: 40, bounce_rate: null, avg_duration: null },
        { source: 'instagram', medium: 'social', campaign: 'b', term: '', content: '', visitors: 80, pageviews: 90, bounce_rate: null, avg_duration: null },
      ],
    })
    inFrame(block())
    const card = cardOf('referrers')
    expect(labels(card)).toEqual(['Sort by visitors, low to high'])
    expect(names(card)).toEqual(['Google', 'DuckDuckGo', 'Bing'])
    press(card)
    expect(names(card)).toEqual(['Bing', 'DuckDuckGo', 'Google'])
    fireEvent.click(within(card).getByRole('radio', { name: 'Channels' }))
    // The order asked for stays on: low to high here too.
    expect(names(card)).toEqual(['Email', 'Organic Search', 'Direct'])
    press(card)
    expect(names(card)).toEqual(['Direct', 'Organic Search', 'Email'])
    fireEvent.click(within(card).getAllByRole('radio')[2])
    expect(names(card)).toEqual(['Instagram', 'Newsletter'])
    press(card)
    expect(names(card)).toEqual(['Newsletter', 'Instagram'])
  })

  it('a new order goes back to the first page', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ referrer: `site-${i}.example`, pageviews: 100 - i, visitors: 90 - i }))
    inFrame(<Sources referrers={many} siteId="site-1" dateRange={dateRange} totals={totals} />)
    const card = cardOf('referrers')
    fireEvent.click(within(card).getByRole('button', { name: /next/i }))
    expect(names(card)).toEqual(['Site-7', 'Site-8'])
    press(card)
    // Low to high from page 1: the two smallest first.
    expect(names(card).slice(0, 2)).toEqual(['Site-8', 'Site-7'])
  })
})

describe('the Pages block\'s Outbound tab sorts by clicks', () => {
  it('high to low first, then low to high', () => {
    h.useOutboundUrls.mockReturnValue({
      data: [
        { value: 'https://www.strava.com/clubs/x', count: 443 },
        { value: 'https://komoot.com/y', count: 322 },
        { value: 'https://www.youtube.com/@z', count: 176 },
      ],
      error: undefined,
      isLoading: false,
    })
    inFrame(
      <ContentStats topPages={[]} entryPages={[]} exitPages={[]} domain="example.com" siteId="site-1" dateRange={dateRange} totals={totals}
        outbound={{ period: '7d', goalCounts: [{ event_name: 'outbound_link', count: 941, visitors: 600 }] }} />,
    )
    const card = cardOf('content')
    fireEvent.click(within(card).getByRole('radio', { name: 'Outbound' }))
    expect(labels(card)).toEqual(['Sort by clicks, low to high'])
    const links = () => [...card.querySelectorAll('[data-testid="outbound-link-row"] .truncate')].map((el) => el.textContent)
    expect(links()).toEqual(['strava.com/clubs/x', 'komoot.com/y', 'youtube.com/@z'])
    press(card, 'clicks')
    expect(links()).toEqual(['youtube.com/@z', 'komoot.com/y', 'strava.com/clubs/x'])
  })
})
