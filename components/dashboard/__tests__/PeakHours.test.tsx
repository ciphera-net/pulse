import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PeakHours from '@/components/dashboard/PeakHours'
import type { DailyStat } from '@/lib/api/stats'

// PeakHours moved from an imperative fetch (whose failure rendered as "too
// early to tell" — F17's fabricated explanation) onto useDailyStats. These
// tests pin the hook contract (hour interval + filters, F14) and the three
// honest states.
const useDailyStats = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useDailyStats: (...args: unknown[]) => useDailyStats(...args),
}))

const hour = (date: string, pageviews: number): DailyStat => ({
  date, pageviews, visitors: Math.max(1, Math.floor(pageviews / 2)),
  bounce_rate: 50, avg_duration: 60, avg_scroll_depth: 55, avg_visible_duration: 20,
})

const dateRange = { start: '2026-08-11', end: '2026-08-18' }

beforeEach(() => {
  useDailyStats.mockReset()
})

describe('PeakHours', () => {
  it('requests hourly buckets with the active filters (F14)', () => {
    useDailyStats.mockReturnValue({ data: [], error: undefined, isLoading: false, mutate: vi.fn() })
    render(<PeakHours siteId="site-1" dateRange={dateRange} filters="country:is:DE" />)
    expect(useDailyStats).toHaveBeenCalledWith('site-1', '2026-08-11', '2026-08-18', 'hour', 'country:is:DE')
  })

  it('renders the grid when data arrives', () => {
    useDailyStats.mockReturnValue({
      data: [hour('2026-08-17T14:00:00+02:00', 12), hour('2026-08-17T16:00:00+02:00', 4)],
      error: undefined, isLoading: false, mutate: vi.fn(),
    })
    render(<PeakHours siteId="site-1" dateRange={dateRange} />)
    expect(screen.getByText('Mon')).toBeTruthy()
    expect(screen.queryByText('Too early to tell')).toBeNull()
  })

  it('renders an error with retry — never the empty-state explanation — on failure', () => {
    const mutate = vi.fn()
    useDailyStats.mockReturnValue({ data: undefined, error: new Error('boom'), isLoading: false, mutate })
    render(<PeakHours siteId="site-1" dateRange={dateRange} />)
    expect(screen.getByText(/Couldn.t load peak hours/)).toBeTruthy()
    expect(screen.queryByText('Too early to tell')).toBeNull()
    fireEvent.click(screen.getByText('Retry'))
    expect(mutate).toHaveBeenCalled()
  })

  it('keeps the honest empty state when the fetch succeeds with no traffic', () => {
    useDailyStats.mockReturnValue({ data: [], error: undefined, isLoading: false, mutate: vi.fn() })
    render(<PeakHours siteId="site-1" dateRange={dateRange} />)
    expect(screen.getByText('Too early to tell')).toBeTruthy()
  })
})
