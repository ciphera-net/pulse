import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { CdnLiveCard } from '../CdnLiveCard'
import type { BunnyLiveResponse } from '@/lib/api/bunny'

const mockUseBunnyLive = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useBunnyLive: (siteId: string) => mockUseBunnyLive(siteId),
}))

const hour = (requests: number): BunnyLiveResponse['hours'][number] => ({
  hour: '2026-08-14T05:00:00Z',
  bandwidth: requests * 1000,
  bandwidth_cached: requests * 900,
  requests,
  requests_cached: Math.round(requests * 0.75),
  error_3xx: 0,
  error_4xx: 0,
  error_5xx: 0,
  origin_response_ms: null,
})

const liveData = (bars: number[]): BunnyLiveResponse => ({
  hours: bars.map(hour),
  in_progress: null,
  totals: {
    requests: bars.reduce((a, b) => a + b, 0),
    requests_cached: 300,
    bandwidth: 1000,
    bandwidth_cached: 900,
    error_4xx: 7,
    error_5xx: 0,
  },
  range: { start: '2026-08-13T06:00:00Z', end: '2026-08-14T06:00:00Z' },
})

afterEach(() => {
  cleanup()
  mockUseBunnyLive.mockReset()
})

describe('CdnLiveCard failure honesty', () => {
  it('renders the live label with healthy data', () => {
    mockUseBunnyLive.mockReturnValue({ data: liveData([100, 200]), error: undefined })
    render(<CdnLiveCard siteId="s" />)
    expect(screen.getByText('live · hours are UTC')).toBeTruthy()
  })

  it('cold failure ghosts the rails with the unavailable line', () => {
    mockUseBunnyLive.mockReturnValue({ data: undefined, error: { status: 502 } })
    render(<CdnLiveCard siteId="s" />)
    expect(screen.getByText('live view unavailable — daily data above is unaffected')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
  })

  it('a failure AFTER a successful load never claims live — stale is labeled', () => {
    // * SWR keeps the previous data when a revalidation fails; the card must
    // * not present that frozen window under the "live" label.
    mockUseBunnyLive.mockReturnValue({ data: liveData([100, 200]), error: { status: 502 } })
    render(<CdnLiveCard siteId="s" />)
    expect(screen.getByText('live update failing — showing the last loaded window')).toBeTruthy()
    expect(screen.queryByText('live · hours are UTC')).toBeNull()
  })
})

describe('CdnLiveCard bars', () => {
  it('a zero-request hour paints nothing — no fabricated 2px floor', () => {
    mockUseBunnyLive.mockReturnValue({ data: liveData([0, 100, 0, 50]), error: undefined })
    const { container } = render(<CdnLiveCard siteId="s" />)
    const bars = [...container.querySelectorAll('div[style*="height"]')] as HTMLElement[]
    expect(bars.length).toBe(4)
    expect(bars[0].style.height).toBe('0px')
    expect(bars[1].style.height).toBe('24px')
    expect(bars[2].style.height).toBe('0px')
    expect(bars[3].style.height).toBe('12px')
  })
})
