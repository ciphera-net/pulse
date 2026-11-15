import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import GoalStats from '@/components/dashboard/GoalStats'
import ContentSignals from '@/components/dashboard/ContentSignals'
import { DashboardFrameProvider } from '@/lib/dashboard/frame'

// ---------------------------------------------------------------------------
// An opened event follows the page's filters (15-11-2026).
//
// The events list is filtered by the server. An opened event read its properties with the dates alone, so under a
// filter the row read one number and the values under it added up to another (measured on the demo with "device is
// mobile": 1,217 on the row, 2,019 under it). The list now hands the page's filters to both property reads, and what
// it fetched belongs to one window under one set of filters: a filter change closes what was open, so no value
// read under the old filters is ever shown under the new ones.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  getEventPropertyKeys: vi.fn(),
  getEventPropertyValues: vi.fn(),
  usePagePreview: vi.fn(),
}))

vi.mock('@/lib/api/stats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/stats')>()),
  getEventPropertyKeys: (...a: unknown[]) => h.getEventPropertyKeys(...a),
  getEventPropertyValues: (...a: unknown[]) => h.getEventPropertyValues(...a),
}))
vi.mock('@/lib/swr/dashboard', () => ({
  usePagePreview: (...a: unknown[]) => h.usePagePreview(...a),
}))

const dateRange = { start: '2026-10-17', end: '2026-11-15' }
const events = [
  { event_name: 'signup', count: 1217, visitors: 1098 },
  { event_name: 'purchase', count: 251, visitors: 251 },
]
const MOBILE = 'v2:device|is|mobile'
const NORWAY = 'v2:country|is|NO'

const row = (name: string) => screen.getAllByTestId('goal-row').find((r) => r.textContent?.startsWith(name)) as HTMLElement
const press = async (name: string) => { await act(async () => { fireEvent.click(row(name)) }) }
const open = () => screen.getAllByTestId('goal-row').filter((r) => r.getAttribute('aria-expanded') === 'true').length
/** The filters argument of the latest call: the last parameter of each fetcher. */
const keysFilters = () => h.getEventPropertyKeys.mock.calls.at(-1)?.[5]
const valuesFilters = () => h.getEventPropertyValues.mock.calls.at(-1)?.[8]

beforeEach(() => {
  h.usePagePreview.mockReset().mockReturnValue({ data: null })
  h.getEventPropertyKeys.mockReset().mockResolvedValue([{ key: 'plan', count: 1217 }])
  h.getEventPropertyValues.mockReset().mockResolvedValue([{ value: 'pro', count: 800 }, { value: 'team', count: 417 }])
})

describe("an opened event's properties follow the page's filters", () => {
  it('both reads are sent the filters the list was given', async () => {
    render(<GoalStats goalCounts={events} siteId="site-1" dateRange={dateRange} bare filters={MOBILE} />)
    await press('signup')
    expect(h.getEventPropertyKeys).toHaveBeenCalledTimes(1)
    expect(h.getEventPropertyKeys.mock.calls[0].slice(1)).toEqual(['signup', dateRange.start, dateRange.end, undefined, MOBILE])
    expect(h.getEventPropertyValues).toHaveBeenCalledTimes(1)
    expect(h.getEventPropertyValues.mock.calls[0].slice(1)).toEqual(['signup', 'plan', dateRange.start, dateRange.end, 20, undefined, undefined, MOBILE])
    expect(screen.getByText('pro')).toBeInTheDocument()
  })

  it('with no filter on the page neither read is sent one (the control)', async () => {
    render(<GoalStats goalCounts={events} siteId="site-1" dateRange={dateRange} bare />)
    await press('signup')
    expect(keysFilters()).toBeUndefined()
    expect(valuesFilters()).toBeUndefined()
  })

  it('in a live window the filters travel with the minutes', async () => {
    render(<GoalStats goalCounts={events} siteId="site-1" dateRange={dateRange} bare liveMinutes={5} filters={MOBILE} />)
    await press('signup')
    expect(h.getEventPropertyKeys.mock.calls[0].slice(1)).toEqual(['signup', dateRange.start, dateRange.end, 5, MOBILE])
    expect(h.getEventPropertyValues.mock.calls[0].slice(1)).toEqual(['signup', 'plan', dateRange.start, dateRange.end, 20, undefined, 5, MOBILE])
  })

  it('a filter change closes the opened event and drops what was read under the old filters', async () => {
    const { rerender } = render(<GoalStats goalCounts={events} siteId="site-1" dateRange={dateRange} bare filters={MOBILE} />)
    await press('signup')
    expect(open()).toBe(1)
    expect(screen.getByText('pro')).toBeInTheDocument()

    // Another filter: the list is another list now, and nothing read under the old one may stay on screen.
    h.getEventPropertyValues.mockResolvedValue([{ value: 'free', count: 90 }])
    rerender(<GoalStats goalCounts={events} siteId="site-1" dateRange={dateRange} bare filters={NORWAY} />)
    // Closed at once (the row says so); its panel leaves with the closing motion, as for any closed row.
    expect(open()).toBe(0)
    await waitFor(() => expect(screen.queryByText('pro')).not.toBeInTheDocument())

    // Opened again, it is read again, under the new filters: the old answer was not kept.
    await press('signup')
    expect(h.getEventPropertyKeys).toHaveBeenCalledTimes(2)
    expect(keysFilters()).toBe(NORWAY)
    expect(valuesFilters()).toBe(NORWAY)
    expect(screen.getByText('free')).toBeInTheDocument()
    expect(screen.queryByText('pro')).not.toBeInTheDocument()
  })

  it('taking the filter away does the same', async () => {
    const { rerender } = render(<GoalStats goalCounts={events} siteId="site-1" dateRange={dateRange} bare filters={MOBILE} />)
    await press('signup')
    rerender(<GoalStats goalCounts={events} siteId="site-1" dateRange={dateRange} bare />)
    expect(open()).toBe(0)
    await press('signup')
    expect(h.getEventPropertyKeys).toHaveBeenCalledTimes(2)
    expect(keysFilters()).toBeUndefined()
  })

  it('the same filters again keep an opened event open (a re-render is not a change)', async () => {
    const { rerender } = render(<GoalStats goalCounts={events} siteId="site-1" dateRange={dateRange} bare filters={MOBILE} />)
    await press('signup')
    rerender(<GoalStats goalCounts={[...events]} siteId="site-1" dateRange={{ ...dateRange }} bare filters={MOBILE} />)
    expect(open()).toBe(1)
    expect(h.getEventPropertyKeys).toHaveBeenCalledTimes(1)
  })
})

describe('the Events block hands its filters to its list', () => {
  it('in the new frame', async () => {
    render(
      <DashboardFrameProvider>
        <ContentSignals goalCounts={events} siteId="site-1" dateRange={dateRange} filters={MOBILE} />
      </DashboardFrameProvider>,
    )
    await press('signup')
    expect(keysFilters()).toBe(MOBILE)
    expect(valuesFilters()).toBe(MOBILE)
  })

  it("in today's arrangement, on its Events tab", async () => {
    render(<ContentSignals goalCounts={events} siteId="site-1" dateRange={dateRange} filters={MOBILE} />)
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'Events' })) })
    await press('signup')
    expect(keysFilters()).toBe(MOBILE)
    expect(valuesFilters()).toBe(MOBILE)
  })
})
