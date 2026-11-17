import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { PageScrollData, ScrollDepthDistribution } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// One page's scroll depth, by who reads it (components/pages/list/ScrollWho.tsx). What these pin:
//   ONE read a tab (the page's path and the tab's dimension), never one a row;
//   an answer for another tab's dimension is not drawn under this tab's name;
//   sources are merged by the name the dashboard shows, and their counts add up.
// ---------------------------------------------------------------------------

const mockUsePageScroll = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({ usePageScroll: (...a: unknown[]) => mockUsePageScroll(...a) }))
vi.mock('@/lib/utils/icons', () => ({
  getDeviceIcon: () => null,
  getCountryFlagIcon: () => null,
  getReferrerIcon: () => null,
  // google.com and google.de are one "google", as the dashboard's list shows one Google.
  getReferrerDisplayName: (r: string) => r.replace(/^www\./, '').split('.')[0],
}))

import { ApiError } from '@/lib/api/client'
import ScrollWho, { whoRows } from '../ScrollWho'

const depth = (total: number, end: number): ScrollDepthDistribution => ({ scroll_25: total, scroll_50: Math.round(total * 0.8), scroll_75: Math.round(total * 0.6), scroll_100: end, total_sessions: total })
const devices: PageScrollData = {
  by: 'device',
  all: depth(1000, 300),
  rows: [
    { value: 'mobile', depth: depth(600, 120) },
    { value: 'desktop', depth: depth(350, 175) },
    { value: 'tablet', depth: depth(20, 2) },
  ],
}
const props = { siteId: 's', path: '/pricing', start: '2026-11-01', end: '2026-11-30', filters: 'v2:country|is|NO' }

beforeEach(() => {
  mockUsePageScroll.mockReset().mockReturnValue({ data: devices, isLoading: false })
})

describe('whoRows', () => {
  it('names devices and keeps the server\'s order, four at most', () => {
    const rows = whoRows('device', [...devices.rows, { value: 'tv', depth: depth(9, 1) }, { value: 'watch', depth: depth(2, 0) }])
    expect(rows.map((r) => r.name)).toEqual(['Mobile', 'Desktop', 'Tablet', 'Tv'])
  })

  it('merges sources the dashboard shows under one name, adds their visits, and puts the busiest first', () => {
    const rows = whoRows('referrer', [
      { value: 'news.example', depth: depth(90, 30) },
      { value: 'google.com', depth: depth(60, 20) },
      { value: 'google.de', depth: depth(50, 10) },
      { value: '', depth: depth(500, 100) },
    ])
    expect(rows.map((r) => r.name)).toEqual(['google', 'news'])
    expect(rows[0].depth.total_sessions).toBe(110)
    expect(rows[0].depth.scroll_100).toBe(30)
  })

  it('leaves out a value that is empty', () => {
    expect(whoRows('country', [{ value: '', depth: depth(5, 1) }, { value: 'NO', depth: depth(40, 10) }]).map((r) => r.key)).toEqual(['country:NO'])
  })
})

describe('the tab', () => {
  it('asks ONE read: the page, the tab\'s dimension, the range and the page\'s own filters', () => {
    render(<ScrollWho {...props} />)
    expect(mockUsePageScroll).toHaveBeenCalledWith('s', '/pricing', 'device', '2026-11-01', '2026-11-30', 'v2:country|is|NO', undefined)
    expect(new Set(mockUsePageScroll.mock.calls.map((c) => c.slice(1, 3).join('|')))).toEqual(new Set(['/pricing|device']))
  })

  it('draws everyone and each device, and names the furthest reader', () => {
    render(<ScrollWho {...props} />)
    expect(screen.getByText('Everyone')).toBeInTheDocument()
    expect(screen.getByText('Mobile')).toBeInTheDocument()
    // Desktop: 175 of 350 reach the end; mobile: 120 of 600.
    const headline = document.querySelector('[data-who-headline]') as HTMLElement
    expect(headline).toHaveTextContent('Desktop')
    expect(headline).toHaveTextContent('Furthest reader · 50% of its visits reach the end, 20% for Mobile')
    // Tablet has 20 visits, too few to be named either way.
    expect(headline).not.toHaveTextContent('Tablet')
  })

  it('names the cell under the pointer, and the furthest reader again once it has left', () => {
    render(<ScrollWho {...props} />)
    fireEvent.pointerEnter(document.querySelector('[data-who-cell="1-3"]') as HTMLElement, { pointerType: 'mouse' })
    const headline = document.querySelector('[data-who-headline]') as HTMLElement
    expect(headline).toHaveTextContent('Mobile, the end')
    expect(headline).toHaveTextContent('120 of 600 visits · 20%')
    fireEvent.pointerLeave(document.querySelector('[data-who-grid]') as HTMLElement)
    expect(headline).toHaveTextContent('Desktop')
  })

  it('does not draw another tab\'s rows under this tab\'s name while its own read is on the way', () => {
    render(<ScrollWho {...props} />)
    // The switch moves to Sources; the read in hand is still the devices'.
    fireEvent.click(screen.getByRole('radio', { name: 'Sources' }))
    expect(mockUsePageScroll.mock.calls.at(-1)?.[2]).toBe('referrer')
    expect(screen.queryByText('Mobile')).toBeNull()
    expect(screen.getByText('Everyone')).toBeInTheDocument()
    expect(document.querySelector('[data-who-headline]')).toHaveAttribute('data-who-ready', 'no')
  })

  it('shows its skeleton, and no figure, until the first answer', () => {
    mockUsePageScroll.mockReturnValue({ data: undefined, isLoading: true })
    render(<ScrollWho {...props} />)
    expect(document.querySelector('[data-page-scroll="loading"]')).not.toBeNull()
    expect(screen.queryByText('Everyone')).toBeNull()
  })

  it('says a failed read failed, and draws no rows that would wait for good', () => {
    mockUsePageScroll.mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom') })
    render(<ScrollWho {...props} />)
    expect(screen.getByText('Could not load scroll depth')).toBeInTheDocument()
    expect(screen.queryByText('Everyone')).toBeNull()
  })

  it('says a range the server will not break down as a limit, with what lifts it', () => {
    mockUsePageScroll.mockReturnValue({ data: undefined, isLoading: false, error: new ApiError('refused', 422, { error: 'refused' }) })
    const { unmount } = render(<ScrollWho {...props} />)
    expect(document.querySelector('[data-page-scroll="refused"]')).not.toBeNull()
    expect(screen.getByText("Scroll depth can't be shown for this range")).toBeInTheDocument()
    expect(screen.getByText('Choose a shorter range or remove a filter.')).toBeInTheDocument()
    expect(screen.queryByText('Could not load scroll depth')).toBeNull()
    unmount()
    // With no filter to remove, only the range is named.
    render(<ScrollWho {...props} filters={undefined} />)
    expect(screen.getByText('Choose a shorter range.')).toBeInTheDocument()
  })

  it('keeps the plain failure for every other error, a server fault included', () => {
    mockUsePageScroll.mockReturnValue({ data: undefined, isLoading: false, error: new ApiError('down', 503) })
    render(<ScrollWho {...props} />)
    expect(document.querySelector('[data-page-scroll="failed"]')).not.toBeNull()
    expect(screen.getByText('Could not load scroll depth')).toBeInTheDocument()
  })

  it('says so where too few visits scrolled to name anyone', () => {
    mockUsePageScroll.mockReturnValue({ data: { by: 'device', all: depth(12, 2), rows: [{ value: 'mobile', depth: depth(12, 2) }] }, isLoading: false })
    render(<ScrollWho {...props} />)
    expect(screen.getByText('Not enough visits in this range to say who reads furthest.')).toBeInTheDocument()
  })
})
