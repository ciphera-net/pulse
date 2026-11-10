// The Analyst screen follows the team's barry flag (PUL-78). The flag decides what the screen shows, not what is
// allowed: pulse-backend answers 404 to every Analyst route for a team without it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The page itself (and assistant-ui) loads through next/dynamic; here it is a marker.
vi.mock('next/dynamic', () => ({
  default: () => (props: { siteId: string }) => <div data-testid="analyst-page">{props.siteId}</div>,
}))
const replace = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))
let barry: boolean | null = null
vi.mock('@/lib/features', () => ({ useFeature: (flag: string) => (flag === 'barry' ? barry : false) }))

import AnalystRoute from '../AnalystRoute'

beforeEach(() => {
  replace.mockReset()
  barry = null
})

describe('AnalystRoute', () => {
  it('shows nothing and sends nobody away until /me has answered', () => {
    const { container } = render(<AnalystRoute siteId="s1" />)
    expect(container).toBeEmptyDOMElement()
    expect(replace).not.toHaveBeenCalled()
  })

  it("sends a team without the beta to the site's dashboard, showing nothing on the way", () => {
    barry = false
    const { container } = render(<AnalystRoute siteId="s1" />)
    expect(container).toBeEmptyDOMElement()
    expect(replace).toHaveBeenCalledWith('/sites/s1')
  })

  it('shows the page for a team in the beta', () => {
    barry = true
    render(<AnalystRoute siteId="s1" />)
    expect(screen.getByTestId('analyst-page').textContent).toBe('s1')
    expect(replace).not.toHaveBeenCalled()
  })
})
