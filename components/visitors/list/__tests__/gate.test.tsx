import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// The new Visitors page is in beta (new-visitors): a team with the flag gets the list, every other team today's roster,
// and while the answer is on its way neither is drawn.

let feature: boolean | null = null
vi.mock('@/lib/features', () => ({ useFeature: (flag: string) => (flag === 'new-visitors' ? feature : false) }))
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'site-1' }) }))
vi.mock('@/components/visitors/VisitorsRoster', () => ({ default: () => <div data-roster="" /> }))
vi.mock('@/components/visitors/list/VisitorsListPage', () => ({ default: ({ siteId }: { siteId: string }) => <div data-list={siteId} /> }))

import VisitorsPage from '@/app/sites/[id]/visitors/page'
import { BETAS } from '@/lib/betas'

beforeEach(() => {
  feature = null
})

describe('the Visitors page gate', () => {
  it('waits for the answer and draws neither page meanwhile', () => {
    render(<VisitorsPage />)
    expect(document.querySelector('[data-visitors-gate="waiting"]')).not.toBeNull()
    expect(document.querySelector('[data-roster]')).toBeNull()
    expect(document.querySelector('[data-list]')).toBeNull()
  })

  it('draws the new page for a team in the beta', () => {
    feature = true
    render(<VisitorsPage />)
    expect(document.querySelector('[data-list]')?.getAttribute('data-list')).toBe('site-1')
    expect(document.querySelector('[data-roster]')).toBeNull()
  })

  it('keeps the roster for every other team', () => {
    feature = false
    render(<VisitorsPage />)
    expect(document.querySelector('[data-roster]')).not.toBeNull()
  })

  it('is listed among the betas the Beta tab names', () => {
    expect(BETAS.find((b) => b.flag === 'new-visitors')?.name).toBe('New Visitors page')
  })
})
