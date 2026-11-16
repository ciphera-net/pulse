// The Analyst screen (PUL-78) is for every team since 16-11-2026: the route shows the page for the site it names, with
// no flag to wait for.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// The page itself (and assistant-ui) loads through next/dynamic; here it is a marker.
vi.mock('next/dynamic', () => ({
  default: () => (props: { siteId: string }) => <div data-testid="analyst-page">{props.siteId}</div>,
}))

import AnalystRoute from '../AnalystRoute'

describe('AnalystRoute', () => {
  it('shows the page for the site it names, at once', () => {
    render(<AnalystRoute siteId="s1" />)
    expect(screen.getByTestId('analyst-page').textContent).toBe('s1')
  })
})
