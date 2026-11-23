import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// The Visitors page went to every team on 23-11-2026: the route draws the list on the route's site and asks about no
// beta (until then a team without the flag `new-visitors` got the roster it replaced).

const useFeature = vi.fn()
vi.mock('@/lib/features', () => ({ useFeature: (flag: string) => useFeature(flag) }))
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'site-1' }) }))
vi.mock('@/components/visitors/list/VisitorsListPage', () => ({ default: ({ siteId }: { siteId: string }) => <div data-list={siteId} /> }))

import VisitorsPage from '@/app/sites/[id]/visitors/page'
import { BETAS } from '@/lib/betas'

describe('the Visitors page', () => {
  it('draws the list on the route\'s site, asking about no beta', () => {
    render(<VisitorsPage />)
    expect(document.querySelector('[data-list]')?.getAttribute('data-list')).toBe('site-1')
    expect(document.querySelector('[data-visitors-gate]')).toBeNull()
    expect(useFeature).not.toHaveBeenCalled()
  })

  it('is no longer among the betas the Beta tab names', () => {
    expect(BETAS.some((b) => b.flag === 'new-visitors')).toBe(false)
  })
})
