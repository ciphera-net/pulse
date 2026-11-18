import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState, type ComponentProps } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { PageScrollBy, PageScrollData, ScrollDepthDistribution } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// One page's scroll depth, by who reads it (components/pages/list/ScrollWho.tsx). What these pin:
//   ONE read a tab (the page's path and the tab's dimension), never one a row;
//   an answer for another tab's dimension is not drawn under this tab's name;
//   sources are merged by the name the dashboard shows, and their counts add up;
//   its tabs are the blocks' own (ruling R85): the orange ones, ALWAYS on the page (while a tab's read is on the
//   way, and after one that failed), with Everyone's row kept for as long as it was read for the same range.
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
/** The tab as the page holds it: the page keeps which dimension is shown. */
function Tab(over: Partial<ComponentProps<typeof ScrollWho>>) {
  const [by, setBy] = useState<PageScrollBy>('device')
  return <ScrollWho {...props} by={by} onBy={setBy} {...over} />
}
const tabs = () => screen.getByRole('radiogroup', { name: 'Who reads furthest, by' })
const panel = () => document.querySelector('[data-page-scroll]') as HTMLElement

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

describe('the room it has', () => {
  it('is a container: its heads, its cells and its sentence follow the panel\'s width, never the window\'s', () => {
    render(<Tab />)
    expect(panel().className).toContain('[container-type:inline-size]')
    const grid = document.querySelector('[data-who-grid]') as HTMLElement
    expect(grid.className).toContain('cq-[470px]:grid-cols-[minmax(84px,150px)_repeat(4,minmax(0,1fr))]')
    // "Reached" is said only where a column has room for it.
    expect(within(grid).getAllByText('Reached', { exact: false })[0].className).toContain('hidden cq-[470px]:inline')
  })

  it('says its sentence whole: it wraps in a narrow panel, and a wide one carries it under the pointer too', () => {
    render(<Tab />)
    const line = document.querySelector('[data-who-line]') as HTMLElement
    expect(line).toHaveTextContent('Furthest reader · 50% of its visits reach the end, 20% for Mobile')
    expect(line.className).toContain('cq-[470px]:truncate')
    expect(line.className.split(/\s+/)).not.toContain('truncate')
    expect(line).toHaveAttribute('title', 'Furthest reader · 50% of its visits reach the end, 20% for Mobile')
  })
})

describe('its tabs (the blocks\' own)', () => {
  /** Devices is in hand; a tab named in `waits` is still being read, one named in `fails` failed. */
  const answers = ({ waits = [] as string[], fails = [] as string[] } = {}) =>
    mockUsePageScroll.mockImplementation((_site: string, _path: string, by: string) =>
      fails.includes(by) ? { data: undefined, isLoading: false, error: new Error('boom') }
        : waits.includes(by) ? { data: undefined, isLoading: true }
          : { data: { ...devices, by }, isLoading: false })

  it('are the orange ones of every block', () => {
    render(<Tab />)
    expect(tabs().querySelector('[data-facet-switcher-thumb]')).toHaveAttribute('data-tone', 'solid')
  })

  it('stay on the page while a tab\'s own read is on the way, with Everyone\'s row', () => {
    answers({ waits: ['referrer', 'country'] })
    render(<Tab />)
    const group = tabs()
    fireEvent.click(within(group).getByRole('radio', { name: 'Sources' }))
    // The same element, never taken out and put back: its highlight can glide, and a focused tab keeps its focus.
    expect(group.isConnected).toBe(true)
    expect(tabs()).toBe(group)
    expect(within(group).getByRole('radio', { name: 'Sources' })).toHaveAttribute('aria-checked', 'true')
    expect(panel()).toHaveAttribute('data-page-scroll', 'who')
    expect(screen.getByText('Everyone')).toBeInTheDocument()
    expect(screen.queryByText('Mobile')).toBeNull()
    expect(document.querySelector('[data-who-headline]')).toHaveAttribute('data-who-ready', 'no')
    // The next tab can be pressed while this one waits.
    fireEvent.click(within(group).getByRole('radio', { name: 'Countries' }))
    expect(group.isConnected).toBe(true)
    expect(within(group).getByRole('radio', { name: 'Countries' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Everyone')).toBeInTheDocument()
  })

  it('move with the arrow keys from one waiting tab to the next, the focus kept', () => {
    answers({ waits: ['referrer', 'country'] })
    render(<Tab />)
    const devicesTab = within(tabs()).getByRole('radio', { name: 'Devices' })
    devicesTab.focus()
    fireEvent.keyDown(devicesTab, { key: 'ArrowRight' })
    const sourcesTab = within(tabs()).getByRole('radio', { name: 'Sources' })
    expect(sourcesTab).toHaveAttribute('aria-checked', 'true')
    expect(document.activeElement).toBe(sourcesTab)
    fireEvent.keyDown(sourcesTab, { key: 'ArrowRight' })
    const countriesTab = within(tabs()).getByRole('radio', { name: 'Countries' })
    expect(countriesTab).toHaveAttribute('aria-checked', 'true')
    expect(document.activeElement).toBe(countriesTab)
  })

  it('stay after a tab that failed, so another can be pressed', () => {
    answers({ fails: ['referrer'] })
    render(<Tab />)
    fireEvent.click(within(tabs()).getByRole('radio', { name: 'Sources' }))
    expect(panel()).toHaveAttribute('data-page-scroll', 'failed')
    expect(screen.getByText('Could not load scroll depth')).toBeInTheDocument()
    expect(within(tabs()).getByRole('radio', { name: 'Sources' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(tabs()).getByRole('radio', { name: 'Devices' }))
    expect(screen.queryByText('Could not load scroll depth')).toBeNull()
    expect(screen.getByText('Mobile')).toBeInTheDocument()
  })

  it('forget Everyone\'s row once the range is another: that row was read for the range before', () => {
    mockUsePageScroll.mockImplementation((_site: string, _path: string, by: string, start: string) =>
      start === '2026-11-01' ? { data: { ...devices, by }, isLoading: false } : { data: undefined, isLoading: true })
    const { rerender } = render(<Tab />)
    expect(screen.getByText('Everyone')).toBeInTheDocument()
    rerender(<Tab start="2026-10-01" />)
    expect(panel()).toHaveAttribute('data-page-scroll', 'loading')
    expect(screen.queryByText('Everyone')).toBeNull()
    expect(tabs()).toBeInTheDocument()
  })

  it('start on the dimension the page holds', () => {
    answers()
    render(<ScrollWho {...props} by="country" onBy={() => {}} />)
    expect(mockUsePageScroll.mock.calls.at(-1)?.[2]).toBe('country')
    expect(within(tabs()).getByRole('radio', { name: 'Countries' })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('the tab', () => {
  it('asks ONE read: the page, the tab\'s dimension, the range and the page\'s own filters', () => {
    render(<Tab />)
    expect(mockUsePageScroll).toHaveBeenCalledWith('s', '/pricing', 'device', '2026-11-01', '2026-11-30', 'v2:country|is|NO', undefined)
    expect(new Set(mockUsePageScroll.mock.calls.map((c) => c.slice(1, 3).join('|')))).toEqual(new Set(['/pricing|device']))
  })

  it('draws everyone and each device, and names the furthest reader', () => {
    render(<Tab />)
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
    render(<Tab />)
    fireEvent.pointerEnter(document.querySelector('[data-who-cell="1-3"]') as HTMLElement, { pointerType: 'mouse' })
    const headline = document.querySelector('[data-who-headline]') as HTMLElement
    expect(headline).toHaveTextContent('Mobile, the end')
    expect(headline).toHaveTextContent('120 of 600 visits · 20%')
    fireEvent.pointerLeave(document.querySelector('[data-who-grid]') as HTMLElement)
    expect(headline).toHaveTextContent('Desktop')
  })

  it('does not draw another tab\'s rows under this tab\'s name while its own read is on the way', () => {
    render(<Tab />)
    // The switch moves to Sources; the read in hand is still the devices'.
    fireEvent.click(screen.getByRole('radio', { name: 'Sources' }))
    expect(mockUsePageScroll.mock.calls.at(-1)?.[2]).toBe('referrer')
    expect(screen.queryByText('Mobile')).toBeNull()
    expect(screen.getByText('Everyone')).toBeInTheDocument()
    expect(document.querySelector('[data-who-headline]')).toHaveAttribute('data-who-ready', 'no')
  })

  it('shows its skeleton, and no figure, until the first answer, with its tabs already there', () => {
    mockUsePageScroll.mockReturnValue({ data: undefined, isLoading: true })
    render(<Tab />)
    expect(panel()).toHaveAttribute('data-page-scroll', 'loading')
    expect(screen.queryByText('Everyone')).toBeNull()
    expect(within(tabs()).getByRole('radio', { name: 'Devices' })).toHaveAttribute('aria-checked', 'true')
  })

  it('says a failed read failed, and draws no rows that would wait for good', () => {
    mockUsePageScroll.mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom') })
    render(<Tab />)
    expect(screen.getByText('Could not load scroll depth')).toBeInTheDocument()
    expect(screen.queryByText('Everyone')).toBeNull()
  })

  it('says a range the server will not break down as a limit, with what lifts it', () => {
    mockUsePageScroll.mockReturnValue({ data: undefined, isLoading: false, error: new ApiError('refused', 422, { error: 'refused' }) })
    const { unmount } = render(<Tab />)
    expect(document.querySelector('[data-page-scroll="refused"]')).not.toBeNull()
    expect(screen.getByText("Scroll depth can't be shown for this range")).toBeInTheDocument()
    expect(screen.getByText('Choose a shorter range or remove a filter.')).toBeInTheDocument()
    expect(screen.queryByText('Could not load scroll depth')).toBeNull()
    unmount()
    // With no filter to remove, only the range is named.
    render(<Tab filters={undefined} />)
    expect(screen.getByText('Choose a shorter range.')).toBeInTheDocument()
  })

  it('keeps the plain failure for every other error, a server fault included', () => {
    mockUsePageScroll.mockReturnValue({ data: undefined, isLoading: false, error: new ApiError('down', 503) })
    render(<Tab />)
    expect(document.querySelector('[data-page-scroll="failed"]')).not.toBeNull()
    expect(screen.getByText('Could not load scroll depth')).toBeInTheDocument()
  })

  it('says so where too few visits scrolled to name anyone', () => {
    mockUsePageScroll.mockReturnValue({ data: { by: 'device', all: depth(12, 2), rows: [{ value: 'mobile', depth: depth(12, 2) }] }, isLoading: false })
    render(<Tab />)
    expect(screen.getByText('Not enough visits in this range to say who reads furthest.')).toBeInTheDocument()
  })
})
