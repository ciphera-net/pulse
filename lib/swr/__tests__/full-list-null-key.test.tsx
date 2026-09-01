import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { useFullDimensionList } from '@/lib/swr/dashboard'
import type { TopReferrer } from '@/lib/api/stats'

// The frozen-blocks bug (01-09-2026): useFullDimensionList carried
// keepPreviousData, and a card whose list stops overflowing on a range switch
// passes a NULL kind — with keepPreviousData, SWR retains the OLD RANGE's
// rows on the null key forever, and the card kept ranking them above the
// fresh fan-out. This test pins the contract: a null kind returns NO data,
// whatever was loaded before.

vi.mock('@/lib/api/stats', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/api/stats')>()
  return {
    ...mod,
    getTopReferrers: vi.fn(async () => [
      { referrer: 'google.com', pageviews: 10, visitors: 8 },
      { referrer: 'bing.com', pageviews: 4, visitors: 3 },
    ]),
  }
})

function Probe({ kind }: { kind: 'referrers' | null }) {
  const { data } = useFullDimensionList<TopReferrer>(kind, 'site-1', '2026-08-01', '2026-08-30', 100)
  return <div data-testid="probe">{data ? `rows:${data.length}` : 'no-data'}</div>
}

describe('useFullDimensionList null-key contract', () => {
  it('drops to no-data when the kind becomes null, even after a successful load', async () => {
    const { rerender } = render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <Probe kind="referrers" />
      </SWRConfig>,
    )
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('rows:2'))

    rerender(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <Probe kind={null} />
      </SWRConfig>,
    )
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('no-data'))
  })
})
